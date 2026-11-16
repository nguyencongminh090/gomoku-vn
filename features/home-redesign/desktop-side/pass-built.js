// #366 real-browser pass: the built page on an isolated server (PORT=3101, scratch DB). "full" = /api/home stats/live
// replaced via route (real render path); "empty" = the server's own numbers. Console errors are printed.
const path = require('path');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const OUT = path.join(__dirname, 'built');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN' });
  const r = await ctx.request.post(B + '/api/auth/register', { data: { username: 'p' + Date.now().toString(36), password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
  const j = await r.json();
  await ctx.addInitScript((u) => { localStorage.setItem('gvn_user', JSON.stringify(u)); localStorage.removeItem('gvn_quickmatch'); }, { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  const page = await ctx.newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
  let full = false;
  await page.route('**/api/home', async (route) => {
    const res = await route.fetch(); const d = await res.json();
    if (full) { d.stats = { online: 24, searching: 3, playing: 5 }; d.live = [{ roomId: 'X1', black: 'minhcaro', white: 'Tuấn Anh', moves: 23 }]; }
    route.fulfill({ response: res, json: d });
  });
  const shots = [['full', 'light', 1440, 900], ['full', 'dark', 1440, 900], ['full', 'light', 1280, 800], ['full', 'dark', 1280, 800], ['empty', 'light', 1440, 900], ['empty', 'dark', 1440, 900], ['full', 'light', 390, 844], ['full', 'dark', 390, 844]];
  for (const [kind, mode, w, h] of shots) {
    full = kind === 'full';
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((md) => localStorage.setItem('gvn_color_mode', md), mode);
    await page.goto(B + '/index.html'); await page.waitForTimeout(1500);
    const m = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
      return { side: r('#home-stats'), board: r('.hq-board'), chip: r('.hq-chip'), main: r('.hq-main'), sideShown: getComputedStyle(document.getElementById('home-stats')).display, tiles: getComputedStyle(document.querySelector('.hq-tiles')).display, overflowX: document.documentElement.scrollWidth > innerWidth }; });
    const name = `${kind}-${mode}-${w}.png`;
    await page.screenshot({ path: path.join(OUT, name), fullPage: w < 800 });
    console.log(name, JSON.stringify(m));
  }
  console.log('console errors:', errs.length ? errs : 'none');
  await browser.close();
})();
