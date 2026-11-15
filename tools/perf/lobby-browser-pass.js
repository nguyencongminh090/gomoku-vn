// Run: SP=<scratch> tools/perf/lobby-browser-pass.sh — CHROME=<chromium binary> if Playwright's pinned revision is absent
// #386 browser pass: lobby room paging ("Xem thêm"), online list "more"+search, room reconnect. Isolated server on :3117.
const path = require('path');
const REPO = process.env.REPO, B = 'http://localhost:3117', OUT = process.env.OUT;
const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const res = {};
async function guest() {
  const r = await fetch(B + '/api/auth/guest', { method: 'POST', headers: { origin: B } });
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const user = (await r.json()).user;
  const s = ioc(B, { transports: ['websocket'], extraHeaders: { cookie, origin: B }, forceNew: true });
  await new Promise((ok, ko) => { s.on('connect', ok); s.on('connect_error', ko); });
  return { s, user };
}
(async () => {
  const seeds = [];
  for (let i = 0; i < 12; i++) {
    const g = await guest();
    g.roomId = await new Promise((ok) => { g.s.once('room:joined', d => ok(d.roomId)); g.s.emit('room:create', { settings: { boardSize: 15, timerMode: 'per_game', timerSeconds: 600, ranked: false } }); });
    seeds.push(g);
  }
  const bot = seeds[0];
  bot.s.emit('room:sit', { slot: 1 });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  for (const [label, vp] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(B + '/login.html'); await page.click('#btn-guest'); await page.waitForURL(u => !/login/.test(u.toString()));
    await page.goto(B + '/index.html#rooms'); await sleep(2500);
    const cards = () => page.$$eval('#room-list > *', els => els.filter(e => e.dataset.roomId || e.querySelector('[data-room-id]') || /rcard/.test(e.className)).length);
    const r = res[label] = { errs };
    r.cardsBefore = await cards();
    r.moreBtn = await page.$eval('#rooms-more', b => ({ hidden: b.hidden, text: b.textContent })).catch(() => null);
    await page.screenshot({ path: `${OUT}/${label}-1-lobby.png`, fullPage: true });
    if (r.moreBtn && !r.moreBtn.hidden) { await page.click('#rooms-more'); await sleep(1200); }
    r.cardsAfter = await cards();
    r.moreAfter = await page.$eval('#rooms-more', b => ({ hidden: b.hidden, text: b.textContent })).catch(() => null);
    await page.screenshot({ path: `${OUT}/${label}-2-more.png`, fullPage: true });
    r.onlineCount = await page.$eval('#online-line-count', e => e.textContent).catch(() => null);
    await page.click('.online-line__title').catch(e => r.openErr = e.message.slice(0, 80)); await sleep(800);
    r.modalRows = await page.$$eval('#online-users-list li:not(.online-users-list__empty)', l => l.length);
    r.modalMore = await page.$eval('.online-users-list__more', e => e.textContent).catch(() => null);
    await page.screenshot({ path: `${OUT}/${label}-3-online.png` });
    const target = seeds[11].user.displayName;
    await page.fill('#online-users-search', target); await sleep(1500);
    r.searchFor = target;
    r.searchRows = await page.$$eval('#online-users-list li:not(.online-users-list__empty)', l => l.map(x => x.textContent.trim().slice(0, 40)));
    await page.screenshot({ path: `${OUT}/${label}-4-search.png` });
    await ctx.close();
  }
  // reconnect: browser plays the bot, its websocket is cut mid-game
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(B + '/login.html'); await page.click('#btn-guest'); await page.waitForURL(u => !/login/.test(u.toString()));
  const nav = []; page.on('framenavigated', f => { if (f === page.mainFrame()) nav.push(f.url()); });
  page.on('console', m => nav.push('console:' + m.text().slice(0, 120)));
  await page.goto(`${B}/room.html?id=${encodeURIComponent(bot.roomId)}`);
  await sleep(1000); nav.push('toast:' + await page.$eval('.toast, #toast', e => e.textContent).catch(() => '-'));
  res.nav = nav;
  await page.waitForFunction(() => window.RoomClient && window.RoomClient.socket && window.RoomClient.socket.connected, null, { timeout: 15000 }).catch(async (e) => { res.roomDebug = { url: page.url(), rc: await page.evaluate(() => ({ has: !!window.RoomClient, keys: window.RoomClient ? Object.keys(window.RoomClient) : null })) }; await page.screenshot({ path: OUT + '/room-fail.png' }); throw e; });
  await sleep(1500);
  const inited = new Promise(ok => bot.s.once('game:init', ok));
  await page.evaluate(() => window.RoomClient.emit('room:sit', { slot: 2 })); await sleep(500);
  bot.s.emit('room:ready'); await page.evaluate(() => window.RoomClient.emit('room:ready'));
  const init = await Promise.race([inited, sleep(8000).then(() => null)]);
  const rc = res.reconnect = { errs, gameStarted: !!init };
  const presence = [];
  bot.s.on('room:updated', d => { const us = d.users || []; const u = (Array.isArray(us) ? us : Object.values(us)).find(x => x.userId !== bot.user.userId); if (u) presence.push(u.presence); });
  const sid0 = await page.evaluate(() => window.RoomClient.socket.id);
  await page.evaluate(() => window.RoomClient.socket.io.engine.close());
  const t0 = Date.now();
  await page.waitForFunction((s) => window.RoomClient.socket.connected && window.RoomClient.socket.id !== s, sid0, { timeout: 20000 }).catch(() => {});
  rc.reconnectMs = Date.now() - t0;
  rc.connected = await page.evaluate(() => window.RoomClient.socket.connected);
  await sleep(2000);
  rc.presenceSeenByOpponent = presence;
  if (init) { // the side to move plays one stone; both sides must see it
    const browserUid = await page.evaluate(() => window.RoomState && (window.RoomState.myUserId || (window.RoomState.user && window.RoomState.user.userId)));
    const moved = new Promise(ok => bot.s.once('game:moved', ok));
    if (init.currentTurn === bot.user.userId) bot.s.emit('game:move', { x: 7, y: 7, moveId: 'rc-1' });
    else await page.evaluate(() => window.RoomClient.emit('game:move', { x: 7, y: 7, moveId: 'rc-1' }));
    rc.moveAfterReconnect = !!(await Promise.race([moved, sleep(5000).then(() => null)]));
    rc.browserUid = browserUid;
  }
  rc.overlay = await page.$eval('#room-entry-overlay', e => getComputedStyle(e).display !== 'none' && !e.hidden).catch(() => 'absent');
  await page.screenshot({ path: `${OUT}/reconnect.png` });
  await browser.close();
  console.log(JSON.stringify(res, null, 1));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify(res, null, 1)); console.error(e.message); process.exit(1); });
