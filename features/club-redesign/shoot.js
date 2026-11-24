// Screenshots of the club mockups (static files, no server needed).
// Usage: node features/club-redesign/shoot.js [ids...]   (SHOTS=club-dark-1280,… to limit frames)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const DIR = __dirname;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(DIR, 'mockups')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
// name: [w, h, mode, page, as]
const FR = {
  'club-dark-1280': [1280, 900, 'dark', 'club', 'member'], 'club-light-1280': [1280, 900, 'light', 'club', 'visitor'],
  'club-staff-1280': [1280, 900, 'dark', 'club', 'staff'], 'club-dark-375': [375, 812, 'dark', 'club', 'member'], 'club-light-375': [375, 812, 'light', 'club', 'visitor'],
  'disc-dark-1280': [1280, 900, 'dark', 'discover', 'member'], 'disc-light-375': [375, 812, 'light', 'discover', 'visitor'],
};
const EXE = process.env.CHROME || path.join(process.env.HOME, '.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome');
const only = (process.env.SHOTS || '').split(',').filter(Boolean);
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  for (const id of ids) for (const [n, [w, h, mode, page, as]] of Object.entries(FR)) {
    if (only.length && !only.includes(n)) continue;
    const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: w < 500 ? 2 : 1 });
    p.on('pageerror', (e) => console.log('JS-ERROR', id, n, e.message));
    p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', id, n, m.text()); });
    await p.goto('file://' + path.join(DIR, 'mockups', id + '.html') + `?mode=${mode}&page=${page}&as=${as}`);
    await p.waitForTimeout(400);
    if (w < 500) await p.screenshot({ path: path.join(DIR, 'shots', `${id}-${n}-fold.png`) });
    await p.addStyleTag({ content: '.mk-tab,.dock{display:none!important}' });
    await p.screenshot({ path: path.join(DIR, 'shots', `${id}-${n}.png`), fullPage: true });
    const r = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth - innerWidth;
      const small = [...document.querySelectorAll('main .btn,main [role=tab],main button')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 36).map((e) => e.textContent.trim().slice(0, 20));
      const spill = [...document.querySelectorAll('.nm')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1 && e.clientWidth < 40).length;
      return { over, small, spill };
    });
    if (r.over > 0) console.log('H-SCROLL', id, n, r.over);
    if (r.small.length) console.log('SMALL-TARGETS', id, n, r.small.join('|'));
    if (r.spill) console.log('NAME-SQUEEZED', id, n, r.spill);
    await p.close();
  }
  await b.close();
})();
