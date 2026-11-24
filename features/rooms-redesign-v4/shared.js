'use strict';
/**
 * shared.js: fixture + chrome for the Rooms v4 mockups (G Một cột, H Hai cột, I Bảng tra).
 * v4 rules (planning.md): one tab per rule, no "Tất cả"; rank shown everywhere = rank in the selected rule;
 * no mini boards. Avatars come from the real PlatformShell.avatar() (one source, consistency rule 9).
 * URL params: ?mode=light  ?n=0|1|many  ?rule=freestyle|caro|standard|renju  ?tab=rules  ?sheet=1  ?f=open
 */
(function (global) {
  const SPRITE = '../../client/assets/icons/phosphor-sprite.svg';
  const qs = new URLSearchParams(location.search);

  // Tab order = the create-room rule select. Ids = WINNING_RULES = rankings CATEGORIES.
  // "Tiêu chuẩn" (room) vs "Standard" (rankings page) is still open (planning.md Q5).
  const RULES = [
    { id: 'freestyle', label: 'Luật 1', lead: 'Từ 5 quân liên tiếp là thắng.' },
    { id: 'caro', label: 'Luật 2', lead: 'Từ 5 quân liên tiếp, tối đa một đầu bị chặn.' },
    { id: 'standard', label: 'Tiêu chuẩn', lead: 'Đúng 5 quân liên tiếp mới thắng.' },
    { id: 'renju', label: 'Renju', lead: 'Đen cần đúng 5 và bị cấm 3-3, 4-4. Trắng thắng từ 5.' },
  ];
  const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]));
  const rule = RULE[qs.get('rule')] ? qs.get('rule') : 'freestyle';

  // ratings per category: [rating, games]; missing = no rank in that rule
  const U = (id, name, ratings, extra = {}) => ({ id, name, ratings, ...extra });
  let USERS = [
    U('u1', 'Vũ Thảo Nguyên', { freestyle: [2104, 412], caro: [1980, 88], renju: [1840, 20] }),
    U('u2', 'Phạm Khánh Linh', { freestyle: [2087, 350], caro: [1870, 40] }),
    U('u3', 'Đặng Quốc Bảo', { renju: [1962, 260], freestyle: [1890, 70], standard: [1800, 15] }),
    U('u4', 'Lê Hoàng Phúc', { renju: [1931, 198], caro: [1702, 12] }),
    U('u5', 'Trần Minh Khôi', { freestyle: [1842, 186], caro: [1795, 140] }, { me: true }),
    U('u6', 'Lý Hải Đăng', { caro: [1888, 301], freestyle: [1760, 90] }),
    U('u7', 'Võ Bảo Châu', { renju: [1650, 6], freestyle: [1580, 8] }, { provisional: true }),
    U('u8', 'Bùi Đức Anh', { caro: [1811, 222], freestyle: [1700, 30] }),
    U('u9', 'Hoàng Gia Huy', { caro: [1734, 160] }),
    U('u10', 'Nguyễn Thị Hồng Ánh Phương', { standard: [1795, 120], freestyle: [1702, 64] }),
    U('u11', 'Phan Đức Minh', { freestyle: [1690, 95] }),
    U('u12', 'Đỗ Nhật Nam', { freestyle: [1612, 140], caro: [1590, 22] }),
    U('u13', 'Ngô Thanh Trúc', { freestyle: [1588, 77] }),
    U('u14', 'Tạ Quang Vinh', { standard: [1720, 54] }),
    U('u15', 'Mai Anh Thư', { caro: [1540, 48] }),
    U('u16', 'caro_master99', { caro: [1999, 520], freestyle: [1950, 300] }),
    U('u17', 'Hà Vy', { freestyle: [1203, 9] }, { provisional: true }),
    U('u18', 'Trịnh Công Sơn', { renju: [1720, 80], standard: [1680, 60] }),
    U('u19', 'Lâm Tuấn Kiệt', { freestyle: [1530, 33] }),
    U('u20', 'Kiều Oanh', {}),
    U('u21', 'Dương Thùy Linh', { caro: [1660, 70] }),
    U('u22', 'Châu Gia Bảo', { freestyle: [1475, 18] }),
    U('u23', 'Quách Ngọc Hân', { standard: [1610, 25] }),
    U('u24', 'Tôn Thất Khang', { renju: [1580, 40] }),
    U('g1', 'Khách 482', {}, { guest: true }),
    U('g2', 'Khách 117', {}, { guest: true }),
  ];

  // Tables: RoomManager.lobbyEntry fields (rule, seats, timer*, state, ranked). No moves: v4 drops the board.
  // tm = [timerMode, timerSeconds, timerIncrementSeconds]
  const T = (code, rule, p1, p2, state, tm, o = {}) => ({ code, rule, p1, p2, state, tm, size: 15, ranked: true, viewers: 0, ...o });
  let TABLES = [
    T('K7B', 'freestyle', 'u11', null, 'waiting', ['total', 180, 0], { waitMin: 2 }),
    T('R5E', 'freestyle', null, 'u17', 'waiting', ['move', 90, 0], { ranked: false, waitMin: 1 }),
    T('A3F', 'freestyle', 'u1', 'u2', 'live', ['total', 300, 5], { viewers: 23 }),
    T('D7K', 'freestyle', 'u12', 'u13', 'live', ['total', 180, 2], { size: 19, ranked: false, viewers: 2 }),
    T('N6V', 'freestyle', 'g1', 'u19', 'live', ['total', 60, 0], { ranked: false, viewers: 1 }),
    T('Q8Z', 'freestyle', 'u22', 'u7', 'ready', ['total', 600, 0]),
    T('W2C', 'freestyle', 'u3', null, 'waiting', ['total', 600, 5], { waitMin: 6 }),
    T('P9D', 'caro', 'u9', null, 'waiting', ['move', 60, 0], { ranked: false, waitMin: 5 }),
    T('C8N', 'caro', 'u16', 'u6', 'live', ['total', 300, 5], { viewers: 11 }),
    T('B4L', 'caro', 'u8', 'u15', 'live', ['move', 60, 0], { size: 19, viewers: 3 }),
    T('S2W', 'standard', 'u14', null, 'waiting', ['total', 600, 5], { waitMin: 7 }),
    T('T4H', 'standard', 'u10', 'u23', 'ready', ['total', 300, 0], { ranked: false }),
    T('M2Q', 'renju', 'u3', 'u4', 'live', ['total', 600, 0], { viewers: 7 }),
    T('H1Y', 'renju', 'u18', 'u24', 'live', ['total', 300, 5], { viewers: 4 }),
  ];

  // ?n=many: a busy evening, 312 online and 64 tables (the long-list state).
  const nParam = qs.get('n');
  if (nParam === 'many') {
    const fam = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
    const mid = ['Văn', 'Thị', 'Minh', 'Đức', 'Ngọc', 'Gia', 'Hải', 'Thanh'];
    const giv = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hiếu', 'Khoa', 'Lan', 'Long', 'Mai', 'Nam', 'Phong', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trung', 'Tú', 'Vy', 'Yến'];
    let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32; };
    for (let i = 0; i < 286; i++) {
      const r = {};
      for (const c of ['freestyle', 'caro', 'standard', 'renju']) {
        const p = { freestyle: 0.75, caro: 0.5, standard: 0.2, renju: 0.1 }[c];
        if (rnd() < p) r[c] = [Math.round(1150 + rnd() * 750), 5 + Math.floor(rnd() * 300)];
      }
      const name = `${fam[i % fam.length]} ${mid[(i * 7) % mid.length]} ${giv[(i * 5) % giv.length]}`;
      USERS.push(U('m' + i, name, r, rnd() < 0.08 ? { guest: true, name: 'Khách ' + (100 + i) } : {}));
    }
    USERS.forEach((u) => { if (u.guest) { u.ratings = {}; if (!/^Khách/.test(u.name)) u.name = 'Khách ' + u.id.slice(1); } });
    const codes = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const tms = [['total', 60, 0], ['total', 180, 2], ['total', 300, 5], ['total', 600, 0], ['move', 60, 0]];
    for (let i = 0; i < 50; i++) {
      const rr = ['freestyle', 'freestyle', 'freestyle', 'caro', 'caro', 'standard', 'renju'][i % 7];
      const a = 'm' + (i * 2); const b = i % 3 === 0 ? null : 'm' + (i * 2 + 1);
      TABLES.push(T(codes[i % 24] + (i % 9 + 1) + codes[(i * 7) % 24], rr, a, b, b ? (i % 5 === 0 ? 'ready' : 'live') : 'waiting', tms[i % 5], { waitMin: i % 9 + 1, viewers: i % 6 }));
    }
  }
  if (nParam === '0') TABLES = [];
  if (nParam === '1') TABLES = [TABLES[0]];
  const byId = Object.fromEntries(USERS.map((u) => [u.id, u]));

  // Rank = 1-based leaderboard position in that category. The lobby holds a slice of all ranked players,
  // so rank ≈ 1 + better × 3.
  for (const u of USERS) {
    u.rank = {};
    for (const [cat, [r]] of Object.entries(u.ratings)) {
      const better = USERS.filter((v) => v.ratings[cat] && v.ratings[cat][0] > r).length;
      u.rank[cat] = 1 + better * 3 + (u.id.length + r) % 3;
    }
  }

  const seatsOf = (t) => [t.p1, t.p2].filter(Boolean).length;
  const STATS = {
    online: USERS.length,
    playing: TABLES.filter((t) => t.state === 'live').reduce((n, t) => n + seatsOf(t), 0),
  };
  const STATE = {
    waiting: { label: 'Chờ đối thủ', cls: 'is-waiting', order: 0 },
    ready: { label: 'Đủ người', cls: 'is-ready', order: 1 },
    live: { label: 'Đang đấu', cls: 'is-live', order: 2 },
  };

  // ── helpers ───────────────────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="${SPRITE}#ph-regular-${n}"></use></svg>`;
  /** The production avatar: PlatformShell.avatar(url, name, cls). Fixture has no avatarUrl → initials. */
  const avatar = (u, cls = 'pav--sm') => global.PlatformShell.avatar(u.avatarUrl || null, u.name, cls).outerHTML;

  /** Standing of `u` in rule `r`: {rating, rank, prov} | null. */
  function standing(u, r = rule) {
    if (!u || u.guest || !u.ratings[r]) return null;
    return { rating: u.ratings[r][0], games: u.ratings[r][1], rank: u.rank[r], prov: !!u.provisional };
  }
  /** Rank chip: "#12", "#12?" provisional, "Chưa có hạng" (no games in this rule), "Khách". Always text. */
  function rankChip(u, r = rule) {
    if (u.guest) return '<span class="vr vr--none">Khách</span>';
    const s = standing(u, r);
    if (!s) return '<span class="vr vr--none">Chưa có hạng</span>';
    if (s.prov) return `<span class="vr vr--prov" title="Elo tạm tính, chưa đủ ván">#${s.rank}?</span>`;
    const top = s.rank <= 3 ? ` vr--top${s.rank}` : '';
    return `<span class="vr${top}">#${s.rank}</span>`;
  }
  /** Card chip, Elo only (user 2026-11-24: no leaderboard rank inside a table card). Always text. */
  function eloChip(u, r = rule) {
    if (u.guest) return '<span class="ve ve--none">Khách</span>';
    const s = standing(u, r);
    if (!s) return '<span class="ve ve--none" title="Chưa có ván tính điểm ở luật này">Mới</span>';
    return s.prov ? `<span class="ve ve--prov" title="Elo tạm tính, chưa đủ ván">${s.rating}?</span>` : `<span class="ve">${s.rating}</span>`;
  }
  const eloOf = (u, r = rule) => { const s = standing(u, r); return s ? `<span class="velo">${s.rating}${s.prov ? '?' : ''}</span>` : ''; };

  /** "5 phút + 5 giây", "1 phút/nước", "3 phút". Built from timerMode/Seconds/Increment (sent today). */
  function timeText(t) {
    const [mode, sec, inc] = t.tm;
    const m = (x) => (x % 60 === 0 ? `${x / 60} phút` : `${x} giây`);
    if (mode === 'move') return `${m(sec)}/nước`;
    return inc ? `${m(sec)} + ${inc} giây` : m(sec);
  }
  const timeBucket = (t) => (t.tm[0] === 'move' ? 'move' : t.tm[1] <= 180 ? 'fast' : t.tm[1] <= 300 ? 'mid' : 'slow');
  const TIME_FILTERS = [['fast', 'Chớp ≤ 3 phút'], ['mid', 'Nhanh 5 phút'], ['slow', 'Chậm ≥ 10 phút'], ['move', 'Theo nước']];

  /** Tables of the selected rule after filters; sorted waiting → ready → live, then newest wait first. */
  function tablesFor(r, f = {}) {
    const me = USERS.find((u) => u.me);
    const myR = standing(me, r);
    return TABLES.filter((t) => t.rule === r)
      .filter((t) => !f.open || t.state === 'waiting')
      .filter((t) => !f.time || !f.time.size || f.time.has(timeBucket(t)))
      .filter((t) => !f.top || [t.p1, t.p2].filter(Boolean).some((id) => { const s = standing(byId[id], r); return s && s.rank <= f.top; }))
      .filter((t) => {
        if (!f.near || !myR) return true;
        return [t.p1, t.p2].filter(Boolean).some((id) => { const s = standing(byId[id], r); return s && Math.abs(s.rating - myR.rating) <= 200; });
      })
      .sort((a, b) => STATE[a.state].order - STATE[b.state].order || (a.waitMin || 0) - (b.waitMin || 0));
  }
  /** "Gần trình tôi" needs my own rank in r; guests and unranked get a disabled control with a reason. */
  const canNear = (r) => !!standing(USERS.find((u) => u.me), r);
  const countFor = (r) => TABLES.filter((t) => t.rule === r).length;
  const openFor = (r) => TABLES.filter((t) => t.rule === r && t.state === 'waiting').length;

  /** Online roster for rule r: ranked first by rank, then "no rank here" by name, guests last. */
  function rosterFor(r, q = '') {
    const ql = q.trim().toLowerCase();
    const list = USERS.filter((u) => !ql || u.name.toLowerCase().includes(ql));
    const ranked = list.filter((u) => standing(u, r)).sort((a, b) => a.rank[r] - b.rank[r]);
    const none = list.filter((u) => !u.guest && !standing(u, r)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    const guests = list.filter((u) => u.guest);
    return { ranked, none, guests, total: list.length };
  }

  /** One seat: avatar + name + rank chip (rank in the TABLE's rule = selected tab). Empty seat is a label. */
  function seat(id, r, { cls = '' } = {}) {
    if (!id) return `<span class="vseat vseat--empty ${cls}"><span class="vseat__hole" aria-hidden="true"></span><span class="vseat__n">Ghế trống</span></span>`;
    const u = byId[id];
    return `<span class="vseat ${cls}">${avatar(u)}<span class="vseat__n">${esc(u.name)}</span>${rankChip(u, r)}</span>`;
  }
  const stateChip = (t) => `<span class="vstate ${STATE[t.state].cls}">${STATE[t.state].label}</span>`;
  const enterBtn = (t) => `<button type="button" class="vbtn ${t.state === 'waiting' ? 'vbtn--primary' : 'vbtn--ghost'}" data-enter="${t.code}" aria-label="Vào bàn ${t.code}">Vào</button>`;
  /** Secondary facts as separate pills (ticket-rows: never "a · b · c"). */
  function pills(t) {
    const p = [`<span class="vpill">${icon('timer')}${esc(timeText(t))}</span>`];
    if (t.size !== 15) p.push(`<span class="vpill">Bàn ${t.size}×${t.size}</span>`);
    p.push(t.ranked ? `<span class="vpill vpill--ranked">${icon('crown-simple')}Tính điểm</span>` : '<span class="vpill">Giao hữu</span>');
    return p.join('<span class="sr-only">, </span>');
  }

  // ── chrome: platform-shell header + phone tab bar + review dock + sheet ─────
  function renderShell(active) {
    const me = USERS.find((u) => u.me);
    document.getElementById('pl-shell').innerHTML = `
      <header class="pnav">
        <a class="pnav__brand" href="index.html"><span class="pnav__word">Play<b>3CR</b></span></a>
        <nav class="pnav__links" aria-label="Chính">
          <a href="#home">Trang chủ</a><a href="#rooms" class="is-active" aria-current="page">Phòng</a>
          <a href="#tournaments">Giải đấu</a><a href="#rankings">Xếp hạng</a><a href="#clubs">Hội nhóm</a><a href="#learn">Học</a>
        </nav>
        <div class="pnav__right">
          <button type="button" class="pnav__mode" id="mk-mode" aria-label="Đổi chế độ sáng/tối">${icon('sun', 'icon--md')}</button>
          <div class="pnav__acct"><button type="button" class="pnav__me" aria-label="Menu tài khoản">${avatar(me)}<span class="pnav__name">Minh Khôi</span>${icon('caret-down')}</button></div>
        </div>
      </header>
      <nav class="ptabbar" aria-label="Điều hướng di động">
        <a href="#home"><svg class="icon icon--lg" aria-hidden="true"><use href="${SPRITE}#ph-bold-house"></use></svg><span>Trang chủ</span></a>
        <a href="#rooms" class="is-active" aria-current="page">${icon('door-open', 'icon--lg')}<span>Phòng</span></a>
        <a href="#rankings">${icon('crown-simple', 'icon--lg')}<span>Xếp hạng</span></a>
        <a href="#tournaments">${icon('trophy', 'icon--lg')}<span>Giải</span></a>
        <a href="#me">${icon('user-circle', 'icon--lg')}<span>Tôi</span></a>
      </nav>`;
    const dock = document.createElement('div');
    dock.className = 'mk-dock';
    const keep = (extra) => { const p = new URLSearchParams(location.search); Object.entries(extra).forEach(([k, v]) => (v == null ? p.delete(k) : p.set(k, v))); const s = p.toString(); return location.pathname.split('/').pop() + (s ? '?' + s : ''); };
    dock.innerHTML = `<a href="index.html">${icon('arrow-left')}Thư viện</a>`
      + [['g', 'g-mot-cot.html', 'G Một cột'], ['h', 'h-hai-cot.html', 'H Hai cột'], ['i', 'i-bang-tra.html', 'I Bảng tra']]
        .map(([id, f, l]) => `<a href="${f}${location.search}" class="${id === active ? 'is-on' : ''}">${l}</a>`).join('')
      + `<a href="${keep({ n: null })}">Vừa</a><a href="${keep({ n: 'many' })}">Đông</a><a href="${keep({ n: '0' })}">Trống</a>`;
    document.body.appendChild(dock);
    if (qs.get('mode') === 'light') document.documentElement.setAttribute('data-mode', 'light');
    const sync = () => { document.getElementById('mk-mode').innerHTML = icon(document.documentElement.dataset.mode === 'light' ? 'moon' : 'sun', 'icon--md'); };
    document.getElementById('mk-mode').addEventListener('click', () => {
      const r = document.documentElement;
      if (r.dataset.mode === 'light') r.removeAttribute('data-mode'); else r.dataset.mode = 'light';
      sync();
    });
    sync();
    const toast = document.createElement('div');
    toast.className = 'mk-toast'; toast.id = 'mk-toast'; toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-enter]'); if (b) showToast('Vào bàn #' + b.dataset.enter); });
  }
  let tt = null;
  function showToast(msg) {
    const el = document.getElementById('mk-toast');
    el.textContent = msg; el.classList.add('is-show');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('is-show'), 1800);
  }
  /** The real Rules guide, opened on the selected rule ("Đang chọn"). */
  function renderRules(container, r) {
    if (global.RoomRulesGuide && typeof global.t === 'function') global.RoomRulesGuide.render(container, { t: global.t, active: [r] });
  }
  /** Tabs with roving aria-selected; onChange(id). */
  function wireTabs(root, onChange) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[role="tab"]');
      if (!b || !root.contains(b)) return;
      root.querySelectorAll('[role="tab"]').forEach((x) => { const on = x === b; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
      onChange(b.dataset.tab);
    });
  }
  /** Rule tabs with a count badge each, plus the "Luật chơi" guide tab last. */
  function ruleTabsHtml(sel, tab, { guide = true } = {}) {
    return RULES.map((r) => {
      const on = tab !== 'rules' && r.id === sel;
      return `<button class="vtab" role="tab" data-tab="${r.id}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${esc(r.label)}<span class="vtab__n" aria-label="${countFor(r.id)} bàn">${countFor(r.id)}</span></button>`;
    }).join('') + (guide ? `<button class="vtab vtab--guide" role="tab" data-tab="rules" aria-selected="${tab === 'rules'}" tabindex="${tab === 'rules' ? 0 : -1}">${icon('scales')}Luật chơi</button>` : '');
  }
  /** Bottom sheet (phones). Title names the rule the ranks belong to. */
  function sheet(id, title, sub, body) {
    return `<div class="vsheet" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-h" hidden>
      <div class="vsheet__scrim" data-close></div>
      <div class="vsheet__panel"><span class="vsheet__grip" aria-hidden="true"></span>
        <header class="vsheet__head"><div><h2 id="${id}-h">${title}</h2><p>${sub}</p></div>
          <button type="button" class="vicon-btn" data-close aria-label="Đóng">${icon('x', 'icon--md')}</button></header>
        <div class="vsheet__body">${body}</div></div></div>`;
  }
  function wireSheet(el) {
    el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) el.hidden = true; });
  }
  /** Empty state for a rule tab: says which rule, offers to open a table in it. */
  const emptyHtml = (r) => `<div class="vempty">${icon('checkerboard', 'icon--lg')}<b>Chưa có bàn ${esc(RULE[r].label)} nào đang mở.</b>
    <span>Mở một bàn, người chơi online sẽ thấy ngay.</span><button type="button" class="vbtn vbtn--primary vbtn--lg">${icon('plus-circle')}Mở bàn ${esc(RULE[r].label)}</button></div>`;

  global.V4 = { qs, rule, RULES, RULE, USERS, byId, TABLES, STATS, STATE, TIME_FILTERS, esc, icon, avatar, standing, rankChip, eloChip, eloOf, timeText, tablesFor, canNear, countFor, openFor, rosterFor, seat, stateChip, enterBtn, pills, renderShell, showToast, renderRules, wireTabs, ruleTabsHtml, sheet, wireSheet, emptyHtml };
})(window);
