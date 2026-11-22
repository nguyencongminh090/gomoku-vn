// Viewer page in a room; bot chats every 2 s; at t=10 s blackhole the page's live connection; log when chat flows again.
const path = require('path'); const REPO = process.env.REPO;
const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));
const B = 'http://localhost:3118', BB = 'http://localhost:3117'; const sleep = (ms) => new Promise(r => setTimeout(r, ms)); const uniq = Date.now().toString(36).slice(-6);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctxA = await browser.newContext(); const userA = (await (await ctxA.request.post(B + '/api/auth/register', { data: { username: 'va' + uniq, password: 'Passw0rd!x', displayName: 'Viewer' } })).json()).user;
  await ctxA.addInitScript((u) => { localStorage.setItem('gvn_user', JSON.stringify({ userId: u.userId, displayName: u.displayName, isGuest: false })); }, userA);
  const ctxB = await browser.newContext(); await ctxB.request.post(BB + '/api/auth/register', { data: { username: 'vb' + uniq, password: 'Passw0rd!x', displayName: 'Bot' } });
  const sb = ioc(BB, { transports: ['websocket'], extraHeaders: { cookie: (await ctxB.cookies()).map(c => `${c.name}=${c.value}`).join('; '), origin: BB } });
  await new Promise((res) => sb.on('connect', res));
  const roomId = await new Promise((res) => { sb.once('room:joined', (d) => res(d.roomId)); sb.emit('room:create', { settings: { boardSize: 15, timerMode: 'per_game', timerSeconds: 3600, roomName: 'v', ranked: false } }); });
  const page = await ctxA.newPage(); page.on('console', (m) => { if (/^\[T\]/.test(m.text())) console.log(m.text()); });
  await page.goto(B + '/room.html?id=' + encodeURIComponent(roomId));
  await page.waitForFunction(() => window.RoomClient && window.RoomClient.socket && window.RoomClient.socket.connected, null, { timeout: 30000 });
  await page.evaluate(() => { const t0 = Date.now(); const s = window.RoomClient.socket; window.__t0 = t0;
    s.on('chat:message', (m) => { if (/^c/.test(m.text)) console.log('[T] rx', m.text, 'at', ((Date.now() - window.__bh) / 1000).toFixed(1)); });
    s.on('disconnect', (r) => console.log('[T] disconnect', r, 'at', ((Date.now() - window.__bh) / 1000).toFixed(1)));
    s.on('connect', () => console.log('[T] connect at', ((Date.now() - window.__bh) / 1000).toFixed(1))); });
  let i = 0; const chat = setInterval(() => sb.emit('chat:message', { text: 'c' + (i++) }), 2000);
  await sleep(6000);
  await page.evaluate(() => { window.__bh = Date.now(); }); process.kill(+process.env.PROXY, 'SIGUSR2');
  await sleep(1000); await page.evaluate(() => { const i = document.getElementById('chat-input'); i.value = 'c-own'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }); // real send path (#435 ack+retry)
  await sleep(+process.env.WAIT || 80000);
  clearInterval(chat); sb.close(); await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
