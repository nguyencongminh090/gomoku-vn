// #361 'Tuỳ chọn khác' + short-window sheet pass. Needs a fresh isolated server on :3101 (see pass-built.js).
const path = require('path');
const { chromium } = require('/run/media/ngmint/Data/Programming/Programming/HTML/gomoku-vn/node_modules/playwright');
const B = 'http://localhost:3101';
const OUT = path.join(__dirname, 'shots');
const sfx = Date.now().toString(36).slice(-4);
const errors = [];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  async function user(name, display, vp = { width: 1280, height: 720 }) {
    const ctx = await browser.newContext({ locale: 'vi-VN', viewport: vp });
    const r = await ctx.request.post(B + '/api/auth/register', { data: { username: name + sfx, password: 'Passw0rd!x', displayName: display }, headers: { origin: B } });
    const j = await r.json(); if (!j.user) throw new Error('register ' + r.status() + JSON.stringify(j));
    await ctx.addInitScript((usr) => localStorage.setItem('gvn_user', JSON.stringify(usr)), { userId: j.user.userId, displayName: display, isGuest: false });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(name + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
    return { ctx, page, username: name + sfx, display };
  }
  const shot = async (p, n) => { await p.screenshot({ path: path.join(OUT, n + '.png') }); console.log('shot', n); };
  const me = await user('me', 'minhcaro');
  const fr = await user('fr', 'Lan Anh');
  await me.ctx.request.post(`${B}/api/friends/${fr.username}`, { headers: { origin: B } });
  await fr.ctx.request.post(`${B}/api/friends/${me.username}/accept`, { headers: { origin: B } });
  await fr.page.goto(B + '/index.html');
  for (let i = 0; i < 7; i++) { const s = await user('s' + i, 'Người chơi ' + i); await s.page.goto(B + '/index.html'); }
  await me.page.goto(B + '/index.html'); await me.page.waitForTimeout(1500);
  await me.page.click('#qm-challenge'); await me.page.waitForTimeout(800);
  const m = await me.page.evaluate(() => { const p = document.getElementById('home-ch').getBoundingClientRect(); window.__sheet = document.getElementById('home-ch').className; const s = document.querySelector('#home-ch .hch__send').getBoundingClientRect(); return { cls: window.__sheet, rows: document.querySelectorAll('#home-ch .hch__row').length, panelBottom: Math.round(p.bottom), sendBottom: Math.round(s.bottom), vh: innerHeight, scrollH: document.scrollingElement.scrollHeight }; });
  console.log('1280x720 popover', JSON.stringify(m));
  await shot(me.page, 'lap-720-picker');
  await me.page.click(`#home-ch .hch__row[data-u="${fr.username}"]`);
  const vis = await me.page.evaluate(() => { const s = document.querySelector('#home-ch .hch__send').getBoundingClientRect(); const h = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2); return { sendTop: Math.round(s.top), sendBottom: Math.round(s.bottom), hit: !!h && !!h.closest('.hch__send'), scrollY }; });
  console.log('after pick', JSON.stringify(vis));
  await shot(me.page, 'lap-720-picked');
  // Tuỳ chọn khác with Lan picked → full modal
  await me.page.click('#home-ch .hch__more'); await me.page.waitForTimeout(500);
  const modal = await me.page.evaluate(() => { const o = document.querySelector('.pcrop.pchal'); if (!o) return null; const cs = getComputedStyle(o); const d = o.querySelector('.pchal__dlg').getBoundingClientRect(); return { pos: cs.position, z: cs.zIndex, title: o.querySelector('#pchal-title').textContent, dlg: [Math.round(d.left), Math.round(d.top), Math.round(d.width), Math.round(d.height)] }; });
  console.log('modal', JSON.stringify(modal));
  await shot(me.page, 'lap-720-modal');
  await me.page.click('.pchal button[type=submit]'); await me.page.waitForTimeout(800);
  console.log('after modal send: modal gone', !(await me.page.$('.pcrop')), 'line:', await me.page.textContent('#qm-line'));
  // without a pick → modal friend picker; Escape → focus back
  await me.page.click('#qm-challenge'); await me.page.waitForTimeout(600);
  await me.page.click('#home-ch .hch__more'); await me.page.waitForTimeout(800);
  console.log('modal picker rows', await me.page.$$eval('.pchal__friend .prow__t', (r) => r.map((x) => x.textContent)));
  await me.page.keyboard.press('Escape'); await me.page.waitForTimeout(200);
  console.log('after Escape: modal', !!(await me.page.$('.pcrop')), 'focus', await me.page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.className)));
  // phone: modal with pick
  const ph = await user('ph', 'phone', { width: 375, height: 812 });
  await ph.ctx.request.post(`${B}/api/friends/${fr.username}`, { headers: { origin: B } });
  await ph.page.goto(B + '/index.html'); await ph.page.waitForTimeout(1500);
  await ph.page.click('#qm-challenge'); await ph.page.waitForTimeout(800);
  await ph.page.click('#home-ch .hch__row >> nth=0');
  await ph.page.click('#home-ch .hch__more'); await ph.page.waitForTimeout(500);
  const pm = await ph.page.evaluate(() => { const o = document.querySelector('.pcrop.pchal'); const tb = document.querySelector('.ptabbar'); const hit = document.elementFromPoint(187, 780); return { z: getComputedStyle(o).zIndex, tabZ: getComputedStyle(tb).zIndex, bottomHitInModal: !!hit && !!hit.closest('.pcrop') }; });
  console.log('phone modal', JSON.stringify(pm));
  await shot(ph.page, 'phone-375-modal');
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
