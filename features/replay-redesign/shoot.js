// Screenshots + measurements for the replay redesign (baseline = the live /replay page, mockups A/B/C).
// No DB: a static server over client/ (+ features/), /api/games/<id> answered with the mockup fixture.
// Usage: AXE=<path to axe.min.js> node features/replay-redesign/shoot.js   → shots/*.png + shots/measure.json
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '../..'), CLIENT = path.join(ROOT, 'client'), OUT = path.join(__dirname, 'shots');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'mockups/fixture.js'), 'utf8'), ctx);
const GAME = ctx.window.DEMO_GAME;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  let f = u.startsWith('/features/') ? path.join(ROOT, u) : u.startsWith('/replay/') ? path.join(CLIENT, 'replay.html') : path.join(CLIENT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(3107);
const B = 'http://localhost:3107';
const VIEWS = [[1366, 768], [1920, 1080], [768, 1024], [375, 812]];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const PAGES = [['now', `/replay/${GAME.id}`], ['now-noanalysis', `/replay/${GAME.id}`], ['A', '/features/replay-redesign/mockups/a.html'], ['B', '/features/replay-redesign/mockups/b.html'], ['C', '/features/replay-redesign/mockups/c.html']];
(async () => {
  const br = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const result = [];
  for (const [name, url] of PAGES.filter(([n]) => !ONLY || ONLY.includes(n))) for (const [w, h] of VIEWS) for (const mode of (w === 1366 || w === 375 ? ['dark', 'light'] : ['dark'])) {
    const c = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 3 : 1, locale: 'vi-VN' });
    await c.addInitScript(({ m, an }) => { localStorage.setItem('gvn_color_mode', m); localStorage.setItem('gvn_replay_analysis', an); }, { m: mode, an: name === 'now-noanalysis' ? '0' : '1' });
    await c.route('**/api/**', (r) => (/\/api\/games\/[^/]+$/.test(r.request().url())
      ? r.fulfill({ json: { game: GAME } }) : r.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } })));
    const p = await c.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/401|Unauthorized/.test(m.text())) errs.push(m.text()); });
    await p.goto(B + url); await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const r = (el) => el && el.getBoundingClientRect();
      const hdr = document.querySelector('#pl-shell'); const hb = hdr ? hdr.getBoundingClientRect().bottom : 0;
      const bd = r(document.querySelector('svg.gboard'));
      const tab = document.querySelector('.ptabbar'); const tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().height : 0;
      const play = r(document.querySelector('#rp-play, #btn-play')); const slider = r(document.querySelector('#rp-slider'));
      const avail = innerHeight - hb;
      return { headerBottom: Math.round(hb), board: bd && Math.round(bd.width), boardPctOfAvailH: bd && Math.round((bd.width / avail) * 100),
        boardPctOfW: bd && Math.round((bd.width / innerWidth) * 100), pageScrollY: document.documentElement.scrollHeight > innerHeight + 1,
        hScroll: document.documentElement.scrollWidth > innerWidth, controlsBottom: play && Math.round(play.bottom), visibleBottom: innerHeight - tabH,
        controlsVisible: !!play && play.bottom <= innerHeight - tabH && (!slider || slider.bottom <= innerHeight - tabH) };
    });
    let axe = null;
    if (process.env.AXE) {
      await p.addScriptTag({ path: process.env.AXE });
      axe = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    }
    const file = `${name}-${w}x${h}-${mode}.png`;
    await p.screenshot({ path: path.join(OUT, file) });
    result.push({ page: name, view: `${w}x${h}`, mode, ...m, errors: errs, axe, file });
    console.log(name, `${w}x${h}`, mode, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' / ') : '', axe && axe.length ? 'AXE ' + axe.join(' / ') : '');
    await c.close();
  }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1));
  await br.close(); srv.close();
})();
