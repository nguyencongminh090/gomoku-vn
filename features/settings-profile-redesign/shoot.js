// Screenshots + rule checks for the settings#profile mockups (static files, no server).
// Usage: node features/settings-profile-redesign/shoot.js [ids...] → shots/<id>-{dark-1280,light-1280,dark-375,light-375}.png
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const DIR = __dirname;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(DIR, 'mockups')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
const FR = { 'dark-1280': [1280, 900, 'dark'], 'light-1280': [1280, 900, 'light'], 'dark-375': [375, 812, 'dark'], 'light-375': [375, 812, 'light'] };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  for (const id of ids) for (const [n, [w, h, mode]] of Object.entries(FR)) {
    const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: w < 500 ? 2 : 1 });
    p.on('pageerror', (e) => console.log('JS-ERROR', id, n, e.message));
    await p.goto('file://' + path.join(DIR, 'mockups', id + '.html') + `?mode=${mode}`);
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(DIR, 'shots', `${id}-${n}.png`), fullPage: true });
    const r = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth - innerWidth;
      const clear = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || /rgba\(.*,\s*0(\.\d+)?\)$/.test(c) && !/,\s*1\)$/.test(c);
      const bad = [];
      for (const e of document.querySelectorAll('button,a.btn,label.btn,input:not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea,div,section,aside,.sw i,.seg span,.tag,.av')) {
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
        const cs = getComputedStyle(e);
        const visibleBox = e.matches('button,a.btn,label.btn,input,select,textarea,.sw i,.seg span,.tag,.av') || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none' || parseFloat(cs.borderTopLeftRadius) > 0;
        if (visibleBox && clear(cs.backgroundColor)) bad.push(e.tagName.toLowerCase() + '.' + [...e.classList].join('.'));
      }
      const small = [...document.querySelectorAll('.btn,.mk-tab,.seg span')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 36).length;
      return { over, bad: [...new Set(bad)], small };
    });
    if (r.over > 0) console.log('H-SCROLL', id, n, r.over);
    if (r.bad.length) console.log('TRANSPARENT-BG', id, n, r.bad.join(' '));
    if (r.small) console.log('SMALL', id, n, r.small);
    await p.close();
  }
  await b.close(); console.log('shots done');
})();
