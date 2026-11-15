// Run: SP=<scratch> tools/perf/room-join-timing.sh <label> reload — CHROME=<chromium binary> if Playwright's pinned revision is absent
// #391: a SEATED player reloads room.html mid-game (2 stones down). The early socket connects before room-socket.js
// registers its handlers, so the server's on-connect pushes (room:joined / grace resume) can land unheard; the page must
// still rebuild from its own room:join. Checks board, clock, overlay, one io(), no page errors. Prints JSON.
const path = require('path');
const REPO = process.env.REPO, B = process.env.BASE, RUNS = +(process.env.RUNS || 3);
const LAT = +(process.env.LATENCY || 150), KBPS = +(process.env.KBPS || 1250), CPU = +(process.env.CPU || 4);
const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function guest() {
  const r = await fetch(B + '/api/auth/guest', { method: 'POST', headers: { origin: B } });
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const user = (await r.json()).user;
  const s = ioc(B, { transports: ['websocket'], extraHeaders: { cookie, origin: B }, forceNew: true });
  await new Promise((ok, ko) => { s.on('connect', ok); s.on('connect_error', ko); });
  return { s, user };
}
const HOOK = () => {
  let real; window.__ioCalls = 0;
  Object.defineProperty(window, 'io', { configurable: true, get() { return real; }, set(v) {
    real = function (...a) { window.__ioCalls++; const s = v.apply(this, a); s.once('connect', () => performance.mark('connect'));
      s.onAny((ev) => { (window.__early = window.__early || []).push([ev, Math.round(performance.now())]); }); return s; };
    Object.assign(real, v);
  } });
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const out = { label: process.env.LABEL, runs: [] };
  for (let i = 0; i < RUNS; i++) {
    const bot = await guest();
    const roomId = await new Promise((ok) => { bot.s.once('room:joined', d => ok(d.roomId)); bot.s.emit('room:create', { settings: { boardSize: 15, timerMode: 'per_game', timerSeconds: 600, ranked: false } }); });
    bot.s.emit('room:sit', { slot: 1 });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(B + '/login.html'); await page.click('#btn-guest'); await page.waitForURL(u => !/login/.test(u.toString()));
    await page.addInitScript(HOOK);
    await page.goto(`${B}/room.html?id=${encodeURIComponent(roomId)}`);
    await page.waitForFunction(() => window.RoomState && window.RoomState.roomData, null, { timeout: 15000 });
    await page.evaluate(() => window.RoomClient.emit('room:sit', { slot: 2 })); await sleep(400);
    const inited = new Promise(ok => bot.s.once('game:init', ok));
    bot.s.emit('room:ready'); await page.evaluate(() => window.RoomClient.emit('room:ready'));
    const init = await Promise.race([inited, sleep(8000).then(() => null)]);
    if (!init) throw new Error('game did not start');
    // two stones: whoever is to move first, then the other
    const play = async (who, x, y) => { const moved = new Promise(ok => bot.s.once('game:moved', ok));
      if (who === 'bot') bot.s.emit('game:move', { x, y, moveId: `m${x}` }); else await page.evaluate(([x, y]) => window.RoomClient.emit('game:move', { x, y, moveId: 'm' + x }), [x, y]);
      await Promise.race([moved, sleep(4000)]); };
    const botFirst = init.currentTurn === bot.user.userId;
    await play(botFirst ? 'bot' : 'page', 7, 7); await play(botFirst ? 'page' : 'bot', 8, 8);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: KBPS * 1024, uploadThroughput: KBPS * 512 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.reload();
    await sleep(4000);
    const r = await page.evaluate(() => {
      const st = window.RoomState || {}; const rd = st.roomData || {};
      const gs = rd.gameState || st.gameState || null;
      const ov = document.getElementById('room-entry-overlay');
      return {
        ioCalls: window.__ioCalls, shared: window.RoomClient === window.__gvnSharedClient,
        connectAt: Math.round((performance.getEntriesByName('connect')[0] || {}).startTime || -1),
        early: (window.__early || []).slice(0, 8),
        overlayVisible: !!ov && ov.classList.contains('visible'),
        moves: gs && gs.moves ? gs.moves.length : (gs && gs.moveHistory ? gs.moveHistory.length : null),
        timerText: [...document.querySelectorAll('[class*="timer"], [id*="timer"]')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 4),
        status: rd.state || null,
      };
    });
    r.errs = errs;
    // the game must still be playable: side to move plays one stone, the other side sees it
    const moved = new Promise(ok => bot.s.once('game:moved', ok));
    await page.evaluate(() => window.RoomClient.emit('game:resync')); await sleep(300);
    const turnIsBot = await new Promise(ok => { bot.s.once('room:joined', d => ok(d.gameState && d.gameState.currentTurn === bot.user.userId)); bot.s.emit('game:resync'); setTimeout(() => ok(null), 3000); });
    if (turnIsBot) bot.s.emit('game:move', { x: 9, y: 9, moveId: 'm9' }); else await page.evaluate(() => window.RoomClient.emit('game:move', { x: 9, y: 9, moveId: 'm9' }));
    r.moveAfterReload = !!(await Promise.race([moved, sleep(4000).then(() => null)]));
    if (i === 0) await page.screenshot({ path: `${process.env.OUT}/${process.env.LABEL}-reload.png` });
    out.runs.push(r);
    await ctx.close(); bot.s.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
