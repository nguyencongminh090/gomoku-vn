// #362 real-browser pass: built page, /api/home stats overridden (0 vs busy) to see both states.
const path = require('path');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const OUT = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN', deviceScaleFactor: 2 });
  const u = 'mk' + Date.now().toString(36);
  const j = await (await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } })).json();
  await ctx.addInitScript((usr) => { localStorage.setItem('gvn_user', JSON.stringify(usr)); localStorage.removeItem('gvn_quickmatch'); }, { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  let busy = false;
  await ctx.route('**/api/home*', async (route) => {
    const r = await route.fetch(); const d = await r.json();
    if (busy) { d.stats = { online: 14, searching: 2, playing: 5 }; d.queueEta = { 'caro|auto': 20 }; }
    route.fulfill({ response: r, json: d });
  });
  const page = await ctx.newPage();
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  for (const [w, h] of [[390, 844], [360, 800], [1280, 860]]) for (const mode of ['light', 'dark']) for (const b of [false, true]) {
    if (w === 1280 && (mode === 'dark' || !b)) continue;
    busy = b;
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((md) => localStorage.setItem('gvn_color_mode', md), mode);
    await page.goto(B + '/index.html'); await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.height ? [Math.round(b.top), Math.round(b.bottom)] : 'hidden'; };
      return { pulse: r('#home-pulse'), tiles: r('.hq-tiles'), side: r('#home-stats'), tab: r('.pshell-tabs, .tabbar, nav.ptabbar'), sw: document.documentElement.scrollWidth, txt: document.getElementById('home-pulse').innerText.replace(/\s+/g, ' ') };
    });
    const name = `built-${w}-${mode}-${b ? 'busy' : 'zero'}.png`;
    await page.screenshot({ path: path.join(OUT, name) });
    console.log(name, JSON.stringify(m));
  }
  busy = true; await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(B + '/index.html'); await page.waitForTimeout(1500);
  await page.click('#home-pulse-live'); await page.waitForTimeout(500);
  console.log('after click:', page.url(), await page.getAttribute('#room-tabs [data-room-tab="watch"]', 'aria-selected'));
  console.log('console errors:', errs.filter((e) => !/401/.test(e)));
  await browser.close();
})();
