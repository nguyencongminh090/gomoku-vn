// Real-browser pass of #418 on the isolated server: a seeded live game (2 guests in a room), member viewer.
const path = require('path');
const { chromium } = require('playwright');
const ioc = require('socket.io-client');
const names = [['Minh Khoa', 'Thu Hà'], ['Quốc Bảo', 'Lan Anh'], ['Minh Tú', 'Thanh Hải']];
// Seed live games: pairs of registered bots quick-match each other (casual, Luật 1, auto clock).
async function bot(name, i) {
  const r = await fetch(B + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ username: 'b' + Date.now().toString(36).slice(-5) + i, password: 'Passw0rd!x', displayName: name }) });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const s = ioc(B, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true }); // no Origin: non-browser client (auth.js isAllowedOrigin)
  await new Promise((ok, no) => { s.on('connect', ok); s.on('connect_error', no); setTimeout(() => no(new Error('connect timeout')), 8000); });
  return s;
}
const B = 'http://localhost:3101';
const OUT = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const errors = [];
  const bots = [];
  for (const [i, [a, b]] of names.entries()) {
    const sa = await bot(a, i * 2), sb = await bot(b, i * 2 + 1);
    bots.push(sa, sb);
    sa.emit('match:join', { rule: 'freestyle', time: 'auto', rated: false, wall: false, portal: false });
    await new Promise((r) => setTimeout(r, 300));
    sb.emit('match:join', { rule: 'freestyle', time: 'auto', rated: false, wall: false, portal: false });
    await new Promise((r) => setTimeout(r, 1200));
    sa.emit('room:ready'); sb.emit('room:ready'); // first game: both seats ready → playing
    await new Promise((r) => setTimeout(r, 500));
  }
  const shoot = async (name, w, h, mode, fn) => {
    const ctx = await browser.newContext({ locale: 'vi-VN', deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800 });
    const u = 'p' + Date.now().toString(36).slice(-6);
    const r = await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
    const j = await r.json().catch(() => ({}));
    if (j.user) await ctx.addInitScript((usr) => localStorage.setItem('gvn_user', JSON.stringify(usr)), { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
    await ctx.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(name + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await page.setViewportSize({ width: w, height: h });
    await page.goto(B + '/index.html'); await page.waitForTimeout(1500);
    if (fn) await fn(page);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    if (w < 800) await page.screenshot({ path: path.join(OUT, name + '-full.png'), fullPage: true });
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      navRight: Math.round(document.querySelector('.pnav__right').getBoundingClientRect().right), bg: getComputedStyle(document.querySelector('#screen-home > .hq-main'), '::before').backgroundImage.slice(0, 80) }));
    console.log(name, JSON.stringify(m));
    await ctx.close();
  };
  await shoot('built-light-390', 390, 844, 'light');
  await shoot('built-dark-390', 390, 844, 'dark');
  await shoot('built-light-360', 360, 740, 'light');
  await shoot('built-sheet-390', 390, 844, 'light', async (p) => { await p.click('#home-chips [data-chip="time"]'); await p.waitForTimeout(400); });
  await shoot('built-search-390', 390, 844, 'light', async (p) => { await p.waitForTimeout(1500); await p.click('#qm-play'); await p.waitForTimeout(2000); console.log('search', await p.evaluate(() => [document.getElementById('qm-search').hidden, document.getElementById('qm-status').textContent, document.getElementById('qm-line').textContent])); });
  await shoot('built-desktop-1280', 1280, 860, 'light');
  await shoot('built-rooms-390', 390, 844, 'light', async (p) => { await p.click('#home-live-all'); await p.waitForTimeout(800); });
  console.log('ERRORS', JSON.stringify(errors, null, 1));
  await browser.close();
  bots.forEach((b) => b.close());
})();
