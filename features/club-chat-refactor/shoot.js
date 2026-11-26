// Screenshots of the club chat refactor mockup (static file://, no server, no DB).
// Usage: node features/club-chat-refactor/shoot.js [scene ...]   → shots/<scene>-<frame>.png + shots/<scene>.png (contact sheet)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const DIR = __dirname;
const PAGE = 'file://' + path.join(DIR, 'mockups', 'chat.html');
const SCENES = { actions: 'member', edit: 'member', slash: 'staff', delete: 'staff', report: 'member', poll: 'member', calendar: 'staff', event: 'staff' };
const FRAMES = {
  'phone-dark': { w: 390, h: 844, mode: 'dark', phone: true }, 'phone-light': { w: 390, h: 844, mode: 'light', phone: true },
  'desk-dark': { w: 1280, h: 860, mode: 'dark' }, 'desk-light': { w: 1280, h: 860, mode: 'light' },
};
const EXE = process.env.CHROME || path.join(process.env.HOME, '.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
(async () => {
  fs.mkdirSync(path.join(DIR, 'shots'), { recursive: true });
  const b = await chromium.launch({ executablePath: EXE });
  for (const id of ids) {
    const files = [];
    for (const [n, f] of Object.entries(FRAMES)) {
      const ctx = await b.newContext({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: f.phone ? 2 : 1, isMobile: !!f.phone, hasTouch: !!f.phone, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('JS-ERROR', id, n, e.message));
      p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', id, n, m.text()); });
      await p.goto(`${PAGE}?scene=${id}&mode=${f.mode}&as=${SCENES[id]}`);
      await p.addStyleTag({ content: '.mk-tab{display:none!important}' });
      await p.waitForTimeout(350);
      const r = await p.evaluate(() => {
        const over = document.documentElement.scrollWidth - innerWidth;
        const small = [...document.querySelectorAll('dialog[open] button, .cl-hints button, .cb-tools button, .cb-day, .pchip')]
          .filter((e) => e.offsetParent && e.getBoundingClientRect().height < 24 && getComputedStyle(e).clip === 'auto').map((e) => e.className);
        return { over, small };
      });
      if (r.over > 0) console.log('H-SCROLL', id, n, r.over);
      if (r.small.length) console.log('SMALL-TARGETS', id, n, r.small.join('|'));
      const file = path.join(DIR, 'shots', `${id}-${n}.png`);
      await p.screenshot({ path: file });
      files.push(file);
      await ctx.close();
    }
    // contact sheet: phone dark | phone light | desktop dark | desktop light
    const ctx = await b.newContext({ viewport: { width: 2300, height: 760 } });
    const p = await ctx.newPage();
    const img = (f, w) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:${w}px"><figcaption>${path.basename(f, '.png')}</figcaption></figure>`;
    await p.setContent(`<body style="margin:0;padding:10px;background:#777;display:flex;gap:10px;align-items:flex-start;font:13px sans-serif;color:#fff">
      ${img(files[0], 330)}${img(files[1], 330)}${img(files[2], 800)}${img(files[3], 800)}<style>figure{margin:0}</style></body>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(DIR, 'shots', `${id}.png`), fullPage: true });
    await ctx.close();
    console.log('shot', id);
  }
  await b.close();
})();
