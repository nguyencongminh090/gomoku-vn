// Screenshots of the fill-space mockups on the real home page.
// Needs an isolated server: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
// Usage: node features/home-fill/shoot.js <outDir>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const INJECT = fs.readFileSync(path.join(__dirname, 'mockup-inject.js'), 'utf8');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto(B + '/login.html'); await page.click('#btn-guest'); await page.waitForTimeout(1500);
  for (const mode of ['light', 'dark']) {
    await page.evaluate((m) => localStorage.setItem('gvn_color_mode', m), mode);
    for (const v of ['now', 'a', 'b', 'c']) {
      for (const [w, h] of [[1280, 900], [768, 1024], [375, 812]]) {
        if (mode === 'dark' && w !== 1280) continue;
        await page.setViewportSize({ width: w, height: h });
        await page.goto(B + '/index.html'); await page.waitForTimeout(1000);
        if (v !== 'now') { await page.evaluate((x) => { window.__MK = x; }, v); await page.addScriptTag({ content: INJECT }).catch(async () => { await page.evaluate(INJECT); }); }
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${v}-${mode}-${w}.png`, fullPage: w === 375 });
      }
    }
  }
  await browser.close();
})();
