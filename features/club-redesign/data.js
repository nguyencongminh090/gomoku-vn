/* Shared fixture + chrome for the club mockups.
   Club fields mirror GET /api/clubs/:slug (getClubDetail), list fields GET /api/clubs (listClubs) and /api/clubs/mine,
   chat GET /api/clubs/:slug/messages. Anything the API does not send today goes through CL.need() → a small "API"
   marker (hide with ?need=off). URL: ?page=club|discover &as=visitor|member|staff &mode=dark|light */
(function () {
  const q = new URLSearchParams(location.search);
  const R = document.documentElement;
  R.dataset.mode = q.get('mode') || 'dark';
  R.dataset.page = q.get('page') || 'club';
  R.dataset.as = q.get('as') || 'member';
  R.dataset.need = q.get('need') || 'on';
  const AS = R.dataset.as, PAGE = R.dataset.page;
  const rng = (seed) => { let s = Math.imul(seed, 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (n, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#ph-regular-${n}"></use></svg>`;
  const need = (what) => `<span class="need" title="Cần API: ${esc(what)}">API</span>`;
  const ini = (n) => n.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).map((w) => w[0]).slice(-2).join('').toUpperCase();
  const hue = (n) => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const av = (n, s = 36, extra = '') => `<span class="av" style="--s:${s}px;--h:${hue(n)}" aria-hidden="true"${extra}>${esc(ini(n))}</span>`;
  const ROLE = { owner: 'Chủ nhiệm', officer: 'Phó chủ nhiệm', member: 'Thành viên' };

  const NAMES = ['Mai Anh', 'Trần Quốc Bảo', 'NguyenHoangPhucThinh2009', 'Lê Thu Hà', 'Phạm Đức Long', 'Vũ Minh Khang', 'Đỗ Ngọc Diệp', 'Hoàng Gia Huy',
    'Bùi Thanh Tâm', 'Đặng Hải Yến', 'Ngô Tuấn Kiệt', 'Dương Khánh Linh', 'Lý Quang Vinh', 'Trịnh Bảo Ngọc', 'Phan Nhật Minh', 'Hồ Thị Lan',
    'Cao Văn Sơn', 'Tạ Minh Châu', 'Lâm Đức Anh', 'Mạc Thùy Dung', 'Kiều Trọng Nghĩa', 'Âu Mỹ Hạnh', 'Quách Gia Bảo', 'Tôn Nữ Vy'];
  const r = rng(7);
  const roleOf = (i) => (i === 1 ? 'owner' : i === 0 || i === 4 ? 'officer' : 'member');
  const leaderboard = NAMES.map((n, i) => ({
    rank: i + 1, displayName: n, username: n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 16), role: roleOf(i),
    rating: Math.round(1912 - i * 23 - r() * 14), games: Math.round(40 + r() * 260), mine: n === 'Lê Thu Hà',
    // need API: presence, joined date, 7-day form
    online: i % 3 === 0 ? (i % 2 ? 'playing' : 'on') : null, room: i % 3 === 0 && i % 2 ? 'K' + (40 + i) + 'Q' : null,
    form: Array.from({ length: 5 }, () => (r() < .55 ? 'T' : r() < .8 ? 'B' : 'H')), d7: Math.round(r() * 60 - 22),
  }));

  const C = {
    slug: 'ky-dai-ho-guom', name: 'Kỳ Đài Hồ Gươm', tag: 'KĐHG', color: 'teal', joinPolicy: 'open', createdAt: '2025-03-14',
    description: 'Hội Caro của dân Hà Nội và bạn bè gần xa. Giao hữu tối thứ Sáu, giải nội bộ mỗi tháng, ai mới cũng có người kèm.',
    announcement: 'Cúp Hồ Gươm mùa đông vào vòng 3. Ai chưa đấu ván vòng 2 nhắn Bảo trước 22h tối nay nhé!',
    members: 42, rank: 3, clubsTotal: 57, avgRating: 1684, category: 'freestyle', myRole: AS === 'staff' ? 'officer' : AS === 'member' ? 'member' : null,
    invited: false,
    events: [
      { id: 'e1', title: 'Giao hữu tối thứ Sáu', startsAt: '2026-11-28T20:00', going: 14 },
      { id: 'e2', title: 'Buổi học khai cuộc Hoa Nguyệt', startsAt: '2026-12-03T20:30', going: 9 },
      { id: 'e3', title: 'Vòng loại giải tháng 12', startsAt: '2026-12-06T19:30', going: 22 },
    ],
    tournaments: [
      { id: 't1', name: 'Cúp Hồ Gươm mùa đông', status: 'running', round: 3, rounds: 5, players: 16, format: 'Swiss', leader: 'Trần Quốc Bảo' },
      { id: 't2', name: 'Blitz cuối tuần #12', status: 'registering', startsAt: '2026-12-04T20:00', players: 11, cap: 32, format: 'Loại trực tiếp' },
      { id: 't3', name: 'Cúp Hồ Gươm mùa thu', status: 'finished', players: 24, format: 'Swiss', winner: 'Mai Anh' },
    ],
    weekly: [
      { displayName: 'Phạm Đức Long', wins: 17, played: 22 }, { displayName: 'Mai Anh', wins: 14, played: 19 },
      { displayName: 'Lê Thu Hà', wins: 11, played: 18 }, { displayName: 'Vũ Minh Khang', wins: 9, played: 15 },
      { displayName: 'NguyenHoangPhucThinh2009', wins: 8, played: 16 },
    ],
    leaderboard,
    pending: [{ displayName: 'Hà Văn Đông' }, { displayName: 'Lục Thảo Nhi' }, { displayName: 'Viên Đình Phong' }],
    invites: [{ displayName: 'Đinh Bảo Châu' }, { displayName: 'Mẫn Gia Hưng' }],
    history: [
      { t: 'join', who: 'Tôn Nữ Vy', when: '2 giờ trước' }, { t: 'approve', who: 'Quách Gia Bảo', by: 'Mai Anh', when: 'hôm qua' },
      { t: 'role', who: 'Phạm Đức Long', by: 'Trần Quốc Bảo', what: 'Phó chủ nhiệm', when: '3 ngày trước' },
      { t: 'leave', who: 'Lý Thế Hiển', when: '5 ngày trước' },
    ],
    chat: [
      { who: 'Trần Quốc Bảo', at: '20:41', text: 'Tối nay ai rảnh giao hữu không? Mở phòng K52Q rồi nhé.' },
      { who: 'Mai Anh', at: '20:43', text: 'Vào đây! Luật 1, 10 phút nha.' },
      { who: 'NguyenHoangPhucThinh2009', at: '20:47', text: 'Em xem ké được không ạ 😄' },
      { who: 'Lê Thu Hà', at: '20:52', text: 'Ván vòng 2 của mình xong rồi, thắng nhờ thế cờ hoa mai. Ai muốn xem lại thì mình gửi link.' },
      { who: 'Phạm Đức Long', at: '21:05', text: 'Nhớ thứ Sáu này 8h tối giao hữu nhé cả nhà.' },
    ],
    // need API
    feed: [
      { k: 'win', who: 'Phạm Đức Long', vs: 'Hà Nội Blitz', text: 'thắng ván xếp hạng trước Quang (Hà Nội Blitz)', d: +14, when: '12 phút' },
      { k: 'tour', who: 'Lê Thu Hà', text: 'vào vòng 3 Cúp Hồ Gươm mùa đông', when: '40 phút' },
      { k: 'join', who: 'Tôn Nữ Vy', text: 'vừa gia nhập nhóm', when: '2 giờ' },
      { k: 'badge', who: 'Vũ Minh Khang', text: 'đạt huy hiệu 100 thắng xếp hạng', when: '5 giờ' },
      { k: 'puzzle', who: 'Mai Anh', text: 'giải 6 câu đố mức Khó', when: 'hôm qua' },
    ],
    avgTrend: [1612, 1620, 1631, 1628, 1640, 1652, 1649, 1661, 1670, 1668, 1677, 1684],
    rivals: [{ name: 'Hà Nội Blitz', tag: 'HNB', color: 'red', w: 12, l: 9 }, { name: 'Sài Gòn Ngũ Tử', tag: 'SGNT', color: 'orange', w: 7, l: 8 }],
    banner: 'banner-ink',
  };
  C.online = leaderboard.filter((m) => m.online);
  C.staff = leaderboard.filter((m) => m.role !== 'member').sort((a, b) => (a.role === 'owner' ? -1 : 1));
  C.me = leaderboard.find((m) => m.mine);

  const CLUBS = [
    { slug: 'ky-dai-ho-guom', name: 'Kỳ Đài Hồ Gươm', tag: 'KĐHG', color: 'teal', joinPolicy: 'open', members: 42, avgRating: 1684, rank: 3, banner: 'banner-ink', desc: C.description, active: 31, mine: AS !== 'visitor' },
    { slug: 'ha-noi-blitz', name: 'Hà Nội Blitz', tag: 'HNB', color: 'red', joinPolicy: 'invite', members: 64, avgRating: 1752, rank: 1, banner: 'banner-lantern', desc: 'Chỉ chơi nhanh: 3 phút, 5 phút. Tuyển người có rating từ 1650.', active: 48 },
    { slug: 'sai-gon-ngu-tu', name: 'Sài Gòn Ngũ Tử', tag: 'SGNT', color: 'orange', joinPolicy: 'open', members: 88, avgRating: 1611, rank: 6, banner: 'banner-sea', desc: 'Nhóm Caro lớn nhất phía Nam. Có lớp cho người mới mỗi tối thứ Ba.', active: 52 },
    { slug: 'truc-lam', name: 'Trúc Lâm Kỳ Xã', tag: 'TLKX', color: 'green', joinPolicy: 'open', members: 19, avgRating: 1720, rank: 2, banner: 'banner-bamboo', desc: 'Đánh chậm, nghĩ sâu. Mỗi tuần một buổi phân tích ván.', active: 11 },
    { slug: 'hue-co-do', name: 'Huế Cố Đô', tag: 'HCĐ', color: 'purple', joinPolicy: 'invite', members: 27, avgRating: 1590, rank: 9, banner: null, desc: 'Người Huế và người thương Huế. Giải nội bộ theo mùa.', active: 9 },
    { slug: 'sinh-vien-bk', name: 'Sinh viên Bách Khoa', tag: 'BK', color: 'blue', joinPolicy: 'open', members: 133, avgRating: 1544, rank: 12, banner: null, desc: 'CLB Caro của sinh viên ĐH Bách Khoa. Giờ nghỉ trưa là giờ cờ.', active: 71 },
    { slug: 'da-nang-song-han', name: 'Đà Nẵng Sông Hàn', tag: 'ĐNSH', color: 'pink', joinPolicy: 'open', members: 36, avgRating: 1633, rank: 5, banner: null, desc: 'Gặp nhau cuối tuần ở quán, online mỗi tối.', active: 20 },
    { slug: 'nguoi-moi', name: 'NhomNguoiMoiHocCaroCoBan', tag: 'NM', color: 'gray', joinPolicy: 'open', members: 210, avgRating: 1402, rank: 24, banner: null, desc: 'Mới học? Vào đây hỏi gì cũng được, không ai cười.', active: 95 },
  ];
  const MINE = AS === 'visitor' ? [] : [{ ...CLUBS[0], role: AS === 'staff' ? 'officer' : 'member' }, { ...CLUBS[3], role: 'member' }];
  const MY_RATING = 1702;

  /** Crest: tag on the club colour. shape: 'round' | 'shield' | 'pennant' | 'square'. */
  const crest = (c, s = 56, shape = 'round') => `<span class="crest crest--${shape}" style="--s:${s}px;--cc:var(--club-${c.color})" aria-hidden="true"><b>${esc(c.tag)}</b></span>`;

  /** Generated banner when a club has none: a sparse stone pattern seeded by the slug, on the club colour. */
  function genBanner(c) {
    const g = rng([...c.slug].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 3) >>> 0);
    let st = '';
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(g() * 40), y = Math.floor(g() * 10);
      st += `<circle cx="${x * 10 + 5}" cy="${y * 10 + 5}" r="3.8" class="${g() < .5 ? 'gb-b' : 'gb-w'}"/>`;
    }
    let ln = '';
    for (let i = 0; i < 40; i++) ln += `M${i * 10 + 5} 0V100`;
    for (let i = 0; i < 10; i++) ln += `M0 ${i * 10 + 5}H400`;
    return `<svg class="genb" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="--cc:var(--club-${c.color})"><rect width="400" height="100" class="gb-bg"/><path d="${ln}" class="gb-ln"/>${st}</svg>`;
  }
  const bannerImg = (c, cls = '') => (c.banner ? `<img class="${cls}" src="../img/${c.banner}.webp" alt="" width="2400" height="640">` : genBanner(c));

  /** Members as stones on a board, strongest at the centre, spiralling out (tengen first). */
  function spiral(n, size) {
    const out = [], c = (size - 1) / 2;
    const cells = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push([x, y, Math.hypot(x - c, y - c) + Math.atan2(y - c, x - c) / 40]);
    cells.sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < n; i++) out.push(cells[i]);
    return out;
  }

  const DOW = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const when = (iso) => { const d = new Date(iso); return { dow: DOW[d.getDay()], day: String(d.getDate()).padStart(2, '0'), mon: 'Th' + (d.getMonth() + 1), time: iso.slice(11, 16), date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }; };
  const daysTo = (iso) => Math.max(0, Math.round((new Date(iso) - new Date('2026-11-24T21:00')) / 864e5));

  /** Primary action for the viewer (exactly one filled button per screen). */
  function primary(cls = 'btn btn--primary') {
    if (AS === 'visitor') return C.joinPolicy === 'open' ? `<button class="${cls}">${ic('user-plus')}Tham gia nhóm</button>` : `<button class="${cls}">${ic('paper-plane-tilt')}Xin vào nhóm</button>`;
    if (AS === 'staff') return `<button class="${cls}">${ic('play')}Mở ván giao hữu</button>`;
    return `<button class="${cls}">${ic('play')}Mở ván giao hữu</button>`;
  }
  const secondary = () => (AS === 'visitor' ? `<button class="btn">${ic('copy')}Sao chép liên kết</button>`
    : `<button class="btn">${ic('copy')}Mời bạn</button>${AS === 'staff' ? `<button class="btn">${ic('gear-six')}Quản lý <span class="badge">3</span></button>` : ''}`);

  /** Top bar + phone tab bar + mockup toggles. */
  function top() {
    const sw = (k, v) => { const u = new URLSearchParams(location.search); u.set(k, v); return '?' + u; };
    const nav = [['play', 'Trang chủ'], ['door-open', 'Phòng'], ['trophy', 'Giải đấu'], ['users-three', 'Hội nhóm', 1], ['user-circle', 'Tôi']];
    const asL = { visitor: 'Khách', member: 'Thành viên', staff: 'Quản lý' };
    document.body.insertAdjacentHTML('afterbegin', `
      <header class="mk-top"><a class="logo"><i></i>Play3CR</a>
        <nav>${nav.map((n) => `<a${n[2] ? ' aria-current="page"' : ''}>${n[1]}</a>`).join('')}</nav>
        <div class="mk-sw" role="group" aria-label="Mockup">
          <a class="tg${PAGE === 'club' ? ' on' : ''}" href="${sw('page', 'club')}">Trang nhóm</a><a class="tg${PAGE === 'discover' ? ' on' : ''}" href="${sw('page', 'discover')}">Khám phá</a>
        </div>
        <div class="mk-sw" role="group" aria-label="Đang xem với vai">${Object.entries(asL).map(([k, v]) => `<a class="tg${AS === k ? ' on' : ''}" href="${sw('as', k)}">${v}</a>`).join('')}</div>
        <a class="tg mode" href="${sw('mode', R.dataset.mode === 'dark' ? 'light' : 'dark')}" aria-label="Đổi sáng/tối">${ic(R.dataset.mode === 'dark' ? 'sun' : 'moon')}</a>
      </header>
      <nav class="mk-tab" aria-label="Điều hướng">${nav.map((n) => `<a${n[2] ? ' aria-current="page"' : ''}>${ic(n[0])}<span>${n[1]}</span></a>`).join('')}</nav>`);
  }
  /** Count-up for [data-count]; the final value is already in the DOM (no-JS / reduced motion keep it). */
  function count() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-count]').forEach((n) => {
      const to = +n.textContent, from = Math.max(0, Math.round(to * .8)), t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); n.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  /** Tabs: [role=tab][data-t] toggles [data-p] inside the same [data-tabs] scope. */
  function tabs(root = document) {
    root.querySelectorAll('[role=tablist]').forEach((tl) => tl.addEventListener('click', (e) => {
      const b = e.target.closest('[role=tab]'); if (!b) return;
      tl.querySelectorAll('[role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      const scope = tl.closest('[data-tabs]') || document;
      if (b.dataset.t) scope.querySelectorAll('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; });
    }));
  }
  const sparkline = (pts, w = 220, h = 48) => {
    const lo = Math.min(...pts), hi = Math.max(...pts), x = (i) => (i / (pts.length - 1)) * w, y = (v) => h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8);
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Rating trung bình 12 tuần, từ ${pts[0]} lên ${pts.at(-1)}"><path d="${d}L${w} ${h}L0 ${h}Z" class="spark-a"/><path d="${d}" class="spark-l"/><circle cx="${w}" cy="${y(pts.at(-1))}" r="3.5" class="spark-d"/></svg>`;
  };
  const formChips = (f) => `<span class="form" aria-label="5 ván gần nhất">${f.map((x) => `<i class="f-${x}">${x}</i>`).join('')}</span>`;

  window.CL = { C, CLUBS, MINE, MY_RATING, AS, PAGE, ROLE, esc, ic, need, av, ini, hue, crest, genBanner, bannerImg, spiral, when, daysTo, primary, secondary, top, count, tabs, sparkline, formChips, rng };
})();
