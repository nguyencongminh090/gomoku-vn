// Screenshots of the rankings mockups (static files, no server needed).
// Usage: node features/rankings-redesign/shoot.js [ids...]  → shots/<id>-{dark-1280,light-1280,dark-375}.png
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const DIR = __dirname;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(DIR, 'mockups')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
const FR = { 'dark-1280': [1280, 900, 'dark'], 'light-1280': [1280, 900, 'light'], 'dark-375': [375, 812, 'dark'] };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  for (const id of ids) for (const [n, [w, h, mode]] of Object.entries(FR)) {
    const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    await p.goto('file://' + path.join(DIR, 'mockups', id + '.html') + '?mode=' + mode);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(DIR, 'shots', `${id}-${n}.png`), fullPage: true });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) console.log('H-SCROLL', id, n, over);
    await p.close();
  }
  await b.close();
})();
