// Needs: PORT=3101 CORS_ORIGIN=http://localhost:3101 GOMOKU_DB_PATH=<scratch>.db node server/index.js (fresh DB: register is rate-limited)
// #360/#361 real-browser pass on the isolated :3101 server. 3 users: me, a friend (online), a stranger (online).
const path = require('path');
const { chromium } = require('/run/media/ngmint/Data/Programming/Programming/HTML/gomoku-vn/node_modules/playwright');
const B = 'http://localhost:3101';
const OUT = path.join(__dirname, 'shots');
const sfx = Date.now().toString(36).slice(-5);
const errors = [];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  async function user(name, display, mode = 'light', vp = { width: 1280, height: 860 }) {
    const ctx = await browser.newContext({ locale: 'vi-VN', viewport: vp });
    const r = await ctx.request.post(B + '/api/auth/register', { data: { username: name + sfx, password: 'Passw0rd!x', displayName: display }, headers: { origin: B } });
    const j = await r.json();
    if (!j.user) throw new Error('register ' + JSON.stringify(j));
    await ctx.addInitScript(([usr, md]) => { localStorage.setItem('gvn_user', JSON.stringify(usr)); localStorage.setItem('gvn_color_mode', md); }, [{ userId: j.user.userId, displayName: display, isGuest: false }, mode]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(name + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
    return { ctx, page, id: j.user.userId, username: name + sfx, display };
  }
  const me = await user('minh', 'minhcaro');
  const fr = await user('lan', 'Lan Anh');
  const st = await user('khanh', 'Khánh Linh');
  // friendship me ↔ lan (accepted) via the API
  await me.ctx.request.post(`${B}/api/friends/${fr.username}`, { headers: { origin: B } });
  const acc = await fr.ctx.request.post(`${B}/api/friends/${me.username}/accept`, { headers: { origin: B } });
  console.log('friend accept', acc.status());
  // friend + stranger online on Home (socket session), stranger also listens for the challenge notification
  await fr.page.goto(B + '/index.html'); await st.page.goto(B + '/index.html');
  await me.page.goto(B + '/index.html'); await me.page.waitForTimeout(1500);
  const shot = async (p, n, full) => { await p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: !!full }); console.log('shot', n); };
  await shot(me.page, 'desk-1280-idle');
  await me.page.click('#qm-challenge'); await me.page.waitForTimeout(800);
  const rows = await me.page.$$eval('#home-ch .hch__row', (rs) => rs.map((r) => r.dataset.u + (r.querySelector('.hch__tag') ? '+friend' : '') + (r.querySelector('.hch__av.is-on') ? '+on' : '')));
  console.log('rows', rows);
  await me.page.click(`#home-ch .hch__row[data-u="${st.username}"]`);
  await shot(me.page, 'desk-1280-picker');
  await me.page.click('#home-ch .hch__send'); await me.page.waitForTimeout(800);
  console.log('qm-line', await me.page.textContent('#qm-line'));
  await shot(me.page, 'desk-1280-sent');
  const inc = await st.ctx.request.get(B + '/api/challenges');
  const incj = await inc.json();
  console.log('stranger incoming', JSON.stringify(incj.incoming.map((c) => ({ from: c.from.username, settings: c.settings, games: c.games }))));
  // stranger accepts → both land in the room
  const accR = await st.ctx.request.post(`${B}/api/challenges/${incj.incoming[0].id}/accept`, { headers: { origin: B } });
  console.log('accept', accR.status(), JSON.stringify(await accR.json()));
  await me.page.waitForTimeout(2000);
  console.log('me url after accept', me.page.url());
  // dark desktop
  const meD = await user('minhd', 'minhdark', 'dark');
  await meD.page.goto(B + '/index.html'); await meD.page.waitForTimeout(1200);
  await meD.page.click('#qm-challenge'); await meD.page.waitForTimeout(800);
  await shot(meD.page, 'desk-1280-dark-picker');
  // phone
  for (const mode of ['light', 'dark']) {
    const ph = await user('ph' + mode[0], 'minhcaro', mode, { width: 375, height: 812 });
    await ph.page.goto(B + '/index.html'); await ph.page.waitForTimeout(1500);
    await shot(ph.page, `phone-375-${mode}`);
    await shot(ph.page, `phone-375-${mode}-full`, true);
    const m = await ph.page.evaluate(() => {
      const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.width)]; };
      return { vh: innerHeight, tabbar: r('.ptabbar'), q: r('#home-q'), play: r('#qm-play'), chal: r('#qm-challenge'), code: r('#home-code .hq-enter'), tiles: r('.hq-tiles'), hubMore: getComputedStyle(document.querySelector('.hub-more')).display, docW: document.documentElement.scrollWidth };
    });
    console.log('phone', mode, JSON.stringify(m));
    if (mode === 'light') {
      await ph.page.click('#qm-challenge'); await ph.page.waitForTimeout(800);
      await shot(ph.page, 'phone-375-picker');
      const sheet = await ph.page.evaluate(() => { const b = document.getElementById('home-ch').getBoundingClientRect(); const tb = document.querySelector('.ptabbar'); const hit = document.elementFromPoint(187, b.bottom - 10); return { top: Math.round(b.top), bottom: Math.round(b.bottom), sendOnTop: !!hit && !!hit.closest('#home-ch'), tabbar: tb && Math.round(tb.getBoundingClientRect().top) }; });
      console.log('sheet', JSON.stringify(sheet));
    }
  }
  // desktop: tiles hidden, icons shown
  console.log('desk tiles', await me.page.evaluate(() => 0));
  const d2 = await user('dsk', 'desk');
  await d2.page.goto(B + '/index.html'); await d2.page.waitForTimeout(1000);
  console.log('desk tiles display', await d2.page.evaluate(() => [getComputedStyle(document.querySelector('.hq-tiles')).display, getComputedStyle(document.querySelector('.hub-more')).display]));
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
