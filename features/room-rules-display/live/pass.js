// #376 real-browser pass: isolated server on :3101 (own DB). Usage: node pass.js <outdir>
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
  await A.evaluate(() => RoomClient.emit('room:settings', { settings: { ...RoomState.roomData.settings, winningRule: 'caro', ruleWall: true } }));
  await sleep(500);
  const url = B + '/room.html?id=' + encodeURIComponent(await A.evaluate(() => RoomState.roomData.roomId));
  const P = await guest('P', 390, 844);
  const D = await guest('D', 1440, 900, 'dark');
  const S = await guest('S', 375, 667);
  const T = await guest('T', 1024, 700);
  for (const p of [P, D, S, T]) { await p.goto(url); await p.waitForFunction(() => window.RoomState && RoomState.roomData, null, { timeout: 10000 }); }
  await A.evaluate(() => RoomClient.emit('room:sit', { slot: 1 }));
  await P.evaluate(() => RoomClient.emit('room:sit', { slot: 2 }));
  await sleep(600);
  for (const p of [A, P]) await p.evaluate(() => RoomClient.emit('room:ready'));
  await sleep(800);
  for (const p of [A, P]) { const b = p.locator('#start-modal-btn'); if (await b.isVisible().catch(() => false)) await b.click(); }
  await sleep(1500);
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
  const geo = (p) => p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return { nav: r('.topnav'), board: r('.gboard') || r('#board-area canvas'), ticket: r('.rnav__ticket'), leave: r('#btn-leave'), menu: r('#btn-room-menu'),
      rules: document.getElementById('room-rules-text').textContent, name: document.getElementById('room-id-nav').textContent.trim(),
      scrollW: document.documentElement.scrollWidth + '/' + innerWidth, siteLinksHidden: document.getElementById('room-site-links').hidden };
  });
  const out = {};
  for (const [n, p] of [['A', A], ['P', P], ['D', D], ['S', S], ['T', T]]) out[n] = await geo(p);
  await shot(A, '1-A-1440-player'); await shot(P, '2-P-390-player'); await shot(D, '3-D-1440-dark-spectator'); await shot(S, '4-S-375x667-spectator'); await shot(T, '5-T-1024-spectator');
  await A.click('#btn-room-rules'); await sleep(250); await shot(A, '6-A-rules-pop');
  await A.click('#btn-room-menu'); await sleep(250); await shot(A, '7-A-menu-seated');
  out.oneOpen = await A.evaluate(() => [document.getElementById('rules-pop').hidden, document.getElementById('room-menu').hidden]);
  await A.keyboard.press('Escape');
  await D.click('#btn-room-menu'); await sleep(250); await shot(D, '8-D-menu-spectator-dark');
  await D.click('#btn-room-rules'); await sleep(250); await shot(D, '9-D-rules-dark');
  await P.click('#btn-room-rules'); await sleep(300); await shot(P, '10-P-rules-sheet');
  await P.click('#rnav-scrim', { position: { x: 200, y: 100 } }); await sleep(200);
  await P.click('#btn-room-menu'); await sleep(300); await shot(P, '11-P-menu-sheet');
  await P.click('#btn-room-menu'); await sleep(200);
  await S.click('#btn-room-menu'); await sleep(300); await shot(S, '12-S-menu-spectator');
  out.closedAfterToggle = await P.evaluate(() => document.getElementById('room-menu').hidden);
  await S.click('#btn-room-menu'); await sleep(200);
  // Longest rules line on the smallest phone: every variant on (settings unlock once the game ends).
  await A.evaluate(() => RoomClient.emit('game:resign')); await sleep(1200);
  await A.evaluate(() => RoomClient.emit('room:settings', { settings: { ...RoomState.roomData.settings, winningRule: 'standard', ruleWall: false, rulePortal: true, ruleSwap2: true, ranked: true } }));
  await sleep(800);
  await shot(S, '13-S-long-rules');
  out.long = await S.evaluate(() => { const r = document.querySelector('.rnav__rules'); return { text: r.textContent, clipped: r.scrollWidth > r.clientWidth, scrollW: document.documentElement.scrollWidth + '/' + innerWidth }; });
  await S.click('#btn-room-rules'); await sleep(300); await shot(S, '14-S-long-rules-sheet');
  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errs);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
