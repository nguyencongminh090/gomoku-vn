// #413 live pass: node features/room-clock-mobile/live/pass.js <outdir>  (server on :3101 with its own DB)
const { chromium } = require('../../../node_modules/playwright');
const B = 'http://localhost:3101'; const OUT = process.argv[2] || __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36).slice(-4);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const errs = [];
  async function user(tag, displayName, w, h, mode = 'light') {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'vi-VN', hasTouch: w < 800, isMobile: w < 800, deviceScaleFactor: 2 });
    let u = null;
    if (displayName) {
      const res = await ctx.request.post(B + '/api/auth/register', { data: { username: tag + stamp, password: 'Passw0rd!x', displayName }, headers: { origin: B } });
      const j = await res.json(); if (!res.ok()) throw new Error('register ' + JSON.stringify(j));
      u = { userId: (j.user || j).userId, displayName, isGuest: false };
    }
    await ctx.addInitScript(([m, u]) => { localStorage.setItem('gvn_color_mode', m); if (u) localStorage.setItem('gvn_user', JSON.stringify(u)); }, [mode, u]);
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errs.push(tag + ': ' + m.text()); });
    p.on('pageerror', (e) => errs.push(tag + ' PAGEERROR: ' + e.message));
    if (!displayName) { await p.goto(B + '/login.html'); await p.click('#btn-guest'); await p.waitForURL((x) => !x.pathname.includes('login'), { timeout: 10000 }); }
    else await p.goto(B + '/');
    return p;
  }
  const A = await user('a', 'Nguyễn Hoàng Long Đại Vi', 390, 844);
  await A.evaluate(() => sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'create', settings: {} })));
  await A.goto(B + '/room.html'); await A.waitForFunction(() => window.RoomState && RoomState.roomData && RoomState.roomData.roomId, null, { timeout: 10000 });
  const url = B + '/room.html?id=' + encodeURIComponent(await A.evaluate(() => RoomState.roomData.roomId));
  await sleep(500);
  await A.screenshot({ path: OUT + '/0-A-waiting-390.png' });
  const Bp = await user('b', 'WWWWWWWWWWWWWWWWWWWWWWWW', 320, 568);
  const C = await user('c', null, 360, 740);              // spectator, guest
  const D = await user('d', null, 390, 844, 'dark');      // spectator, dark
  const E = await user('e', null, 1280, 900);
  for (const p of [Bp, C, D, E]) { await p.goto(url); await p.waitForFunction(() => window.RoomState && RoomState.roomData, null, { timeout: 10000 }); }
  await C.screenshot({ path: OUT + '/1-C-empty-seat-360.png' });
  await A.evaluate(() => RoomClient.emit('room:sit', { slot: 1 }));
  await Bp.evaluate(() => RoomClient.emit('room:sit', { slot: 2 }));
  await sleep(600);
  for (const p of [A, Bp]) await p.evaluate(() => RoomClient.emit('room:ready'));
  await sleep(800);
  for (const p of [A, Bp]) { const b = p.locator('#start-modal-btn'); if (await b.isVisible().catch(() => false)) await b.click(); }
  await sleep(1500);
  const pts = [[8,8],[9,8],[8,9],[9,9],[7,7],[10,10]];
  for (const [x,y] of pts) { for (const p of [A, Bp]) { const mine = await p.evaluate(() => { const gs = RoomState.gameState; const me = gs && gs.players.find((q) => q.userId === RoomState.myUser.userId); return !!(me && gs.currentTurn === me.userId); }); if (mine) { await p.evaluate(([x,y]) => RoomClient.emit('game:move', { x, y }), [x,y]); break; } } await sleep(300); }
  await sleep(1200);
  await A.screenshot({ path: OUT + '/2-A-play-390.png' });
  await Bp.screenshot({ path: OUT + '/3-B-play-320x568.png' });
  await C.screenshot({ path: OUT + '/4-C-spectator-360.png' });
  await D.screenshot({ path: OUT + '/5-D-dark-390.png' });
  await E.screenshot({ path: OUT + '/6-E-desktop-1280.png' });
  const say = async (p, txt) => { await p.fill('#chat-input', txt); await p.press('#chat-input', 'Enter'); await sleep(300); };
  await say(A, 'Ván này căng đấy 😄'); await say(Bp, 'Chặn rồi nhé'); await A.evaluate(() => document.activeElement.blur()); await sleep(300);
  await A.screenshot({ path: OUT + '/7-A-bubbles-390.png' });
  // scroll the .room scroller: the seat row + board must stay put
  await A.evaluate(() => { document.querySelector('.room').scrollTop = 400; }); await sleep(200);
  const geo = await A.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom) }; };
    const nm = document.querySelector('#seatcard-top .seatcard__name');
    return { vh: innerHeight, top: r('#seatcard-top'), bottom: r('#seatcard-bottom'), board: r('#board-area-shell'), clockTop: r('#seatcard-top .seatcard__clock'), clockMe: r('#seatcard-bottom .seatcard__clock'),
      nameCut: nm.scrollWidth > nm.clientWidth, nameFs: getComputedStyle(nm).fontSize, clockFs: getComputedStyle(document.querySelector('#seatcard-bottom .seatcard__clock')).fontSize,
      scrolled: document.querySelector('.room').scrollTop, docScroll: document.scrollingElement.scrollHeight - innerHeight };
  });
  const geoB = await Bp.evaluate(() => { const nm = document.querySelector('#seatcard-bottom .seatcard__name'); const ck = document.querySelector('#seatcard-bottom .seatcard__clock'); const d = document.getElementById('rdock').getBoundingClientRect(); return { vh: innerHeight, dockBottom: Math.round(d.bottom), nameW: nm.clientWidth, nameFs: getComputedStyle(nm).fontSize, clockFs: getComputedStyle(ck).fontSize, clockFits: ck.scrollWidth <= ck.clientWidth }; });
  console.log(JSON.stringify({ geo, geoB }, null, 1));
  console.log('ERRORS', JSON.stringify(errs, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
