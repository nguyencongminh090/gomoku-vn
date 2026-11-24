'use strict';
/**
 * Screenshots of the Rooms v4 mockups. Static file server over the repo root + Playwright;
 * never starts server/index.js and never opens a DB.
 * Usage: node features/rooms-redesign-v4/shoot.js [g h i]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };

// [mode, width, query, tag]; the same states for every direction so the shots compare 1:1.
const FRAMES = [['dark', 1280, ''], ['light', 1280, ''], ['dark', 1280, 'rule=renju', 'renju'], ['light', 1280, 'n=many', 'many'], ['light', 1280, 'n=0&rule=caro', 'empty'], ['dark', 1280, 'tab=rules&rule=caro', 'rules'],
    ['light', 390, ''], ['dark', 390, 'rule=renju', 'renju'], ['light', 390, 'n=many&sheet=1', 'sheet'], ['light', 390, 'n=0', 'empty']];
const PAGES = { g: { file: 'g-mot-cot.html', frames: FRAMES }, h: { file: 'h-hai-cot.html', frames: FRAMES }, i: { file: 'i-bang-tra.html', frames: FRAMES } };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const abs = path.resolve(ROOT, '.' + decodeURIComponent(req.url.split('?')[0]));
      if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(abs, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function chromePath() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || '', '.cache/ms-playwright');
  const alt = path.join(process.env.HOME || '', '.local/share/ms-playwright');
  for (const d of [dir, alt]) {
    try {
      for (const sub of fs.readdirSync(d)) {
        if (!sub.startsWith('chromium_headless_shell-')) continue;
        const p = path.join(d, sub, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
        if (fs.existsSync(p)) return p;
      }
    } catch (e) { /* not there */ }
  }
  return ['/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const exe = chromePath();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);
  const issues = [];
  let n = 0;
  try {
    for (const id of ids) {
      const p = PAGES[id];
      if (!fs.existsSync(path.join(__dirname, p.file))) { issues.push(`${id}: ${p.file} missing`); continue; }
      for (const [mode, w, query, tag] of p.frames) {
        const phone = w < 600;
        const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 860 }, deviceScaleFactor: phone ? 2 : 1 });
        const page = await ctx.newPage();
        const name = `${id}-${mode}-${w}${tag ? '-' + tag : ''}`;
        page.on('pageerror', (e) => issues.push(`${name}: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') issues.push(`${name} console: ${m.text()}`); });
        const qs = [mode === 'light' ? 'mode=light' : '', query].filter(Boolean).join('&');
        await page.goto(`http://127.0.0.1:${port}/features/rooms-redesign-v4/${p.file}${qs ? '?' + qs : ''}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({ content: '.mk-dock{display:none!important}' });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) issues.push(`${name}: horizontal overflow`);
        if (tag === 'rules') {
          const boards = await page.locator('#rooms-rules .rg-board').count();
          if (boards < 5) issues.push(`${name}: rules tab shows ${boards} diagrams`);
          if (await page.locator('#rooms-rules').isHidden()) issues.push(`${name}: rules panel hidden`);
        }
        // v4 constraints: no "a · b" joins in visible text, no board drawn outside the Rules guide.
        const dots = await page.evaluate(() => document.body.innerText.split('\n').filter((l) => l.includes('·')));
        if (dots.length) issues.push(`${name}: middle dot in UI: ${dots.slice(0, 2).join(' | ')}`);
        const boardsOut = await page.evaluate(() => [...document.querySelectorAll('svg.mboard, canvas')].filter((e) => !e.closest('#rooms-rules')).length);
        if (boardsOut) issues.push(`${name}: ${boardsOut} board(s) outside the Rules guide`);
        if (await page.evaluate(() => [...document.querySelectorAll('.pav')].some((a) => a.classList.contains('mav')))) issues.push(`${name}: non-production avatar`);
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        n++;
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(`${n} screenshots in ${path.relative(ROOT, OUT)}`);
  if (issues.length) { console.error('ISSUES:\n' + issues.join('\n')); process.exit(1); }
})();
