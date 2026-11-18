// Phone shots of the home-hero-photo mockup, injected into the REAL index.html (live shell, tokens, fonts).
// Needs an isolated server: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
// Usage: node features/home-hero-photo/shoot.js [current]   ("current" = shoot the live page without injection)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
const current = process.argv[2] === 'current';

function inject({ html, css }) {
  const icon = (n) => `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-${n}"></use></svg>`;
  const main = document.querySelector('main.lobby');
  main.innerHTML = html.replace(/\{\{i:([a-z-]+)\}\}/g, (_, n) => icon(n));
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  document.body.classList.add('mk');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const u = 'minh' + Date.now().toString(36).slice(-5);
  const r = await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
  const j = await r.json().catch(() => ({}));
  if (r.ok() && j.user) await ctx.addInitScript((usr) => localStorage.setItem('gvn_user', JSON.stringify(usr)), { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  const html = fs.readFileSync(path.join(DIR, 'mockup.html'), 'utf8');
  const css = fs.readFileSync(path.join(DIR, 'mockup.css'), 'utf8');
  for (const [mode, w, h] of [['light', 390, 844], ['dark', 390, 844], ['light', 360, 740]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
    await page.goto(B + '/index.html'); await page.waitForTimeout(900);
    if (!current) await page.evaluate(inject, { html, css });
    await page.waitForTimeout(900);
    const name = `${current ? 'current' : 'mock'}-${mode}-${w}`;
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    await page.screenshot({ path: path.join(OUT, name + '-full.png'), fullPage: true });
    process.stdout.write(name + ' ');
  }
  await browser.close();
})();
