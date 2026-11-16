// Screenshots of the home-redesign mockups, each injected into the REAL index.html (live nav, tokens, fonts).
// Needs an isolated server: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
// Usage: node features/home-redesign/shoot.js [ids...]   (default: every mockups/*.html)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
const common = fs.readFileSync(path.join(DIR, 'common.css'), 'utf8');
const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(DIR, 'mockups')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();

function inject({ id, html, common, state }) {
  const icon = (n) => `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-regular-${n}"></use></svg>`;
  const main = document.querySelector('main.lobby');
  main.innerHTML = html.replace(/\{\{i:([a-z-]+)\}\}/g, (_, n) => icon(n));
  const st = document.createElement('style'); st.textContent = common; document.head.prepend(st);
  document.body.classList.add('mk', 'mk-' + id);
  if (state) document.body.classList.add('mk-' + state);
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('.seg__b'); if (!b) return;
    g.querySelectorAll('.seg__b').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN' });
  const page = await ctx.newPage();
  const u = 'minh' + Date.now().toString(36).slice(-5);
  const r = await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
  const j = await r.json().catch(() => ({}));
  if (r.ok() && j.user) await ctx.addInitScript((usr) => localStorage.setItem('gvn_user', JSON.stringify(usr)), { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  else { await page.goto(B + '/login.html'); await page.click('#btn-guest'); await page.waitForTimeout(1200); }
  const shots = [['light', 1280, 860, ''], ['dark', 1280, 860, ''], ['light', 1280, 860, 'searching'], ['light', 768, 1024, ''], ['light', 375, 812, ''], ['dark', 375, 812, '']];
  for (const id of ids) {
    const html = fs.readFileSync(path.join(DIR, 'mockups', id + '.html'), 'utf8');
    for (const [mode, w, h, state] of shots) {
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
      await page.goto(B + '/index.html'); await page.waitForTimeout(700);
      await page.evaluate(inject, { id, html, common, state });
      await page.waitForTimeout(900);
      const name = `${id}-${mode}-${w}${state ? '-' + state : ''}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: w === 375 });
      process.stdout.write(name + ' ');
    }
  }
  await browser.close();
})();
