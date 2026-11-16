// #369 real-browser pass: isolated server on :3101 (own DB). Usage: node pass.js <outdir>
const { chromium } = require('/run/media/ngmint/Data/Programming/Programming/HTML/gomoku-vn/node_modules/playwright');
const B = 'http://localhost:3101'; const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const errs = [];
  async function guest(name, w, h, mode = 'light') {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'vi-VN', hasTouch: w < 800, isMobile: w < 800, deviceScaleFactor: w < 800 ? 2 : 1 });
    await ctx.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(name + ': ' + m.text()); });
    p.on('pageerror', (e) => errs.push(name + ' PAGEERROR: ' + e.message));
    await p.goto(B + '/login.html'); await p.click('#btn-guest'); await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 });
    return p;
  }
  const A = await guest('A', 1440, 900);
  await A.evaluate(() => sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'create', settings: {} })));
  await A.goto(B + '/room.html'); await A.waitForFunction(() => window.RoomState && RoomState.roomData && RoomState.roomData.roomId, null, { timeout: 10000 });
  const url = B + '/room.html?id=' + encodeURIComponent(await A.evaluate(() => RoomState.roomData.roomId));
  const Bp = await guest('B', 1024, 700);
  const C = await guest('C', 820, 1180);
  const D = await guest('D', 1440, 900, 'dark');
  const P = await guest('P', 390, 844);
  for (const p of [Bp, C, D, P]) { await p.goto(url); await p.waitForFunction(() => window.RoomState && RoomState.roomData, null, { timeout: 10000 }); }
  await D.screenshot({ path: OUT + '/0-D-waiting-dark.png' });
  await A.evaluate(() => RoomClient.emit('room:sit', { slot: 1 }));
  await Bp.evaluate(() => RoomClient.emit('room:sit', { slot: 2 }));
  await sleep(600);
  const start = async () => {
    for (const p of [A, Bp]) await p.evaluate(() => RoomClient.emit('room:ready'));
    await sleep(800);
    for (const p of [A, Bp]) { const b = p.locator('#start-modal-btn'); if (await b.isVisible().catch(() => false)) await b.click(); }
    await sleep(1500);
  };
  await start();
  await A.evaluate(() => RoomClient.emit('game:resign')); await sleep(1200);
  await start();
  const pts = [[8,8],[9,8],[8,9],[9,9],[7,7],[10,10],[8,7],[9,7],[8,10]];
  for (const [x,y] of pts) { for (const p of [A, Bp]) { const mine = await p.evaluate(() => { const gs = RoomState.gameState; const me = gs && gs.players.find((q) => q.userId === RoomState.myUser.userId); return !!(me && gs.currentTurn === me.userId); }); if (mine) { await p.evaluate(([x,y]) => RoomClient.emit('game:move', { x, y }), [x,y]); break; } } await sleep(300); }
  const say = async (p, txt) => { await p.fill('#chat-input', txt); await p.press('#chat-input', 'Enter'); await sleep(250); };
  await say(C, 'H8 đẹp quá 👏'); await say(D, 'Long phải chặn J10 ngay'); await say(C, 'kèo căng 🔥');
  await say(Bp, 'Ván này căng đấy 😄'); await say(A, 'Cảm ơn mọi người');
  for (const p of [A, Bp, C, D]) await p.evaluate(() => document.activeElement && document.activeElement.blur());
  for (let i = 0; i < 3; i++) { await D.click('#btn-react'); await sleep(320); }
  await A.screenshot({ path: OUT + '/1-A-1440-player.png' });
  await Bp.screenshot({ path: OUT + '/2-B-1024-player.png' });
  await C.screenshot({ path: OUT + '/3-C-820x1180-spectator.png' });
  await D.screenshot({ path: OUT + '/4-D-1440-dark-spectator.png' });
  await P.screenshot({ path: OUT + '/5-P-phone-regression.png' });
  const score = await A.evaluate(() => document.getElementById('score-hero').textContent.replace(/\s+/g, ' ').trim());
  await A.click('.tab-btn[data-tab="tab-moves"]'); await sleep(200);
  await A.screenshot({ path: OUT + '/6-A-moves.png' });
  await A.click('.tab-btn[data-tab="tab-settings"]'); await sleep(200);
  await A.screenshot({ path: OUT + '/7-A-settings.png' });
  await A.click('.tab-btn[data-tab="tab-chat"]');
  await D.click('#aud-stack'); await sleep(300);
  await D.screenshot({ path: OUT + '/8-D-audience.png' });
  // request toast: A asks for a draw, B sees it
  await A.evaluate(() => RoomClient.emit('game:draw_offer')); await sleep(600);
  await Bp.screenshot({ path: OUT + '/9-B-draw-toast.png' });
  const toastClickable = await Bp.evaluate(() => { const b = document.querySelector('#draw-prompt-area button'); if (!b) return 'no toast'; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === b || b.contains(hit); });
  // board click still reaches the canvas through the stage overlay
  const boardHit = await A.evaluate(() => { const c = document.querySelector('#board-area canvas, .gboard'); const r = c.getBoundingClientRect(); const h = document.elementFromPoint(r.left + 20, r.bottom - 20); return h && (h === c || c.contains(h)) ? 'canvas' : (h && (h.id || h.className)); });
  const sizes = {};
  for (const [n, p] of [['A', A], ['B', Bp], ['C', C], ['P', P]]) sizes[n] = await p.evaluate(() => { const c = document.querySelector('.gboard') || document.querySelector('#board-area canvas'); const r = c.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) + ' scrollW=' + document.documentElement.scrollWidth + '/' + innerWidth; });
  console.log(JSON.stringify({ score, toastClickable, boardHit, sizes }, null, 1));
  console.log('errors:', errs);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
