// Screenshots of the profile mockups (static files, no server needed).
// Usage: node features/profile-redesign/shoot.js [ids...]  → shots/<id>-{dark-1280,light-1280,dark-375,light-375,self-1280,self-375}.png
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const DIR = __dirname;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(DIR, 'mockups')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
const FR = { 'dark-1280': [1280, 900, 'dark', 'other'], 'light-1280': [1280, 900, 'light', 'other'], 'dark-375': [375, 812, 'dark', 'other'], 'light-375': [375, 812, 'light', 'other'], 'self-1280': [1280, 900, 'dark', 'self'], 'self-375': [375, 812, 'dark', 'self'] };
const only = (process.env.SHOTS || '').split(',').filter(Boolean);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  for (const id of ids) for (const [n, [w, h, mode, view]] of Object.entries(FR)) {
    if (only.length && !only.includes(n)) continue;
    const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: w < 500 ? 2 : 1 });
    p.on('pageerror', (e) => console.log('JS-ERROR', id, n, e.message));
    p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', id, n, m.text()); });
    await p.goto('file://' + path.join(DIR, 'mockups', id + '.html') + `?mode=${mode}&view=${view}`);
    await p.waitForTimeout(300);
    if (w < 500) await p.screenshot({ path: path.join(DIR, 'shots', `${id}-${n}-fold.png`) }); // first screen, with the fixed bars
    await p.addStyleTag({ content: '.mk-tab,.dock{display:none!important}' }); // fixed bars land mid-page in a fullPage shot
    await p.screenshot({ path: path.join(DIR, 'shots', `${id}-${n}.png`), fullPage: true });
    const r = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth - innerWidth;
      // names that spill their box, and tap targets under 44px (buttons/links with a .btn/.chip class)
      const small = [...document.querySelectorAll('.btn,[role=tab]')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 36).length;
      return { over, small };
    });
    if (r.over > 0) console.log('H-SCROLL', id, n, r.over);
    if (r.small) console.log('SMALL-TARGETS', id, n, r.small);
    await p.close();
  }
  await b.close();
})();
