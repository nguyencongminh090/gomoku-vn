/* Shared fixture + chrome for the profile mockups.
   Fields mirror GET /api/profile/:username (+ /games, /rating-history). Anything the API does not return today
   is tagged with PF.need() → a small "API" marker in the mockup (toggle: ?need=off). */
(function () {
  const q = new URLSearchParams(location.search);
  const R = document.documentElement;
  R.dataset.mode = q.get('mode') || 'dark';
  R.dataset.view = q.get('view') || 'other';
  R.dataset.need = q.get('need') || 'on';
  const self = R.dataset.view === 'self';
  const rng = (seed) => { let s = Math.imul(seed, 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  const P = {
    name: 'Mai Anh', user: 'maianh', h: 280, city: 'Đà Nẵng', country: 'Việt Nam', joined: '03/2024',
    bio: 'Mê khai cuộc Hoa Nguyệt, đánh chậm mà chắc. Tối nào cũng online sau 21h — thách cứ thách.',
    ratings: [
      { id: 'freestyle', k: 'Luật 1', r: 1811, rank: 3, d: 54, g: 212, peak: 1836 },
      { id: 'standard', k: 'Standard', r: 1742, rank: 12, d: -8, g: 80, peak: 1790 },
      { id: 'caro', k: 'Luật 2', r: 1655, rank: null, d: 0, g: 9, prov: 1, peak: 1655 },
    ],
    stats: { g: 301, w: 178, d: 14, l: 109 },
    streak: { cur: 4, best: 11 },
    puzzles: { solved: 86, level: 'Vừa', next: 'Khó', have: 6, need: 10 },
    badges: [
      { id: 'top_10', t: 'Top 10', i: 'trophy', date: '10/2026' },
      { id: 'wins_100', t: '100 thắng xếp hạng', i: 'medal', date: '02/2026' },
      { id: 'first_win', t: 'Thắng xếp hạng đầu', i: 'flag-checkered', date: '03/2024' },
    ],
    clubs: [
      { name: 'Hà Nội Gomoku', role: 'Phó chủ nhiệm', n: 128, h: 20 },
      { name: 'Cờ Thủ Đà Nẵng', role: 'Thành viên', n: 46, h: 200 },
    ],
  };
  P.ratings.forEach((r) => { r.peak = Math.max(...series(r)); });
  P.pct = Math.round(P.stats.w / P.stats.g * 100);
  // The viewer (only used by "other" view: head-to-head, comparisons).
  const ME = { name: 'Minh Khoa', user: 'minhkhoa', h: 120, ratings: { freestyle: 1498, standard: 1510, caro: 1402 }, pct: 52, streak: 2, puzzles: 31, g: 176 };

  // recent games — API today: id, opponent, result, endedAt. Extra (rule, moves, opp rating, delta, colour) = needs API.
  const G = [
    ['Sơn Tùng', 2104, 'win', '16/11', 'Luật 1', 47, 14, 'b', 0], ['Gomoku_VN', 2087, 'win', '16/11', 'Luật 1', 63, 13, 'w', 260],
    ['kaito', 1795, 'win', '15/11', 'Standard', 38, 8, 'b', 160], ['Tuấn Caro', 1684, 'win', '15/11', 'Luật 1', 29, 5, 'w', 20],
    ['TranQuocBaoKhanhCaroVip1', 1990, 'loss', '14/11', 'Luật 1', 71, -6, 'b', 200], ['Linh_99', 1702, 'win', '13/11', 'Luật 1', 44, 6, 'w', 330],
    ['Duy Khánh', 1610, 'draw', '12/11', 'Standard', 112, -1, 'b', 45], ['Nguyễn Hoàng Phương Thảo', 1655, 'win', '12/11', 'Luật 2', 35, 7, 'w', 300],
    ['Minh Khoa', 1498, 'loss', '10/11', 'Luật 1', 52, -15, 'b', 120], ['Bảo Ngọc', 1520, 'win', '09/11', 'Luật 1', 31, 4, 'w', 310],
    ['HoàngLong', 1540, 'loss', '08/11', 'Standard', 58, -12, 'w', 200], ['thanh.vu', 1588, 'win', '07/11', 'Luật 1', 41, 5, 'b', 120],
  ].map((a, i) => ({ id: i + 1, opp: a[0], oppR: a[1], res: a[2], date: a[3], rule: a[4], moves: a[5], delta: a[6], col: a[7], h: a[8], seed: 97 + i * 31 }));
  const RES = { win: ['T', 'Thắng'], loss: ['B', 'Thua'], draw: ['H', 'Hoà'] };
  // head-to-head, viewer vs profile owner (needs API)
  const H2H = { me: 5, them: 7, draws: 1, last: ['loss', 'win', 'loss', 'loss', 'win'] };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (n, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#ph-${/^(bold|fill)-/.test(n) ? n : 'regular-' + n}"></use></svg>`;
  const ini = (n) => n.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const av = (p, s = 36, cls = '') => `<span class="av ${cls}" style="--s:${s}px;--h:${p.h}" aria-hidden="true">${ini(p.name || p.opp)}</span>`;
  const dl = (d, unit = '') => d ? `<span class="dl ${d > 0 ? 'up' : 'dn'}"><i class="tri"></i>${Math.abs(d)}${unit}</span>` : '<span class="dl">—</span>';
  const need = (t = 'API') => `<span class="need" title="Cần thêm dữ liệu từ server (chưa có trong API hiện tại)">${t}</span>`;
  const res = (g) => `<b class="rs rs--${g.res || g}" title="${RES[g.res || g][1]}">${RES[g.res || g][0]}</b>`;
  const form = (n = 10) => `<span class="form" role="img" aria-label="${n} ván gần nhất">${G.slice(0, n).map(res).reverse().join('')}</span>`;
  const wdl = () => { const s = P.stats; return `<div class="wdl" role="img" aria-label="Thắng ${s.w}, hoà ${s.d}, thua ${s.l}"><i class="w" style="width:${s.w / s.g * 100}%"></i><i class="d" style="width:${s.d / s.g * 100}%"></i><i class="l" style="width:${s.l / s.g * 100}%"></i></div>`; };
  const badges = () => P.badges.filter((b) => b.id !== 'first_win' || true).map((b) => `<span class="bdg">${ic(b.i)}${b.t}</span>`).join('');
  const actions = (big) => `
    <button class="btn btn--pri if-other${big ? ' btn--big' : ''}">${ic('sword')}Thách đấu</button>
    <button class="btn if-other">${ic('chat-circle')}Nhắn tin</button>
    <button class="btn if-other">${ic('user-plus')}Kết bạn</button>
    <a class="btn if-self">${ic('pencil-simple')}Chỉnh sửa</a>
    <button class="btn if-self" title="Ý tưởng mới: chia sẻ hồ sơ">${ic('copy')}Sao chép liên kết</button>`;

  // 90-day rating series, deterministic, ending at the current rating
  function series(rt, n = 90) {
    const r = rng(rt.r * 7 + 3), v = [rt.r];
    // shape: slow climb, a peak ~2-3 weeks ago, a dip, then the last week's rise (matches delta7)
    for (let i = 1; i < n; i++) v.unshift(Math.round(v[0] - (r() < .35 ? 0 : (r() - .5) * 22 + (i < 7 ? 8 : i < 20 ? -6 : 3))));
    return v;
  }
  function line(vals, w, h, p = 8) {
    const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
    const pts = vals.map((v, i) => [p + i / (vals.length - 1) * (w - 2 * p), h - p - (v - lo) / sp * (h - 2 * p)]);
    return { pts, lo, hi, iHi: vals.indexOf(hi), d: 'M' + pts.map((a) => a[0].toFixed(1) + ',' + a[1].toFixed(1)).join('L') };
  }
  /** opts: w,h, area, axis (y labels + grid), peak (dot on the peak), end (dot on today) */
  function chart(vals, o = {}) {
    const w = o.w || 640, h = o.h || 200, padL = o.axis ? 40 : 0;
    const c = line(vals, w - padL, h, o.peak ? 24 : 10);
    const sh = (x) => (x + padL).toFixed(1);
    const d = 'M' + c.pts.map((a) => sh(a[0]) + ',' + a[1].toFixed(1)).join('L');
    let g = '';
    const pt = o.peak ? 24 : 10;
    if (o.axis) for (let i = 0; i < 3; i++) {
      const y = pt + i * (h - 2 * pt) / 2, v = Math.round(c.hi - i * (c.hi - c.lo) / 2);
      g += `<line class="ch-g" x1="${padL}" x2="${w}" y1="${y}" y2="${y}"/><text class="ch-t" x="0" y="${y + 4}">${v}</text>`;
    }
    const last = c.pts[c.pts.length - 1], pk = c.pts[c.iHi];
    return `<svg class="ch" viewBox="0 0 ${w} ${h}" role="img" aria-label="Biểu đồ rating ${vals.length} ngày, cao nhất ${c.hi}">${g}
      ${o.area === false ? '' : `<path class="ch-a" d="${d}L${w - 10},${h}L${padL + 10},${h}Z"/>`}<path class="ch-l" d="${d}"/>
      ${o.peak ? `<circle class="ch-p" cx="${sh(pk[0])}" cy="${pk[1].toFixed(1)}" r="5"/><text class="ch-t" x="${sh(pk[0])}" y="${(pk[1] - 11).toFixed(1)}" text-anchor="middle">Đỉnh ${c.hi}</text>` : ''}
      ${o.end === false ? '' : `<circle class="ch-p" cx="${sh(last[0])}" cy="${last[1].toFixed(1)}" r="5"/>`}</svg>`;
  }

  // final position of a game as a 15×15 SVG (illustrative: random cluster + the winning five)
  function board(g) {
    const r = rng(g.seed), occ = {}, k = (x, y) => x + ',' + y;
    const win = g.res === 'draw' ? null : ((g.res === 'win') === (g.col === 'b') ? 'b' : 'w');
    let five = [];
    if (win) {
      const [dx, dy] = [[1, 0], [0, 1], [1, 1], [1, -1]][Math.floor(r() * 4)];
      const x0 = 4 + Math.floor(r() * 3), y0 = dy < 0 ? 9 + Math.floor(r() * 2) : 4 + Math.floor(r() * 3);
      for (let i = 0; i < 5; i++) { five.push([x0 + dx * i, y0 + dy * i]); occ[k(x0 + dx * i, y0 + dy * i)] = win; }
    }
    const left = { b: Math.ceil(g.moves / 2) - (win === 'b' ? 5 : 0), w: Math.floor(g.moves / 2) - (win === 'w' ? 5 : 0) };
    let guard = 0;
    for (const c of ['b', 'w']) while (left[c] > 0 && guard++ < 4000) {
      const x = Math.round(7 + (r() + r() + r() - 1.5) * 6.5), y = Math.round(7 + (r() + r() + r() - 1.5) * 6.5);
      if (x < 0 || y < 0 || x > 14 || y > 14 || occ[k(x, y)]) continue;
      occ[k(x, y)] = c; left[c]--;
    }
    let ln = '';
    for (let i = 0; i < 15; i++) ln += `M5,${5 + i * 10}H145M${5 + i * 10},5V145`;
    const st = Object.entries(occ).map(([p, c]) => { const [x, y] = p.split(','); return `<circle class="s${c}" cx="${5 + x * 10}" cy="${5 + y * 10}" r="4.3"/>`; }).join('');
    const f = five.length ? `<line class="bd-five" x1="${5 + five[0][0] * 10}" y1="${5 + five[0][1] * 10}" x2="${5 + five[4][0] * 10}" y2="${5 + five[4][1] * 10}"/>` : '';
    return `<svg class="bd" viewBox="0 0 150 150" role="img" aria-label="Thế cờ cuối ván với ${esc(g.opp)}"><rect class="bd-bg" width="150" height="150" rx="6"/><path class="bd-ln" d="${ln}"/>${st}${f}</svg>`;
  }

  // 20 weeks of activity (games per day, 0–4 buckets) — needs API
  function heat(weeks = 20) {
    const r = rng(41); let h = '';
    for (let i = 0; i < weeks * 7; i++) { const x = r(); h += `<i data-v="${x < .34 ? 0 : x < .6 ? 1 : x < .8 ? 2 : x < .93 ? 3 : 4}"></i>`; }
    return `<div class="heat" role="img" aria-label="Số ván mỗi ngày, ${weeks} tuần gần nhất">${h}</div>`;
  }

  /** Top bar + phone tab bar + toggles. */
  function top() {
    const sw = (k, v) => { const u = new URLSearchParams(location.search); u.set(k, v); return '?' + u; };
    const nav = [['bold-house', 'Trang chủ'], ['door-open', 'Phòng'], ['ranking', 'Xếp hạng'], ['users-three', 'Bạn bè'], ['user-circle', self ? 'Tôi' : 'Hồ sơ', 1]];
    document.body.insertAdjacentHTML('afterbegin', `
      <header class="mk-top"><a class="logo"><i></i>Play3CR</a>
        <nav>${nav.map((n) => `<a${n[2] === 1 ? ' aria-current="page"' : ''}>${n[1]}</a>`).join('')}</nav>
        <a class="tg" href="${sw('view', self ? 'other' : 'self')}" title="Mockup: đổi góc nhìn">${self ? 'Đang xem: hồ sơ của tôi' : 'Đang xem: người khác'}</a>
        <a class="tg" href="${sw('mode', R.dataset.mode === 'dark' ? 'light' : 'dark')}" aria-label="Đổi sáng/tối">◐</a>
      </header>
      <nav class="mk-tab" aria-label="Điều hướng">${nav.map((n) => `<a${n[2] === 1 ? ' aria-current="page"' : ''}>${ic(n[0], 'ico--lg')}<span>${n[1]}</span></a>`).join('')}</nav>`);
  }
  /** Count-up for [data-count] numbers; final value is already in the DOM, so no-JS / reduced motion show it as is. */
  function count() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-count]').forEach((n) => {
      const to = +n.textContent, from = Math.max(0, to - Math.min(60, Math.round(to * .2))), t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); n.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  /** Simple tabs: [role=tab][data-t] toggles [data-p]. */
  function tabs(root = document) {
    root.querySelectorAll('[role=tablist]').forEach((tl) => tl.addEventListener('click', (e) => {
      const b = e.target.closest('[role=tab]'); if (!b) return;
      tl.querySelectorAll('[role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      if (b.dataset.t) document.querySelectorAll('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; });
    }));
  }
  const where = `${P.city}, ${P.country}`;
  window.PF = { P, ME, G, H2H, RES, self, esc, ic, av, dl, need, res, form, wdl, badges, actions, series, line, chart, board, heat, top, count, tabs, where };
})();
