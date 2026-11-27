// Screenshots + measurements of mockups A/B/C (static server over client/ + features/, no API, no DB).
// Usage: node features/puzzle-modern/shoot-mockups.js → shots/mock-<c>-<view>-<w>x<h>-<mode>.png + shots/mock-measure.json
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { MEASURE } = require('./measure.js');
const ROOT = path.join(__dirname, '../..'), CLIENT = path.join(ROOT, 'client'), OUT = path.join(__dirname, 'shots');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u.startsWith('/features/') ? path.join(ROOT, u) : path.join(CLIENT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(3109);
const B = 'http://localhost:3109';
const RUNS = [];
for (const c of ['a', 'b', 'c']) for (const v of ['list', 'solve', 'mine', 'editor']) {
  RUNS.push([c, v, 1366, 900, 'dark'], [c, v, 390, 844, 'dark']);
  if (v === 'solve' || v === 'list') RUNS.push([c, v, 1366, 900, 'light'], [c, v, 390, 844, 'light']);
  if (v === 'solve') RUNS.push([c, v + '-solved', 1366, 900, 'dark']);
}
(async () => {
  const br = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const result = [];
  for (const [c, view, w, h, mode] of RUNS) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, locale: 'vi-VN', reducedMotion: 'reduce' });
    await ctx.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
    await ctx.route('**/api/**', (r) => r.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } }));
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/401|Unauthorized/.test(m.text())) errs.push(m.text()); });
    await p.goto(`${B}/features/puzzle-modern/mockups/${c}.html#${view.replace('-solved', '')}`); await p.waitForTimeout(700);
    if (view.endsWith('-solved')) { await p.click('[data-view="solve"] [data-demo-state="solved"]'); await p.waitForTimeout(200); }
    await p.evaluate(() => { const n = document.querySelector('.mock-nav'); if (n) n.style.opacity = '.85'; });
    const m = await p.evaluate(MEASURE);
    const file = `mock-${c}-${view}-${w}x${h}-${mode}.png`;
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    result.push({ concept: c, view, size: `${w}x${h}`, mode, ...m, errors: errs, file });
    console.log(c, view, `${w}x${h}`, mode, `contrast<4.5=${m.lowContrastN} <44px=${m.smallN} hScroll=${m.hScroll}`, errs.length ? 'ERR ' + errs.join(' / ') : '', m.lowContrastN ? m.lowContrast.slice(0, 4).join(' | ') : '', m.smallN ? m.small.slice(0, 4).join(' | ') : '');
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'mock-measure.json'), JSON.stringify(result, null, 1));
  await br.close(); srv.close();
})();
