'use strict';

/**
 * Ephemeral static-file server + Playwright screenshotter for Rooms Redesign v2 mockups.
 * Does NOT start server/index.js or touch any SQLite DB.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function startStatic() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const abs = path.resolve(ROOT, '.' + urlPath);
      if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(abs, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

function findChrome() {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const pwDir = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || '', '.local/share/ms-playwright');
  try {
    for (const d of fs.readdirSync(pwDir)) {
      if (d.startsWith('chromium_headless_shell-')) {
        candidates.unshift(path.join(pwDir, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
      }
    }
  } catch (e) {}
  return candidates.find((p) => fs.existsSync(p));
}

(async () => {
  const { srv, port } = await startStatic();
  const exe = findChrome();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const pages = [
    { id: 'a', file: 'a-sanh-ban.html', rulesTab: '#tab-rules' },
    { id: 'b', file: 'b-bang-dau.html', rulesTab: '#btab-rules' },
    { id: 'c', file: 'c-ky-vien.html', rulesTab: '#ctab-rules' },
  ];
  const errors = [];

  try {
    for (const p of pages) {
      for (const mode of ['dark', 'light']) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(`${p.id}-${mode}: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`${p.id}-${mode} console: ${m.text()}`); });

        const url = `http://127.0.0.1:${port}/features/rooms-redesign-v2/${p.file}${mode === 'light' ? '?mode=light' : ''}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);

        // Hide floating mockup dock for clean screenshots
        await page.addStyleTag({ content: '.mk-dock { display: none !important; }' });

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (overflow) errors.push(`${p.id}-${mode}: horizontal overflow detected`);

        await page.screenshot({ path: path.join(OUT, `${p.id}-${mode}.png`), fullPage: false });

        // Verify Rules tab renders real RoomRulesGuide diagrams on dark pass
        if (mode === 'dark') {
          await page.click(p.rulesTab);
          const rulesDiagrams = await page.locator('#rooms-rules .rg-board').count();
          if (rulesDiagrams < 5) errors.push(`${p.id}-rules: expected >=5 rule diagrams, got ${rulesDiagrams}`);
          if (p.id === 'a') {
            await page.screenshot({ path: path.join(OUT, `a-rules-dark.png`), fullPage: false });
          }
        }
        await ctx.close();
      }

      // Mobile 390x844
      const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const mpage = await mctx.newPage();
      mpage.on('pageerror', (e) => errors.push(`${p.id}-mobile: ${e.message}`));
      await mpage.goto(`http://127.0.0.1:${port}/features/rooms-redesign-v2/${p.file}`, { waitUntil: 'networkidle' });
      await mpage.evaluate(() => document.fonts.ready);
      const mOverflow = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (mOverflow) errors.push(`${p.id}-mobile: horizontal overflow detected`);
      await mpage.screenshot({ path: path.join(OUT, `${p.id}-mobile.png`), fullPage: false });
      await mctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }

  if (errors.length) {
    console.error('ISSUES:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('OK: captured all 10 screenshots with 0 errors and 0 horizontal overflow.');
})();
