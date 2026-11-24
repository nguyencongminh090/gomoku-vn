#!/usr/bin/env node
/* Shoots the concepts on the REAL index.html. Start an isolated server first:
 *   PORT=3101 GOMOKU_DB_PATH=<scratch>.db node server/index.js
 * Usage: node features/home-desktop-luxe/shoot.js [c1,c2,c3] [outDir] [quick]
 * /api/home is replaced by sample data so every shot shows the same numbers. Nothing in client/ is changed. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const HERE = __dirname;
const BASE = process.env.LX_BASE || 'http://localhost:3101';
const concepts = (process.argv[2] || 'c1,c2,c3').split(',');
const OUT = path.resolve(process.argv[3] || path.join(HERE, 'shots'));
const QUICK = process.argv[4] === 'quick';
const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.woff2': 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const thumb = (cells) => ({ x: 0, y: 0, cols: 7, rows: 7, cells: cells.join(''), last: 24 });
const T = thumb(['.......', '..b.w..', '...bw..', '..wbb..', '...wb..', '....w..', '.......']);
const HOME = {
  myGame: null, myMatches: [], tournaments: [], forum: [], learn: { total: 0, solved: 0 }, news: [],
  live: [
    { roomId: '#ABC', black: 'Minh Khang', white: 'Hà Linh', moves: 42, viewers: 12, thumb: T },
    { roomId: '#DEF', black: 'Quốc Bảo', white: 'Thu Trang', moves: 27, viewers: 7, thumb: T },
    { roomId: '#GHJ', black: 'Đức Anh', white: 'Ngọc Mai', moves: 15, viewers: 3, thumb: T },
  ],
  queue: { 'caro|auto': 2 }, queueEta: {}, stats: { online: 48, searching: 6, playing: 12 },
};
const BUSY = { ...HOME,
  myGame: { roomId: '#KLM', roomName: 'Phòng của Minh', state: 'playing', opponent: 'Hà Linh', myTurn: true, winningRule: 'caro', timerMode: 'fischer', timerSeconds: 300, timerIncrementSeconds: 3 },
  news: [{ id: 1, body: 'Giải Mùa Đông mở đăng ký đến hết tuần này.', createdAt: Date.now() }],
};

async function prepare(ctx, concept, data) {
  await ctx.route('**/__luxe/**', (r) => {
    const rel = new URL(r.request().url()).pathname.replace('/__luxe/', '');
    const file = path.join(HERE, rel);
    if (!file.startsWith(HERE) || !fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await ctx.route('**/api/home', (r) => r.fulfill({ json: data }));
  // Keep the sample numbers on screen: ignore the isolated server's real home:stats / home:live pushes.
  await ctx.route('**/js/lobby-home.js*', async (r) => {
    const res = await r.fetch();
    return r.fulfill({ response: res, body: (await res.text()).replace('function applyPush(key, value, render) {', 'function applyPush(key, value, render) { return;') });
  });
  await ctx.route((u) => u.pathname === '/' || u.pathname === '/index.html', async (r) => {
    const res = await r.fetch();
    let html = await res.text();
    html = html.replace('<html', `<html data-lx="${concept}"`)
      .replace('</head>', `<link rel="stylesheet" href="/__luxe/common.css"><link rel="stylesheet" href="/__luxe/${concept}.css"></head>`)
      .replace('</body>', '<script src="/__luxe/lx.js"></script></body>');
    return r.fulfill({ response: res, body: html });
  });
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks'], executablePath: path.join(process.env.HOME, '.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome') });
  const auth = await browser.newContext({ baseURL: BASE });
  const username = 'lx' + Date.now().toString(36);
  const reg = await auth.request.post('/api/auth/register', { data: { username, password: 'Passw0rd!x', displayName: 'Minh' }, headers: { origin: BASE } });
  if (!reg.ok()) throw new Error('register ' + reg.status() + ' ' + await reg.text());
  const user = (await reg.json()).user;
  const storageState = await auth.storageState();
  await auth.close();

  const open = async (concept, viewport, opts = {}) => {
    const ctx = await browser.newContext({ baseURL: BASE, viewport, storageState, serviceWorkers: 'block', locale: 'vi-VN', reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(([u, mode]) => { localStorage.setItem('gvn_user', JSON.stringify(u)); localStorage.setItem('gvn_color_mode', mode); }, [{ userId: user.userId, displayName: 'Minh', isGuest: false }, opts.mode || 'dark']);
    await prepare(ctx, concept, opts.data || HOME);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/401|favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('#home-n-online i', { state: 'attached', timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1100);
    return { ctx, page, errors };
  };
  const report = {};
  // Worst-case contrast of text over the artwork: hide the text, read the 95th-percentile background luminance under it.
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  async function contrast(page) {
    const items = await page.evaluate(() => {
      const sel = ['.pnav__links a', '.pnav__word', '.lx-hi', '.lx1-title', '.lx2-title', '.lx3-title', '.lx-label', '.hq-row__l', '.lx2-link span', '.hq-chip span', '.hq-list span'];
      const out = [];
      for (const s of sel) for (const e of document.querySelectorAll(s)) {
        const r = e.getBoundingClientRect(); if (!r.width || r.bottom > innerHeight) continue;
        const m = getComputedStyle(e).color.match(/[\d.]+/g).map(Number);
        out.push({ s, t: e.textContent.trim().slice(0, 16), x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(r.width, innerWidth - r.left), h: r.height, c: m.slice(0, 3) });
      }
      return out;
    });
    const tag = await page.addStyleTag({ content: 'body.lx *, body.lx *::first-line { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; }' });
    const raw = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    await tag.evaluate((n) => n.remove());
    const { data, info } = raw; let worst = {};
    for (const it of items) {
      const ls = [];
      for (let y = Math.round(it.y); y < Math.min(info.height, it.y + it.h); y += 2) for (let x = Math.round(it.x); x < Math.min(info.width, it.x + it.w); x += 2) { const i = (y * info.width + x) * info.channels; ls.push(lum(data[i], data[i + 1], data[i + 2])); }
      if (!ls.length) continue;
      ls.sort((a, b) => a - b);
      const bg = ls[Math.floor(ls.length * .95)], fg = lum(...it.c), ratio = (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05);
      if (!worst[it.s] || ratio < worst[it.s].ratio) worst[it.s] = { ratio: +ratio.toFixed(2), t: it.t };
    }
    return worst;
  }

  for (const c of concepts) {
    const sizes = QUICK ? [[1440, 900]] : [[1024, 700], [1280, 800], [1440, 900], [1920, 1080]];
    for (const [width, height] of sizes) {
      const { ctx, page, errors } = await open(c, { width, height });
      await page.screenshot({ path: `${OUT}/${c}-${width}.png` });
      report[`${c}-${width}`] = await page.evaluate(() => {
        const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left, r.top, r.right, r.bottom].map(Math.round) : null; };
        return { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, play: box('#qm-play'), code: box('#home-code'), chips: box('#home-chips') };
      });
      if (errors.length) report[`${c}-${width}`].errors = errors;
      report[`${c}-${width}`].contrast = await contrast(page);
      await ctx.close();
    }
    if (QUICK) continue;
    {
      const { ctx, page } = await open(c, { width: 1440, height: 900 });
      await page.click('#home-chips [data-chip="time"]');
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${OUT}/${c}-pick.png` });
      await page.keyboard.press('Escape');
      await page.click('#qm-play');
      await page.waitForSelector('#qm-search:not([hidden])', { timeout: 4000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${c}-search.png` });
      await page.click('#qm-actions button');
      await ctx.close();
    }
    {
      const { ctx, page } = await open(c, { width: 1440, height: 900 }, { data: BUSY });
      await page.screenshot({ path: `${OUT}/${c}-busy.png` });
      await ctx.close();
    }
    {
      const { ctx, page } = await open(c, { width: 1440, height: 900 }, { mode: 'light' });
      await page.screenshot({ path: `${OUT}/${c}-light.png` });
      await ctx.close();
    }
    {
      const { ctx, page } = await open(c, { width: 1440, height: 900 }, { reduced: true });
      report[`${c}-reduced`] = await page.evaluate(() => ({ running: document.getAnimations().filter((a) => a.playState === 'running').length, playVisible: !!document.querySelector('#qm-play').getClientRects().length }));
      await ctx.close();
    }
    if (c === 'c3') {
      const { ctx, page } = await open(c, { width: 1440, height: 900 });
      await page.hover('.lx3-panel:nth-of-type(3)');
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${c}-hover.png` });
      await ctx.close();
    }
    {
      const { ctx, page } = await open(c, { width: 390, height: 844 });
      await page.screenshot({ path: `${OUT}/${c}-phone.png` });
      report[`${c}-phone`] = await page.evaluate(() => ({ lxActive: document.body.classList.contains('lx'), roots: document.querySelectorAll('.lx-root').length }));
      await ctx.close();
    }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
