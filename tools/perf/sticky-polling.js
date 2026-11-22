// Repro: after a reconnect whose websocket attempt errors, the page stays on long-polling.
const path = require('path'); const REPO = process.env.REPO;
const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));
const B = process.argv[2]; const sleep = (ms) => new Promise(r => setTimeout(r, ms)); const uniq = Date.now().toString(36).slice(-6);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const userA = (await (await ctxA.request.post(B + '/api/auth/register', { data: { username: 'sa' + uniq, password: 'Passw0rd!x', displayName: 'StA' } })).json()).user;
  await ctxA.addInitScript((u) => { localStorage.setItem('gvn_user', JSON.stringify({ userId: u.userId, displayName: u.displayName, isGuest: false })); }, userA);
  const ctxB = await browser.newContext();
  const userB = (await (await ctxB.request.post(B + '/api/auth/register', { data: { username: 'sb' + uniq, password: 'Passw0rd!x', displayName: 'StB' } })).json()).user;
  console.log('reg ok', !!userA, !!userB);
  const BB = 'http://localhost:3117'; const sb = ioc(BB, { transports: ['websocket'], extraHeaders: { cookie: (await ctxB.cookies()).map(c => `${c.name}=${c.value}`).join('; '), origin: BB } }); sb.on('connect_error', (e) => console.log('bot err', e.message));
  await new Promise((res) => sb.on('connect', res));
  const roomId = await new Promise((res) => { sb.once('room:joined', (d) => res(d.roomId)); sb.emit('room:create', { settings: { boardSize: 15, timerMode: 'per_game', timerSeconds: 3600, roomName: 's', ranked: false } }); });
  console.log('room', roomId); sb.emit('room:sit', { slot: 1 });
  const page = await ctxA.newPage(); const cdp = await ctxA.newCDPSession(page);
  let wsBroken = false;
  await ctxA.addInitScript(() => { const W = window.WebSocket; window.__wsBroken = false; window.WebSocket = function (url, p) { if (window.__wsBroken) { url = url.replace(/:\/\/[^/]+/, '://127.0.0.1:9'); } return p ? new W(url, p) : new W(url); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.text().slice(0, 200)); }); page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('NAV', f.url()); });
  await page.goto(B + '/room.html?id=' + encodeURIComponent(roomId));
  await page.waitForFunction(() => window.RoomClient && window.RoomClient.socket && window.RoomClient.socket.connected, null, { timeout: 20000 });
  const tr = () => page.evaluate(() => { const s = window.RoomClient.socket; return s.connected ? s.io.engine.transport.name : 'down'; });
  console.log('t0 transport:', await tr());
  async function measure(label) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.evaluate(() => { window.__rx = []; window.RoomClient.socket.on('chat:message', (m) => { if (/^m\d/.test(m.text)) window.__rx.push([m.text, Date.now()]); }); });
    const sent = {}; const up = [];
    sb.on('chat:message', (m) => { if (/^u\d/.test(m.text)) up.push(Date.now() - sent[m.text]); });
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 3; j++) { const k = 'm' + i + j + label; sent[k] = Date.now(); sb.emit('chat:message', { text: k }); await sleep(15); } await sleep(800);
      const u = 'u' + i + label; sent[u] = Date.now(); await page.evaluate((u) => window.RoomClient.emit('chat:message', { text: u }), u); await sleep(800);
    }
    const rx = await page.evaluate(() => window.__rx);
    const down = rx.map(([k, t]) => t - sent[k]);
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    console.log(label, 'transport=' + await tr(), 'server->page median ms', med(down), JSON.stringify(down), '| page->server->bot median ms', med(up), JSON.stringify(up));
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  await measure('WS');

  // #434 fix check: REUP_MS=<ms> shortens the client's re-upgrade backoff for this run.
  const REUP = +process.env.REUP_MS || 0;
  if (REUP) await page.evaluate((ms) => { window.SocketClient.REUPGRADE_DELAYS_MS = [ms, ms, ms]; window.SocketClient.REUPGRADE_RECHECK_MS = 1000; }, REUP);
  // 1) websocket path breaks (blocked = handshake error), then the link drops
  await page.evaluate(() => { window.__wsBroken = true; });
  await page.evaluate(() => window.RoomClient.socket.io.engine.close()); // simulate a drop
  for (let i = 0; i < 60; i++) { await sleep(250); if ((await tr()) !== 'down') break; }
  console.log('after reconnect (ws broken):', await tr());
  await sleep(3000);
  // 2) path heals
  await page.evaluate(() => { window.__wsBroken = false; });
  for (const s of [5]) { await sleep(s * 1000 - (s === 5 ? 0 : (s === 30 ? 5000 : 30000))); console.log(`${s}s after ws path healed:`, await tr()); }
  if (REUP) {
    const t0 = Date.now(); let last = '';
    while (Date.now() - t0 < REUP * 3 + 15000) { last = await tr(); if (last === 'websocket') break; await sleep(250); }
    console.log(`re-upgrade (#434): ${last} after ${Date.now() - t0} ms more, no reload; banner visible:`,
      await page.evaluate(() => !!document.querySelector('#status-banner.visible')));
  }
  await measure('POLL');
  await page.reload(); await page.waitForFunction(() => window.RoomClient && window.RoomClient.socket && window.RoomClient.socket.connected, null, { timeout: 20000 }); await sleep(1500);
  console.log('after reload:', await tr());
  sb.close(); await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
