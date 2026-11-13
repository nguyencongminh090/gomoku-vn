// Screenshots of the rooms-tab (Phòng) redesign mockups, each injected into the REAL index.html#rooms.
// Needs an isolated server: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
// Usage: node features/rooms-redesign/shoot.js [ids...]   (default: every mockups/*.html)
//        SHOTS=light-1280,dark-375 node … to limit frames.
// Fragment mini-language (rendered in the page by render()):
//   <template data-list="open|live|ready|all|seated|online" data-max="N">…{{field}}…{{#key}}…{{/key}}{{^key}}…{{/key}}…</template>
//   global: {{n:open}} {{n:live}} {{n:all}} {{n:online}} {{n:viewers}} {{n:queue}}  icons {{i:name}}  photos {{img:<pixabay id>}}
//   room fields: code name p1 p1i p1h p1r p2 p2i p2h p2r rule size time mode viewers elapsed moves state board  sections: p2 open live ready rated viewers
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');
const B = 'http://localhost:3101';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
const common = fs.readFileSync(path.join(DIR, 'common.css'), 'utf8');
const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(DIR, 'mockups')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();

// ── fixture: what listRooms() already sends, plus the "cần backend" fields (rating, elapsed, moves → mini board)
const P = (name, h, r) => ({ name, h, r });
const ROOMS = [
  { code: 'A3F', name: 'Giao lưu buổi sáng', p1: P('Tuấn Caro', 20, 1684), p2: P('Linh_99', 330, 1702), state: 'live', rule: 'Luật 1', size: '15×15', time: "5+5", mode: 'Xếp hạng', users: 9, elapsed: '12:40', moves: 37 },
  { code: 'K7B', name: 'Ai vào chơi 3 phút', p1: P('HoàngLong', 200, 1540), p2: null, state: 'open', rule: 'Luật 1', size: '15×15', time: "3'", mode: 'Xếp hạng', users: 1 },
  { code: 'M2Q', name: 'Luyện khai cuộc', p1: P('Mai Anh', 280, 1811), p2: P('kaito', 160, 1795), state: 'live', rule: 'Luật 2', size: '19×19', time: '60s/nước', mode: 'Giao hữu', users: 4, elapsed: '04:05', moves: 14 },
  { code: 'P9D', name: 'Phòng của Ngọc', p1: P('Bảo Ngọc', 310, 1420), p2: null, state: 'open', rule: 'Luật 1 · Ô khoá', size: '15×15', time: "10'", mode: 'Giao hữu', users: 2 },
  { code: 'T4H', name: 'Chờ bắt đầu', p1: P('Duy Khánh', 45, 1610), p2: P('thanh.vu', 120, 1588), state: 'ready', rule: 'Luật 1', size: '15×15', time: "5+3", mode: 'Xếp hạng', users: 2 },
  { code: 'C8N', name: 'Kèo cao thủ', p1: P('Sơn Tùng', 0, 2104), p2: P('Gomoku_VN', 260, 2087), state: 'live', rule: 'Luật 2', size: '15×15', time: "5+5", mode: 'Xếp hạng', users: 23, elapsed: '18:02', moves: 61 },
  { code: 'R5E', name: 'Ván tập cho người mới', p1: P('Hà Vy', 340, 1203), p2: null, state: 'open', rule: 'Luật 1', size: '15×15', time: '90s/nước', mode: 'Giao hữu', users: 1 },
];
const EXTRA = [['Quang Huy', 40, 1650], ['bé Na', 300, 1300], ['Minh Trí', 180, 1888], ['caro_master', 10, 1999], ['Phương', 330, 1500], ['Nam Anh', 220, 1720], ['TùngLâm', 90, 1610], ['Khoa', 150, 1450], ['Thu Trang', 350, 1560]];
function busyRooms() {
  const out = ROOMS.slice();
  const names = ['Đấu tập tối', 'Ai rảnh không', 'Thử Luật 2', 'Phòng 19×19', 'Giải trí', 'Tìm đối thủ 1800+', 'Chơi cho vui', 'Ván nhanh', 'Kèo phục thù'];
  EXTRA.forEach(([n, h, r], i) => {
    const live = i % 3 !== 1;
    const opp = EXTRA[(i + 4) % EXTRA.length];
    out.push({ code: 'X' + (i + 1) + 'Z', name: names[i], p1: P(n, h, r), p2: live ? P(opp[0], opp[1], opp[2]) : null, state: live ? 'live' : 'open', rule: i % 4 === 2 ? 'Luật 2' : 'Luật 1', size: i === 3 ? '19×19' : '15×15', time: ["3'", '5+5', "10'"][i % 3], mode: i % 2 ? 'Giao hữu' : 'Xếp hạng', users: live ? 2 + (i * 3) % 8 : 1, elapsed: live ? `0${i % 9}:${10 + i * 4}` : '', moves: live ? 8 + i * 5 : 0 });
  });
  return out;
}
const SPARSE = [ROOMS[1]];
const ONLINE = [['Tuấn Caro', 20, 'đang chơi'], ['Linh_99', 330, 'đang chơi'], ['HoàngLong', 200, 'chờ đối thủ'], ['Mai Anh', 280, 'đang chơi'], ['Quân', 60, 'rảnh'], ['Hà Vy', 340, 'chờ đối thủ'], ['trung_kien', 100, 'rảnh'], ['Bảo Ngọc', 310, 'chờ đối thủ'], ['Sơn Tùng', 0, 'đang chơi'], ['Minh Trí', 180, 'rảnh'], ['Thu Trang', 350, 'xem ván'], ['Khoa', 150, 'rảnh'], ['Nam Anh', 220, 'xem ván'], ['caro_master', 10, 'rảnh']]
  .map(([name, h, st]) => ({ name, h, st }));

const FRAMES = [['light', 1280, 860, 'normal'], ['dark', 1280, 860, 'normal'], ['light', 1280, 860, 'sparse'], ['dark', 1280, 860, 'busy'],
  ['light', 768, 1024, 'normal'], ['light', 375, 812, 'normal'], ['dark', 375, 812, 'normal'], ['light', 375, 812, 'sparse']];

async function photo(id) { // downscaled data URI (features/ is not served; CSP allows data: images)
  const f = fs.readdirSync(path.join(DIR, 'img')).find((x) => x.includes(id) && x.endsWith('.jpg'));
  const buf = await sharp(path.join(DIR, 'img', f)).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

function inject({ id, html, common, rooms, online, density, be, mode }) {
  document.documentElement.setAttribute('data-mode', mode); // account prefs can override the cookie
  const icon = (n) => `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-regular-${n}"></use></svg>`;
  const ini = (n) => n.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  // deterministic pseudo-random mini board for a live game
  function board(r, n = 15) {
    let seed = [...r.code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const taken = new Set(); const stones = [];
    let x = 7, y = 7;
    for (let k = 0; k < (r.moves || 0) && k < 120; k++) {
      let tries = 0;
      do { x = Math.max(1, Math.min(n - 2, x + Math.round(rnd() * 4 - 2))); y = Math.max(1, Math.min(n - 2, y + Math.round(rnd() * 4 - 2))); } while (taken.has(x + ',' + y) && ++tries < 30);
      if (taken.has(x + ',' + y)) continue;
      taken.add(x + ',' + y); stones.push([x, y, k % 2]);
    }
    let d = '';
    for (let i = 0; i < n; i++) d += `M.5 ${i + .5}H${n - .5}M${i + .5} .5V${n - .5}`;
    const s = stones.map(([a, b, c]) => `<circle class="${c ? 'w' : 'b'}" cx="${a + .5}" cy="${b + .5}" r=".42"/>`).join('');
    const l = stones.at(-1);
    return `<svg class="mb" viewBox="0 0 ${n} ${n}" aria-hidden="true"><rect class="mb-bg" width="${n}" height="${n}" rx=".4"/><path d="${d}"/>${s}${l ? `<circle class="last" cx="${l[0] + .5}" cy="${l[1] + .5}" r=".22"/>` : ''}</svg>`;
  }
  const fields = (r) => ({
    code: '#' + r.code, flap: [...r.code].map((c) => '<i>' + c + '</i>').join(''), name: r.name, p1: r.p1.name, p1i: ini(r.p1.name), p1h: r.p1.h, p1r: r.p1.r,
    p2: r.p2 ? r.p2.name : '', p2i: r.p2 ? ini(r.p2.name) : '', p2h: r.p2 ? r.p2.h : 0, p2r: r.p2 ? r.p2.r : '',
    rule: r.rule, size: r.size, time: r.time, mode: r.mode, viewers: Math.max(0, r.users - (r.p2 ? 2 : 1)), elapsed: r.elapsed || '', moves: r.moves || 0,
    state: { live: 'Đang đấu', open: 'Chờ đối thủ', ready: 'Sắp bắt đầu' }[r.state], board: board(r), boardEmpty: board({ code: r.code, moves: 0 }),
    open: r.state === 'open', live: r.state === 'live', ready: r.state === 'ready', rated: r.mode === 'Xếp hạng',
  });
  const ofields = (u) => ({ name: u.name, ini: ini(u.name), h: u.h, st: u.st, busy: u.st === 'đang chơi' });
  const fill = (tpl, f) => tpl
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, b) => (f[k] ? b : ''))
    .replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, b) => (f[k] ? '' : b))
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in f ? f[k] : m));
  const lists = {
    all: rooms, open: rooms.filter((r) => r.state === 'open'), live: rooms.filter((r) => r.state === 'live'),
    seated: rooms.filter((r) => r.state !== 'open'), watchable: rooms.filter((r) => r.state !== 'open'), ready: rooms.filter((r) => r.state === 'ready'),
  };
  const counts = { open: lists.open.length, live: lists.live.length, all: rooms.length, seated: lists.seated.length,
    online: density === 'sparse' ? 3 : density === 'busy' ? 214 : 128, viewers: rooms.reduce((a, r) => a + Math.max(0, r.users - (r.p2 ? 2 : 1)), 0), queue: density === 'sparse' ? 0 : 6 };
  let out = html.replace(/\{\{i:([a-z-]+)\}\}/g, (_, n) => icon(n)).replace(/\{\{n:(\w+)\}\}/g, (_, k) => counts[k]);
  out = out.replace(/(<template[\s\S]*?<\/template>)|\{\{boardEmpty\}\}/g, (m, tpl) => tpl || board({ code: 'ZZZ', moves: 0 }));
  const main = document.querySelector('main.lobby');
  main.innerHTML = out;
  main.querySelectorAll('template[data-list]').forEach((t) => {
    const k = t.dataset.list; const max = +t.dataset.max || 99; const skip = +t.dataset.skip || 0;
    const src = k === 'online' ? online.slice(0, density === 'sparse' ? 3 : 99) : lists[k];
    const items = src.slice(skip, skip + max);
    const htmlOut = items.map((it, i) => fill(t.innerHTML, { ...(k === 'online' ? ofields(it) : fields(it)), i })).join('');
    t.parentElement.setAttribute('data-count', items.length);
    t.insertAdjacentHTML('beforebegin', htmlOut);
    t.remove();
  });
  const st = document.createElement('style'); st.textContent = common; document.head.prepend(st);
  document.body.classList.add('mk', 'mk-' + id, 'mk-' + density);
  if (be) document.body.classList.add('mk-be');
  const seenBe = new Set(); // one "cần backend" badge per kind
  document.querySelectorAll('[data-be]').forEach((el) => { const k = el.dataset.be || el.outerHTML.slice(0, 40); if (seenBe.has(k)) el.removeAttribute('data-be'); else seenBe.add(k); });
  document.querySelectorAll('[role="tablist"]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]'); if (!b) return;
    g.querySelectorAll('[role="tab"]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  }));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN' });
  const page = await ctx.newPage();
  const u = 'minh' + Date.now().toString(36).slice(-5);
  const r = await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
  const j = await r.json().catch(() => ({}));
  if (r.ok() && j.user) await ctx.addInitScript((usr) => localStorage.setItem('gvn_user', JSON.stringify(usr)), { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  else { console.log('register failed', r.status()); await page.goto(B + '/login.html'); await page.click('#btn-guest'); await page.waitForTimeout(1200); }
  const photos = {};
  let nav = 0;
  for (const id of ids) {
    let html = fs.readFileSync(path.join(DIR, 'mockups', id + '.html'), 'utf8');
    for (const m of html.matchAll(/\{\{img:(\d+)\}\}/g)) photos[m[1]] ||= await photo(m[1]);
    html = html.replace(/\{\{img:(\d+)\}\}/g, (_, n) => photos[n]);
    for (const [mode, w, h, density] of FRAMES) {
      const tag = `${mode}-${w}${density === 'normal' ? '' : '-' + density}`;
      if (only && !only.includes(tag)) continue;
      await ctx.addCookies([{ name: 'gvn_mode', value: mode, url: B }]);
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
      await page.goto(B + '/index.html?f=' + (++nav) + '#rooms'); await page.waitForTimeout(700); // new query = real reload (hash-only goto keeps the old DOM)
      const rooms = density === 'sparse' ? SPARSE : density === 'busy' ? busyRooms() : ROOMS;
      await page.evaluate(inject, { id, html, common, rooms, online: ONLINE, density, mode, be: mode === 'light' && density === 'normal' && w === 1280 });
      await page.waitForTimeout(900);
      const name = `${id}-${tag}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: w <= 768 || density === 'busy' });
      process.stdout.write(name + ' ');
    }
  }
  await browser.close();
})();
