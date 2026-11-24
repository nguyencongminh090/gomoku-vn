'use strict';
/**
 * shared.js: fixture + chrome for the Rooms v3 mockups (D Trục luật, E Xem trước, F Kỳ thủ trước).
 * The data has the shape the server would send after the backend items in planning.md (roster rating/rank,
 * activity, exact playing count, lobby mini-board moves). URL params for screenshots:
 *   ?mode=light   ?n=0|1 (sparse lobby)   ?rule=freestyle|caro|standard|renju   ?sel=<code>   ?tab=rules|people
 */
(function (global) {
  const SPRITE = '../../client/assets/icons/phosphor-sprite.svg';
  const qs = new URLSearchParams(location.search);

  // Rating categories = rankings.js CATEGORIES; labels = rule.* (game) keys. The rankings page says "Standard"
  // where the room says "Tiêu chuẩn" (planning.md open question 5).
  const RULES = [
    { id: 'freestyle', label: 'Luật 1', lead: 'Từ 5 quân liên tiếp là thắng.' },
    { id: 'caro', label: 'Luật 2', lead: 'Từ 5 quân liên tiếp, với tối đa một đầu bị quân đối thủ chặn.' },
    { id: 'standard', label: 'Tiêu chuẩn', lead: 'Đúng 5 quân liên tiếp mới thắng.' },
    { id: 'renju', label: 'Renju', lead: 'Đen cần đúng 5. Trắng thắng từ 5 quân liên tiếp.' },
  ];
  const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]));

  // name, ratings per category [rating, games] (0 games = unrated there), flags
  const U = (id, name, tone, ratings, extra = {}) => ({ id, name, tone, ratings, ...extra });
  const USERS = [
    U('u1', 'Vũ Thảo Nguyên', 0, { freestyle: [2104, 412], caro: [1980, 88], renju: [1840, 20] }),
    U('u2', 'Phạm Khánh Linh', 1, { freestyle: [2087, 350], caro: [1870, 40] }),
    U('u3', 'Đặng Quốc Bảo', 2, { renju: [1962, 260], freestyle: [1890, 70], standard: [1800, 15] }),
    U('u4', 'Lê Hoàng Phúc', 3, { renju: [1931, 198], caro: [1702, 12] }),
    U('u5', 'Trần Minh Khôi', 4, { freestyle: [1842, 186], caro: [1795, 140] }, { me: true }),
    U('u6', 'Lý Hải Đăng', 0, { caro: [1888, 301], freestyle: [1760, 90] }),
    U('u7', 'Võ Bảo Châu', 1, { renju: [1650, 6] }, { provisional: true }),
    U('u8', 'Bùi Đức Anh', 2, { caro: [1811, 222], freestyle: [1700, 30] }),
    U('u9', 'Hoàng Gia Huy', 3, { caro: [1734, 160] }, { friend: true }),
    U('u10', 'Nguyễn Thị Hồng Ánh Phương', 4, { standard: [1795, 120], freestyle: [1702, 64] }),
    U('u11', 'Phan Đức Minh', 0, { freestyle: [1690, 95] }, { friend: true }),
    U('u12', 'Đỗ Nhật Nam', 1, { freestyle: [1612, 140], caro: [1590, 22] }),
    U('u13', 'Ngô Thanh Trúc', 2, { freestyle: [1588, 77] }),
    U('u14', 'Tạ Quang Vinh', 3, { standard: [1720, 54] }),
    U('u15', 'Mai Anh Thư', 4, { caro: [1540, 48] }),
    U('u16', 'caro_master99', 0, { caro: [1999, 520], freestyle: [1950, 300] }),
    U('u17', 'Hà Vy', 1, { freestyle: [1203, 9] }, { provisional: true }),
    U('u18', 'Trịnh Công Sơn', 2, { renju: [1720, 80], standard: [1680, 60] }),
    U('u19', 'Lâm Tuấn Kiệt', 3, { freestyle: [1530, 33] }),
    U('u20', 'Kiều Oanh', 4, {}, { fresh: true }),
    U('u21', 'Dương Thùy Linh', 0, { caro: [1660, 70] }),
    U('u22', 'Châu Gia Bảo', 1, { freestyle: [1475, 18] }),
    U('u23', 'Quách Ngọc Hân', 2, { standard: [1610, 25] }),
    U('u24', 'Tôn Thất Khang', 3, { renju: [1580, 40] }),
    U('g1', 'Khách 482', 4, {}, { guest: true }),
    U('g2', 'Khách 117', 0, {}, { guest: true }),
    U('g3', 'Khách 903', 1, {}, { guest: true }),
  ];
  const byId = Object.fromEntries(USERS.map((u) => [u.id, u]));

  // Global leaderboard ranks: the lobby only holds ~30 of the ranked players, so rank ≈ 1 + better×3 (+ jitter).
  for (const u of USERS) {
    u.rank = {};
    for (const [cat, [r]] of Object.entries(u.ratings)) {
      const better = USERS.filter((v) => v.ratings[cat] && v.ratings[cat][0] > r).length;
      u.rank[cat] = 1 + better * 3 + (u.id.length + r) % 3;
    }
    // "Main rule" = the category with the most rated games (planning.md open question 1).
    const cats = Object.entries(u.ratings).sort((a, b) => b[1][1] - a[1][1]);
    u.main = cats.length ? cats[0][0] : null;
  }

  // Tables: the RoomManager.lobbyEntry fields + moves (mini board), elapsed.
  const T = (code, name, rule, p1, p2, state, o = {}) => ({ code, name, rule, p1, p2, state, size: 15, time: '5+5', ranked: true, viewers: 0, moves: 0, ...o });
  const TABLES_ALL = [
    T('K7B', 'Ai vào chơi 3 phút', 'freestyle', 'u11', null, 'waiting', { time: "3'", waitMin: 2 }),
    T('P9D', 'Tập Luật 2 ô khoá', 'caro', 'u9', null, 'waiting', { variant: 'Ô khoá', time: '60s/nước', ranked: false, waitMin: 5, viewers: 1 }),
    T('R5E', 'Ván tập cho người mới', 'freestyle', 'u17', null, 'waiting', { time: '90s/nước', ranked: false, waitMin: 1 }),
    T('S2W', 'Swap2 nghiêm túc', 'standard', 'u14', null, 'waiting', { variant: 'Swap2', time: '10+5', waitMin: 7 }),
    T('A3F', 'Trận đỉnh cao', 'freestyle', 'u1', 'u2', 'live', { viewers: 23, moves: 61, elapsed: '18:02' }),
    T('C8N', 'Kèo phục thù', 'caro', 'u16', 'u6', 'live', { viewers: 11, moves: 44, elapsed: '12:40' }),
    T('M2Q', 'Renju tối nay', 'renju', 'u3', 'u4', 'live', { variant: 'Taraguchi-10', time: "10'", viewers: 7, moves: 29, elapsed: '09:15' }),
    T('B4L', 'Caro VN chiều nay', 'caro', 'u8', 'u15', 'live', { size: 19, time: '60s/nước', viewers: 3, moves: 22, elapsed: '06:15' }),
    T('T4H', 'Giao hữu cuối tuần', 'standard', 'u10', 'u23', 'ready', { ranked: false }),
    T('D7K', 'Thử hố đen', 'freestyle', 'u12', 'u13', 'live', { variant: 'Hố đen', size: 19, time: '3+2', ranked: false, viewers: 2, moves: 15, elapsed: '03:52' }),
    T('H1Y', 'Renju luyện khai cuộc', 'renju', 'u18', 'u24', 'live', { variant: 'Yamaguchi', viewers: 4, moves: 9, elapsed: '01:28' }),
    T('N6V', 'Ván nhanh 1 phút', 'freestyle', 'g1', 'u19', 'live', { time: "1'", ranked: false, viewers: 1, moves: 33, elapsed: '01:40' }),
  ];
  const nParam = qs.get('n');
  const TABLES = nParam === '0' ? [] : nParam === '1' ? [TABLES_ALL[0]] : TABLES_ALL;

  // Who is watching what (sparse/empty lobby keeps the same people online, just idle).
  const WATCH = { u5: 'A3F', u21: 'A3F', u22: 'C8N', g2: 'A3F', u7: 'M2Q' };

  // Activity derived from the tables (server would send it on the roster entry: planning.md backend item B).
  for (const u of USERS) { u.activity = 'free'; u.table = null; }
  for (const t of TABLES) {
    for (const pid of [t.p1, t.p2].filter(Boolean)) {
      byId[pid].activity = t.state === 'waiting' ? 'waiting' : 'playing';
      byId[pid].table = t.code;
    }
  }
  for (const [uid, code] of Object.entries(WATCH)) {
    if (byId[uid].activity === 'free' && TABLES.some((t) => t.code === code)) { byId[uid].activity = 'watching'; byId[uid].table = code; }
  }
  const ACT = {
    playing: { label: 'Đang đấu', icon: 'sword', cls: 'is-playing' },
    waiting: { label: 'Chờ đối thủ', icon: 'hourglass', cls: 'is-waiting' },
    watching: { label: 'Đang xem', icon: 'eye', cls: 'is-watching' },
    free: { label: 'Rảnh', icon: 'user-circle', cls: 'is-free' },
  };

  const STATS = {
    online: USERS.length,
    playing: USERS.filter((u) => u.activity === 'playing').length,
    waiting: TABLES.filter((t) => t.state === 'waiting').length,
    live: TABLES.filter((t) => t.state === 'live').length,
    watching: TABLES.reduce((s, t) => s + t.viewers, 0),
  };

  // ── helpers ───────────────────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="${SPRITE}#ph-regular-${n}"></use></svg>`;
  const initials = (n) => n.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
  const avatar = (u, size = 'sm') => `<span class="mav mav--${size} mav--t${u.tone}" aria-hidden="true">${esc(u.guest ? 'K' : initials(u.name))}</span>`;

  /** Rating + rank of `u` in `cat` (cat null = main rule). → {cat, rating, rank, prov, games} or null. */
  function standing(u, cat) {
    const c = cat || u.main;
    if (!c || !u.ratings[c]) return null;
    const [rating, games] = u.ratings[c];
    return { cat: c, rating, games, rank: u.rank[c], prov: !!u.provisional };
  }
  /** "#12" / "Mới" / "Khách" as a fixed-width badge. */
  function rankBadge(u, cat) {
    if (u.guest) return '<span class="mrank mrank--none">Khách</span>';
    const s = standing(u, cat);
    if (!s) return '<span class="mrank mrank--none">Mới</span>';
    if (s.prov) return `<span class="mrank mrank--prov" title="Elo tạm tính (độ lệch RD còn cao)">#${s.rank}?</span>`;
    const top = s.rank <= 3 ? ` mrank--top${s.rank}` : s.rank <= 10 ? ' mrank--top' : '';
    return `<span class="mrank${top}">#${s.rank}</span>`;
  }
  function eloText(u, cat) {
    const s = standing(u, cat);
    if (!s) return '<span class="melo melo--none">—</span>';
    return `<span class="melo">${s.rating}${s.prov ? '?' : ''}</span>`;
  }
  const tableOf = (code) => TABLES.find((t) => t.code === code);

  /** Deterministic game position as an SVG mini board (lobbyEntry already sends `moves`, #364). */
  function miniBoard(t, cls = '') {
    const n = t.size;
    const g = 100 / n;
    let seed = [...t.code].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
    const taken = new Set();
    const stones = [];
    // stones cluster around the centre like a real game (≈ normal, sd 2.4), each next to an earlier stone
    const c = Math.floor(n / 2);
    const norm = () => (rnd() + rnd() + rnd() - 1.5) * 2.8;
    for (let i = 0; i < t.moves; i++) {
      let x = c; let y = c;
      for (let k = 0; k < 60; k++) {
        const base = stones.length && rnd() < 0.7 ? stones[Math.floor(rnd() * stones.length)] : [c, c];
        x = Math.min(n - 2, Math.max(1, Math.round(i ? base[0] + (rnd() < 0.5 ? norm() / 2 : Math.round(rnd() * 2 - 1)) : c)));
        y = Math.min(n - 2, Math.max(1, Math.round(i ? base[1] + (rnd() < 0.5 ? norm() / 2 : Math.round(rnd() * 2 - 1)) : c)));
        if (!taken.has(x + ',' + y) && Math.abs(x - c) < 6 && Math.abs(y - c) < 6) break;
      }
      taken.add(x + ',' + y);
      stones.push([x, y, i % 2]);
    }
    let lines = '';
    for (let i = 0; i < n; i++) {
      const p = (i + 0.5) * g;
      lines += `<line x1="${g / 2}" y1="${p}" x2="${100 - g / 2}" y2="${p}"/><line x1="${p}" y1="${g / 2}" x2="${p}" y2="${100 - g / 2}"/>`;
    }
    const st = stones.map(([sx, sy, w], i) => `<circle cx="${(sx + 0.5) * g}" cy="${(sy + 0.5) * g}" r="${g * 0.44}" class="${w ? 'w' : 'b'}${i === stones.length - 1 ? ' last' : ''}"/>`).join('');
    return `<svg class="mboard ${cls}" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" class="bg"/><g class="ln">${lines}</g>${st}</svg>`;
  }

  /** Meta segments of a table, each its own span (ticket-rows: no "a · b · c"). */
  function metaPills(t, { rule = true } = {}) {
    const seg = [];
    if (rule) seg.push(`<span class="mpill mpill--rule">${esc(RULE[t.rule].label)}</span>`);
    seg.push(`<span class="mpill">${t.size}×${t.size}</span>`);
    seg.push(`<span class="mpill">${icon('timer')}${esc(t.time)}</span>`);
    if (t.variant) seg.push(`<span class="mpill">${esc(t.variant)}</span>`);
    seg.push(t.ranked ? `<span class="mpill mpill--ranked">${icon('crown-simple')}Xếp hạng</span>` : '<span class="mpill">Giao hữu</span>');
    return seg.join('<span class="sr-only">, </span>');
  }
  const STATE = {
    waiting: { label: 'Chờ đối thủ', cls: 'is-waiting' },
    ready: { label: 'Sắp bắt đầu', cls: 'is-ready' },
    live: { label: 'Đang đấu', cls: 'is-live' },
  };

  // ── chrome: real platform-shell header + phone tab bar + review dock ─────
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
          <div class="pbell"><button type="button" class="pnav__mode pbell__btn" aria-label="Thông báo">${icon('bell', 'icon--md')}<span class="pbell__badge">2</span></button></div>
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
    const keep = (extra) => { const p = new URLSearchParams(location.search); Object.entries(extra).forEach(([k, v]) => (v == null ? p.delete(k) : p.set(k, v))); const s = p.toString(); return s ? '?' + s : location.pathname.split('/').pop(); };
    dock.innerHTML = `<a href="index.html">${icon('arrow-left')}Thư viện</a>`
      + [['d', 'd-truc-luat.html', 'D Trục luật'], ['e', 'e-xem-truoc.html', 'E Xem trước'], ['f', 'f-ky-thu.html', 'F Kỳ thủ trước']]
        .map(([id, f, l]) => `<a href="${f}${location.search}" class="${id === active ? 'is-on' : ''}">${l}</a>`).join('')
      + `<a href="${keep({ n: null })}">12 bàn</a><a href="${keep({ n: '1' })}">1 bàn</a><a href="${keep({ n: '0' })}">0 bàn</a>`;
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
  }
  let tt = null;
  function toast(msg) {
    const el = document.getElementById('mk-toast');
    el.textContent = msg; el.classList.add('is-show');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('is-show'), 2000);
  }
  function renderRules(container, active) {
    if (global.RoomRulesGuide && typeof global.t === 'function') global.RoomRulesGuide.render(container, { t: global.t, active });
  }
  /** Compact join-by-code (kept from today's #join-code-form; dropping it is open question 4). */
  function codeForm(id) {
    return `<form class="mcode" id="${id}" onsubmit="event.preventDefault()"><label class="sr-only" for="${id}-in">Vào bằng mã</label>`
      + `<span class="mcode__hash" aria-hidden="true">#</span><input id="${id}-in" maxlength="3" placeholder="Mã bàn" autocomplete="off" spellcheck="false">`
      + `<button type="submit" class="mbtn mbtn--ghost">${icon('door-open')}Vào</button></form>`;
  }
  /** Tabs with roving aria-selected; `onChange(id)`. */
  function wireTabs(root, onChange) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[role="tab"]');
      if (!b || !root.contains(b)) return;
      root.querySelectorAll('[role="tab"]').forEach((x) => { const on = x === b; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
      onChange(b.dataset.tab);
    });
  }

  global.V3 = { qs, RULES, RULE, USERS, byId, TABLES, STATS, ACT, STATE, esc, icon, avatar, standing, rankBadge, eloText, tableOf, miniBoard, metaPills, renderShell, toast, renderRules, codeForm, wireTabs };
})(window);
