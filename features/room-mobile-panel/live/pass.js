const { chromium } = require('/run/media/ngmint/Data/Programming/Programming/HTML/gomoku-vn/node_modules/playwright');
const B = 'http://localhost:3101'; const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const errs = [];
  async function guest(name, w, h, mode = 'light') {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'vi-VN', hasTouch: w < 800, isMobile: w < 800, deviceScaleFactor: 2 });
    await ctx.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(name + ': ' + m.text()); });
    p.on('pageerror', (e) => errs.push(name + ' PAGEERROR: ' + e.message));
    await p.goto(B + '/login.html'); await p.click('#btn-guest'); await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 });
    return p;
  }
  const A = await guest('A', 390, 844);
  await A.evaluate(() => sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'create', settings: {} })));
  await A.goto(B + '/room.html'); await A.waitForFunction(() => window.RoomState && RoomState.roomData && RoomState.roomData.roomId, null, { timeout: 10000 });
  const roomId = await A.evaluate(() => RoomState.roomData.roomId);
  const url = B + '/room.html?id=' + encodeURIComponent(roomId);
  const Bp = await guest('B', 375, 667);
  const C = await guest('C', 390, 844);
  const D = await guest('D', 390, 844, 'dark');
  const E = await guest('E', 1280, 900);
  for (const p of [Bp, C, D, E]) { await p.goto(url); await p.waitForFunction(() => window.RoomState && RoomState.roomData, null, { timeout: 10000 }); }
  await A.evaluate(() => RoomClient.emit('room:sit', { slot: 1 }));
  await Bp.evaluate(() => RoomClient.emit('room:sit', { slot: 2 }));
  await sleep(600);
  for (const p of [A, Bp]) await p.evaluate(() => RoomClient.emit('room:ready'));
  await sleep(800);
  for (const p of [A, Bp]) { const b = p.locator('#start-modal-btn'); if (await b.isVisible().catch(() => false)) await b.click(); }
  await sleep(1500);
  // finish game 1 (resign) and start game 2, then a few moves
  await A.evaluate(() => RoomClient.emit('game:resign'));
  await sleep(1200);
  for (const p of [A, Bp]) await p.evaluate(() => RoomClient.emit('room:ready'));
  await sleep(800);
  for (const p of [A, Bp]) { const b = p.locator('#start-modal-btn'); if (await b.isVisible().catch(() => false)) await b.click(); }
  await sleep(1500);
  const pts = [[8,8],[9,8],[8,9],[9,9],[7,7],[10,10],[8,7]];
  for (const [x,y] of pts) { for (const p of [A, Bp]) { const mine = await p.evaluate(() => { const gs = RoomState.gameState; const me = gs && gs.players.find((q) => q.userId === RoomState.myUser.userId); return !!(me && gs.currentTurn === me.userId); }); if (mine) { await p.evaluate(([x,y]) => RoomClient.emit('game:move', { x, y }), [x,y]); break; } } await sleep(300); }
  console.log('state', await A.evaluate(() => RoomState.roomData.state), 'gs', await A.evaluate(() => !!RoomState.gameState));
  await A.screenshot({ path: OUT + '/1-A-before.png' });
  const say = async (p, txt) => { await p.fill('#chat-input', txt); await p.press('#chat-input', 'Enter'); await sleep(250); };
  await say(C, 'H8 đẹp quá 👏'); await say(D, 'Long phải chặn J10 ngay'); await say(C, 'kèo căng 🔥');
  await say(Bp, 'Ván này căng đấy 😄'); await A.evaluate(() => document.activeElement && document.activeElement.blur());
  for (let i = 0; i < 4; i++) { await D.click('#btn-react'); await sleep(320); }
  await A.screenshot({ path: OUT + '/2-A-stage.png' });
  await Bp.screenshot({ path: OUT + '/3-B-se667.png' });
  await D.screenshot({ path: OUT + '/4-D-dark.png' });
  await E.screenshot({ path: OUT + '/5-E-desktop.png' });
  await say(A, 'Cảm ơn mọi người'); await A.evaluate(() => document.activeElement.blur()); await sleep(200);
  await A.screenshot({ path: OUT + '/6-A-mybubble.png' });
  const badge = await A.evaluate(() => document.getElementById('sheet-badge').textContent);
  await A.click('#btn-sheet'); await sleep(400);
  await A.screenshot({ path: OUT + '/7-A-sheet-chat.png' });
  await A.click('.tab-btn[data-tab="tab-users"]'); await sleep(200);
  await A.screenshot({ path: OUT + '/8-A-sheet-score.png' });
  await A.click('.tab-btn[data-tab="tab-moves"]'); await sleep(200);
  await A.screenshot({ path: OUT + '/8b-A-sheet-moves.png' });
  await A.click('.tab-btn[data-tab="tab-settings"]'); await sleep(200);
  await A.screenshot({ path: OUT + '/9-A-sheet-settings.png' });
  await A.click('#rsheet-scrim', { position: { x: 200, y: 60 } }); await sleep(400);
  await A.click('#aud-stack'); await sleep(300);
  await A.screenshot({ path: OUT + '/10-A-audience.png' });
  // geometry checks
  const geo = await A.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { vh: innerHeight, dock: r('#rdock'), stage: r('#stage'), board: r('#board-area-shell'), my: r('#seatcard-bottom'), docScroll: document.scrollingElement.scrollHeight - innerHeight };
  });
  const geoB = await Bp.evaluate(() => { const d = document.getElementById('rdock').getBoundingClientRect(); return { vh: innerHeight, dockBottom: Math.round(d.bottom), stageH: document.getElementById('stage').clientHeight }; });
  console.log(JSON.stringify({ roomId, badge, geo, geoB }));
  console.log('ERRORS', JSON.stringify(errs, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
