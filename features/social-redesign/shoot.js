// Screenshots of the social.html (Bạn bè) redesign mockups, each injected into the REAL social.html.
// Needs an isolated server: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
// Usage: node features/social-redesign/shoot.js [ids...]   (default: s0-current + every mockups/*.html)
//        SHOTS=light-1280,dark-375 node … to limit frames.
// /api/friends*, /api/dm*, /api/challenges* are stubbed with the fixture (s0-current = today's page on the same data;
// for mockups it keeps social.js polling from writing live data anywhere).
// Fragment mini-language (rendered in the page by render()):
//   <template data-list="friends|online|offline|incoming|outgoing|chin|chout|convs|thread|suggest|feed" data-max="N" data-skip="N">
//      …{{field}}…{{#key}}…{{/key}}{{^key}}…{{/key}}…</template>
//   global {{n:online}} {{n:friends}} {{n:incoming}} {{n:outgoing}} {{n:chin}} {{n:unread}} {{n:todo}} {{n:convs}}  me {{me}} {{mytag}}  icons {{i:name}}  photos {{img:<pixabay id>}}
//   person fields: name user tag ini h st stText r h2h w l last time unread mine  sections: on play free watch off unread mine
//   challenge fields (chin/chout): person + rule size clock mode ago swap     feed: person + text ago     thread: text t me
// Name rule: every .nm gets title=<full name>; after each frame the page is checked for spills (printed per shot).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');
const B = 'http://localhost:3101';
const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
const common = fs.readFileSync(path.join(DIR, 'common.css'), 'utf8');
const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : ['s0-current', ...fs.readdirSync(path.join(DIR, 'mockups')).filter((f) => f.endsWith('.html') && !f.startsWith('_')).map((f) => f.slice(0, -5)).sort()];

// ── fixture. Display names ≤ 24 chars (auth.js), usernames 3–20 [a-z0-9_]. Two worst cases on purpose:
//    the 24-char Vietnamese name, and a 24-char name with no spaces (cannot wrap).
const F = (name, user, tag, h, st, extra = {}) => ({ name, user, tag, h, st, ...extra });
const FRIENDS = [
  F('Linh_99', 'linh_99', 1182, 330, 'play', { r: 1702, w: 7, l: 5, el: '12:40' }),
  F('Nguyễn Hoàng Phương Thảo', 'phuongthao_hn', 3307, 300, 'on', { r: 1655, w: 2, l: 4 }),
  F('Tuấn Caro', 'tuancaro', 9012, 20, 'on', { r: 1684, w: 11, l: 9 }),
  F('TranQuocBaoKhanhCaroVip1', 'caro_master_2026_hn', 5150, 200, 'watch', { r: 1990, w: 1, l: 6 }),
  F('Mai Anh', 'maianh', 4410, 280, 'play', { r: 1811, w: 3, l: 3, el: '04:05' }),
  F('Bảo Ngọc', 'baongoc', 7771, 310, 'on', { r: 1420, w: 9, l: 2 }),
  F('Duy Khánh', 'duykhanh', 2093, 45, 'off', { r: 1610, w: 4, l: 4, seen: '2 giờ trước' }),
  F('Hà Vy', 'havy', 6620, 340, 'off', { r: 1203, w: 5, l: 0, seen: 'hôm qua' }),
  F('Sơn Tùng', 'sontung', 1001, 0, 'off', { r: 2104, w: 0, l: 3, seen: '3 ngày trước' }),
  F('thanh.vu', 'thanhvu', 8124, 120, 'off', { r: 1588, w: 6, l: 7, seen: '5 phút trước' }),
];
const MORE = ['Quang Huy', 'bé Na', 'Minh Trí', 'Phương', 'Nam Anh', 'TùngLâm', 'Khoa', 'Thu Trang', 'Đặng Thị Minh Nguyệt Ánh', 'Gia Bảo', 'Hữu Phước', 'An Nhiên', 'Trọng Nhân', 'Kim Chi', 'Việt Hoàng', 'Lan Hương', 'Đức Anh', 'Thảo My']
  .map((n, i) => F(n, n.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 12) || 'user' + i, 1000 + i * 377, (i * 47) % 360, ['on', 'off', 'off', 'play', 'off', 'on'][i % 6], { r: 1300 + i * 37, w: i % 5, l: (i * 3) % 4, el: '0' + (i % 9) + ':2' + (i % 6), seen: (i + 1) + ' giờ trước' }));
const INCOMING = [F('Đặng Thị Minh Nguyệt Ánh', 'nguyetanh', 4502, 15, 'on', { r: 1544, ago: '3 phút' }), F('kaito', 'kaito', 3030, 160, 'off', { r: 1795, ago: 'hôm qua' })];
const INCOMING_BUSY = [...INCOMING, F('Gomoku_VN', 'gomoku_vn', 9999, 260, 'on', { r: 2087, ago: '1 giờ' }), F('Hoàng Long', 'hoanglong', 1540, 200, 'off', { r: 1540, ago: '2 ngày' }), F('xX_CaroKiller_Xx_2026_vn', 'carokiller', 6666, 0, 'play', { r: 1888, ago: '4 ngày' })];
const OUTGOING = [F('Quân', 'quan', 2222, 60, 'off', { ago: '2 ngày' })];
const CHIN = [{ ...FRIENDS[2], rule: 'Luật 1', size: '15×15', clock: '5+5', mode: 'Xếp hạng', ago: '40 giây' }];
const CHIN_BUSY = [...CHIN, { ...FRIENDS[1], rule: 'Luật 2', size: '15×15', clock: "3'", mode: 'Giao hữu', ago: '2 phút', swap: true }];
const CHOUT = [{ ...FRIENDS[5], rule: 'Luật 1', size: '15×15', clock: "10'", mode: 'Giao hữu', ago: '1 phút' }];
const CONVS = [
  { ...FRIENDS[0], last: 'Ván nữa không? Lần này mình cầm đen 😄', time: '2 phút', unread: 2 },
  { ...FRIENDS[1], last: 'Cảm ơn nha, ván vừa rồi hay quá', time: '1 giờ', unread: 0, mine: true },
  { ...FRIENDS[3], last: 'Bạn xem thế cờ này: 4 nước là thắng đúng không?', time: 'hôm qua', unread: 1 },
  { ...FRIENDS[6], last: 'ok mai chơi tiếp', time: 'T2', unread: 0 },
];
const THREAD = [
  { text: 'Hôm qua đánh Luật 2 với Thảo thắng không?', t: '20:41', me: false },
  { text: 'Thua 😅 bị chặn 3 đầu luôn', t: '20:42', me: true },
  { text: 'Haha. Mình mới tập khai cuộc hoa nguyệt, chỉ cho nè', t: '20:43', me: false },
  { text: 'Ván nữa không? Lần này mình cầm đen 😄', t: '20:44', me: false },
];
const SUGGEST = [F('Minh Trí', 'minhtri', 1888, 180, 'on', { r: 1888, why: 'Cùng CLB Hà Nội' }), F('caro_master', 'caro_master', 1999, 10, 'on', { r: 1999, why: 'Vừa đấu với bạn' }),
  F('Phạm Ngọc Bảo Trâm Anh Vy', 'baotram', 4040, 330, 'play', { r: 1500, why: '3 bạn chung' }), F('Khoa', 'khoa', 1450, 150, 'on', { r: 1450, why: 'Gần hạng bạn' })];
const FEED = [
  { ...FRIENDS[0], text: 'thắng <b>Mai Anh</b> sau 41 nước', ago: '5 phút' },
  { ...FRIENDS[3], text: 'lên <b>1990</b> — cao nhất từ trước tới giờ', ago: '1 giờ' },
  { ...FRIENDS[1], text: 'vào CLB <b>Caro Hà Nội</b>', ago: '3 giờ' },
  { ...FRIENDS[5], text: 'thắng chuỗi <b>5 ván</b>', ago: 'hôm qua' },
];
function data(density) {
  if (density === 'sparse') return { friends: [], incoming: [], outgoing: [], chin: [], chout: [], convs: [], thread: [], suggest: SUGGEST, feed: [] };
  if (density === 'busy') return { friends: [...FRIENDS, ...MORE], incoming: INCOMING_BUSY, outgoing: OUTGOING, chin: CHIN_BUSY, chout: CHOUT,
    convs: [...CONVS, ...MORE.slice(0, 5).map((p, i) => ({ ...p, last: ['gg', 'Mai chơi tiếp nhé', 'Đã gửi một ván cờ', 'haha', 'ok'][i], time: i + 2 + ' ngày', unread: i === 1 ? 4 : 0 }))], thread: THREAD, suggest: SUGGEST, feed: FEED };
  return { friends: FRIENDS, incoming: INCOMING, outgoing: OUTGOING, chin: CHIN, chout: CHOUT, convs: CONVS, thread: THREAD, suggest: SUGGEST, feed: FEED };
}

const FRAMES = [['light', 1280, 860, 'normal'], ['dark', 1280, 860, 'normal'], ['light', 1280, 860, 'sparse'], ['dark', 1280, 860, 'busy'],
  ['light', 768, 1024, 'normal'], ['light', 375, 812, 'normal'], ['dark', 375, 812, 'normal'], ['light', 375, 812, 'sparse'], ['light', 375, 812, 'thread']];

async function photo(id) { // downscaled data URI (features/ is not served; CSP allows data: images)
  const f = fs.readdirSync(path.join(DIR, 'img')).find((x) => x.includes(id) && x.endsWith('.jpg'));
  const buf = await sharp(path.join(DIR, 'img', f)).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

function inject({ id, html, common, d, density, be, mode }) {
  document.documentElement.setAttribute('data-mode', mode);
  const icon = (n) => `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-regular-${n}"></use></svg>`;
  const ini = (n) => n.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const ST = { on: 'Rảnh', play: 'Đang chơi', watch: 'Đang xem ván', off: '' };
  const pf = (p) => ({
    ...p, ini: ini(p.name), tag: '#' + p.tag, stText: p.st === 'off' ? (p.seen || 'Ngoại tuyến') : ST[p.st] + (p.st === 'play' && p.el ? ' · ' + p.el : ''),
    on: p.st !== 'off', free: p.st === 'on', play: p.st === 'play', watch: p.st === 'watch', off: p.st === 'off',
    h2h: (p.w ?? 0) + '–' + (p.l ?? 0), r: p.r || '', unread: p.unread || '', mine: !!p.mine, swap: !!p.swap, why: p.why || '',
  });
  const fill = (tpl, f) => tpl
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, b) => (f[k] ? b : ''))
    .replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, b) => (f[k] ? '' : b))
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in f ? f[k] : m));
  const rank = { play: 0, on: 1, watch: 2, off: 3 };
  const friends = d.friends.slice().sort((a, b) => rank[a.st] - rank[b.st]);
  const lists = { ...d, friends, online: friends.filter((p) => p.st !== 'off'), offline: friends.filter((p) => p.st === 'off') };
  const counts = { online: lists.online.length, friends: friends.length, incoming: d.incoming.length, outgoing: d.outgoing.length, chin: d.chin.length,
    unread: d.convs.reduce((a, c) => a + (c.unread || 0), 0), convs: d.convs.length, todo: d.incoming.length + d.chin.length, moreon: Math.max(0, lists.online.length - 8) };
  let out = html.replace(/\{\{i:([a-z-]+)\}\}/g, (_, n) => icon(n)).replace(/\{\{n:(\w+)\}\}/g, (_, k) => counts[k])
    .replace(/\{\{me\}\}/g, 'minhcaro').replace(/\{\{mytag\}\}/g, '#4821');
  const main = document.querySelector('main.papp');
  main.innerHTML = out;
  main.querySelectorAll('template[data-list]').forEach((t) => {
    const k = t.dataset.list; const max = +t.dataset.max || 99; const skip = +t.dataset.skip || 0;
    const items = lists[k].slice(skip, skip + max);
    const htmlOut = items.map((it, i) => fill(t.innerHTML, { ...(k === 'thread' ? it : pf(it)), i, text: it.text ?? '' })).join('');
    t.parentElement.setAttribute('data-count', items.length);
    t.insertAdjacentHTML('beforebegin', htmlOut);
    t.remove();
  });
  main.querySelectorAll('.nm').forEach((n) => { if (!n.title) n.title = n.textContent.trim(); });
  const st = document.createElement('style'); st.textContent = common; document.head.prepend(st);
  document.body.classList.add('mk', 'mk-' + id, 'mk-' + density);
  if (density === 'thread') document.body.classList.add('mk-normal');
  if (be) document.body.classList.add('mk-be');
  const seenBe = new Set();
  document.querySelectorAll('[data-be]').forEach((el) => { const k = el.dataset.be || el.outerHTML.slice(0, 40); if (seenBe.has(k)) el.removeAttribute('data-be'); else seenBe.add(k); });
}

// spill check: page-level horizontal scroll + elements whose content pokes outside a visible box, + names clipped by .nm
function check() {
  const vw = innerWidth;
  const spills = [];
  for (const el of document.querySelectorAll('main *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('svg') || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > vw + 1 || r.left < -1) && !el.closest('.hscroll')) spills.push('offscreen:' + (el.className || el.tagName));
    if (cs.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.children.length === 0 && !el.closest('.hscroll'))
      spills.push('text:' + (el.className || el.tagName) + ':' + el.textContent.slice(0, 20));
  }
  const clipped = [...document.querySelectorAll('main .nm')].filter((n) => n.scrollWidth > n.clientWidth + 1).length;
  return { hscroll: document.documentElement.scrollWidth > vw + 1, spills: [...new Set(spills)].slice(0, 6), clipped };
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
  else { console.log('register failed', r.status(), j); process.exit(1); }
  let cur = data('normal');
  const pub = (p) => ({ username: p.user, displayName: p.name, avatarUrl: null });
  await page.route(/\/api\/(friends|dm|challenges)(\/|\?|$)/, (route) => {
    const p = new URL(route.request().url()).pathname;
    let body = {};
    if (p === '/api/friends') body = { friends: cur.friends.map((f) => ({ ...pub(f), online: f.st !== 'off' })), incoming: cur.incoming.map(pub), outgoing: cur.outgoing.map(pub) };
    else if (p === '/api/friends/code') body = { code: 'minhcaro#4821' };
    else if (p === '/api/dm') body = { conversations: cur.convs.map((c) => ({ with: pub(c), last: { text: c.last, mine: !!c.mine, at: Date.now() - 60000 }, unread: c.unread || 0 })) };
    else if (p === '/api/challenges') body = { incoming: [], outgoing: [] };
    else if (p.startsWith('/api/dm/')) body = { messages: [], more: false };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const photos = {};
  let nav = 0;
  const report = [];
  for (const id of ids) {
    let html = id === 's0-current' ? null : fs.readFileSync(path.join(DIR, 'mockups', id + '.html'), 'utf8');
    if (html) for (const m of html.matchAll(/\{\{img:(\d+)\}\}/g)) photos[m[1]] ||= await photo(m[1]);
    if (html) html = html.replace(/\{\{img:(\d+)\}\}/g, (_, n) => photos[n]).replace('{{sheet}}', () => fs.readFileSync(path.join(DIR, 'mockups', '_sheet.html'), 'utf8'));
    for (const [mode, w, h, density] of FRAMES) {
      const tag = `${mode}-${w}${density === 'normal' ? '' : '-' + density}`;
      if (only && !only.includes(tag)) continue;
      if (!html && density === 'thread') continue;
      cur = data(density === 'thread' ? 'normal' : density);
      await ctx.addCookies([{ name: 'gvn_mode', value: mode, url: B }]);
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript((m) => localStorage.setItem('gvn_color_mode', m), mode);
      await page.goto(B + '/social.html?f=' + (++nav)); await page.waitForTimeout(900);
      if (html) await page.evaluate(inject, { id, html, common, d: cur, density, mode, be: mode === 'light' && density === 'normal' && w === 1280 });
      else await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
      await page.waitForTimeout(800);
      const c = await page.evaluate(check);
      const name = `${id}-${tag}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: w <= 768 || density === 'busy' });
      report.push(`${name} hscroll=${c.hscroll} clipped=${c.clipped}${c.spills.length ? ' SPILL ' + c.spills.join(' | ') : ''}`);
      process.stdout.write('.');
    }
  }
  console.log('\n' + report.join('\n'));
  await browser.close();
})();
