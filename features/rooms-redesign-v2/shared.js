'use strict';

/**
 * shared.js — Realistic fixture data + interactive chrome for Rooms Redesign v2 mockups.
 * Uses Play3CR's real phosphor-sprite.svg, tokens.css, i18n.js, and RoomRulesGuide.
 */
(function (global) {
  const SPRITE = '../../client/assets/icons/phosphor-sprite.svg';

  const STATS = {
    onlineTotal: 24,
    playingPlayers: 10,
    openTables: 3,
    liveTables: 5,
    readyTables: 1,
  };

  // 9 realistic Vietnamese tables matching server RoomManager.lobbyEntry shape
  const TABLES = [
    {
      roomId: 'A4K',
      roomName: 'Giao lưu Luật 1',
      state: 'waiting',
      kind: 'open',
      playerCount: 1,
      watchers: 0,
      players: [
        { userId: 'u5', displayName: 'Nguyễn Thị Hồng Ánh', rating: 1842, tone: 0 },
        null,
      ],
      ruleLabel: 'Luật 1',
      boardSize: '19×19',
      variant: 'Ô khoá',
      clock: '60s/nước',
      ranked: true,
      elapsed: null,
    },
    {
      roomId: 'B7M',
      roomName: 'Tập khai cuộc Swap2',
      state: 'waiting',
      kind: 'open',
      playerCount: 1,
      watchers: 0,
      players: [
        { userId: 'u9', displayName: 'Trần Minh Quân', rating: 1695, tone: 1 },
        null,
      ],
      ruleLabel: 'Tiêu chuẩn',
      boardSize: '15×15',
      variant: 'Swap2',
      clock: '5+3',
      ranked: true,
      elapsed: null,
    },
    {
      roomId: 'C2P',
      roomName: 'Giao hữu nhẹ nhàng',
      state: 'waiting',
      kind: 'open',
      playerCount: 1,
      watchers: 1,
      players: [
        { userId: 'g1', displayName: 'Khách 482', rating: null, isGuest: true, tone: 4 },
        null,
      ],
      ruleLabel: 'Luật 2',
      boardSize: '19×19',
      variant: null,
      clock: '60s/nước',
      ranked: false,
      elapsed: null,
    },
    {
      roomId: 'D9R',
      roomName: 'Bàn đấu Renju tối nay',
      state: 'ready',
      kind: 'ready',
      playerCount: 2,
      watchers: 3,
      players: [
        { userId: 'u3', displayName: 'Đặng Quốc Bảo', rating: 1910, tone: 2 },
        { userId: 'u4', displayName: 'Lê Hoàng Phúc', rating: 1876, tone: 3 },
      ],
      ruleLabel: 'Renju',
      boardSize: '15×15',
      variant: 'Taraguchi-10',
      clock: "10'",
      ranked: true,
      elapsed: null,
    },
    {
      roomId: 'E5T',
      roomName: 'Trận đỉnh cao',
      state: 'playing',
      kind: 'live',
      playerCount: 2,
      watchers: 7,
      players: [
        { userId: 'u1', displayName: 'Vũ Thảo Nguyên', rating: 1945, tone: 0 },
        { userId: 'u2', displayName: 'Phạm Khánh Linh', rating: 1928, tone: 1 },
      ],
      ruleLabel: 'Luật 1',
      boardSize: '19×19',
      variant: 'Ô khoá',
      clock: '5+3',
      ranked: true,
      elapsed: '12:40',
    },
    {
      roomId: 'F1W',
      roomName: 'Caro VN chiều nay',
      state: 'playing',
      kind: 'live',
      playerCount: 2,
      watchers: 4,
      players: [
        { userId: 'u7', displayName: 'Bùi Đức Anh', rating: 1760, tone: 2 },
        { userId: 'u8', displayName: 'Hoàng Gia Huy', rating: 1734, tone: 3 },
      ],
      ruleLabel: 'Luật 2',
      boardSize: '19×19',
      variant: null,
      clock: '60s/nước',
      ranked: true,
      elapsed: '06:15',
    },
    {
      roomId: 'G8N',
      roomName: 'Thử hố đen',
      state: 'playing',
      kind: 'live',
      playerCount: 2,
      watchers: 2,
      players: [
        { userId: 'u10', displayName: 'Đỗ Nhật Nam', rating: 1612, tone: 1 },
        { userId: 'u11', displayName: 'Ngô Thanh Trúc', rating: 1588, tone: 0 },
      ],
      ruleLabel: 'Luật 1',
      boardSize: '19×19',
      variant: 'Hố đen',
      clock: '3+2',
      ranked: false,
      elapsed: '03:52',
    },
    {
      roomId: 'H3V',
      roomName: 'Renju giao lưu CLB',
      state: 'playing',
      kind: 'live',
      playerCount: 2,
      watchers: 5,
      players: [
        { userId: 'u6', displayName: 'Lý Hải Đăng', rating: 1805, tone: 3 },
        { userId: 'u12', displayName: 'Võ Bảo Châu', rating: 1790, provisional: true, tone: 2 },
      ],
      ruleLabel: 'Renju',
      boardSize: '15×15',
      variant: 'Yamaguchi',
      clock: "10'",
      ranked: true,
      elapsed: '18:04',
    },
    {
      roomId: 'K6Q',
      roomName: 'Nhanh 30 giây',
      state: 'playing',
      kind: 'live',
      playerCount: 2,
      watchers: 0,
      players: [
        { userId: 'u13', displayName: 'Tạ Quang Vinh', rating: 1540, tone: 0 },
        { userId: 'u14', displayName: 'Đinh Mai Phương', rating: 1518, tone: 1 },
      ],
      ruleLabel: 'Luật 1',
      boardSize: '19×19',
      variant: null,
      clock: '30s/nước',
      ranked: true,
      elapsed: '01:28',
    },
  ];

  // 14 visible online players (+10 more = 24 total) with main-rule rank & Elo
  const ONLINE_USERS = [
    { userId: 'u1', displayName: 'Vũ Thảo Nguyên', status: 'playing', mainRule: 'Luật 1', rank: 1, rating: 1945, tone: 0 },
    { userId: 'u2', displayName: 'Phạm Khánh Linh', status: 'playing', mainRule: 'Luật 1', rank: 2, rating: 1928, tone: 1 },
    { userId: 'u3', displayName: 'Đặng Quốc Bảo', status: 'playing', mainRule: 'Renju', rank: 3, rating: 1910, tone: 2 },
    { userId: 'u4', displayName: 'Lê Hoàng Phúc', status: 'playing', mainRule: 'Renju', rank: 5, rating: 1876, tone: 3 },
    { userId: 'u5', displayName: 'Nguyễn Thị Hồng Ánh', status: 'waiting', mainRule: 'Luật 1', rank: 7, rating: 1842, tone: 0, isMe: true },
    { userId: 'u6', displayName: 'Lý Hải Đăng', status: 'playing', mainRule: 'Renju', rank: 11, rating: 1805, tone: 3 },
    { userId: 'u12', displayName: 'Võ Bảo Châu', status: 'playing', mainRule: 'Renju', rank: null, rating: 1790, provisional: true, tone: 2 },
    { userId: 'u7', displayName: 'Bùi Đức Anh', status: 'playing', mainRule: 'Luật 2', rank: 14, rating: 1760, tone: 2 },
    { userId: 'u8', displayName: 'Hoàng Gia Huy', status: 'playing', mainRule: 'Luật 2', rank: 19, rating: 1734, tone: 3 },
    { userId: 'u9', displayName: 'Trần Minh Quân', status: 'waiting', mainRule: 'Standard', rank: 24, rating: 1695, tone: 1 },
    { userId: 'u15', displayName: 'Phan Đức Minh', status: 'free', mainRule: 'Luật 1', rank: 31, rating: 1662, tone: 0 },
    { userId: 'u10', displayName: 'Đỗ Nhật Nam', status: 'playing', mainRule: 'Luật 1', rank: 42, rating: 1612, tone: 1 },
    { userId: 'u16', displayName: 'Trịnh Ngọc Hân', status: 'watching', mainRule: 'Luật 2', rank: 58, rating: 1594, tone: 2 },
    { userId: 'u17', displayName: 'Nguyễn Hữu Tín', status: 'free', mainRule: 'Luật 1', rank: 74, rating: 1555, tone: 3 },
    { userId: 'g1', displayName: 'Khách 482', status: 'waiting', mainRule: null, rank: null, rating: null, isGuest: true, tone: 4 },
  ];

  const STATUS_META = {
    playing: { label: 'Đang đấu', icon: 'ph-regular-sword', cls: 'mpres--playing' },
    waiting: { label: 'Chờ đối thủ', icon: 'ph-regular-hourglass', cls: 'mpres--waiting' },
    watching: { label: 'Đang xem', icon: 'ph-regular-eye', cls: 'mpres--watching' },
    free: { label: 'Rảnh', icon: 'ph-fill-circle', cls: 'mpres--free' },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function iconSvg(name, extraCls = '') {
    return `<svg class="icon${extraCls ? ' ' + extraCls : ''}" aria-hidden="true"><use href="${SPRITE}#${name}"></use></svg>`;
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return String(name || '?').trim().slice(0, 2).toUpperCase();
  }

  function avatarHtml(name, tone = 0, sizeCls = 'pav--sm') {
    return `<span class="pav ${sizeCls} pav--tone-${tone % 5}" aria-hidden="true">${esc(initials(name))}</span>`;
  }

  function renderShell(activeMockup) {
    const host = document.getElementById('pl-shell');
    if (!host) return;
    host.innerHTML = `
      <header class="pnav">
        <a class="pnav__brand" href="index.html"><span class="pnav__word">Play<b>3CR</b></span></a>
        <nav class="pnav__links" aria-label="Chính">
          <a href="#home">Trang chủ</a>
          <a href="#rooms" class="is-active" aria-current="page">Phòng</a>
          <a href="#tournaments">Giải đấu</a>
          <a href="#rankings">Xếp hạng</a>
          <a href="#clubs">Hội nhóm</a>
          <a href="#learn">Học</a>
        </nav>
        <div class="pnav__right">
          <button type="button" class="pnav__mode" id="mk-nav-mode" aria-label="Đổi chế độ sáng/tối" title="Đổi chế độ sáng/tối">
            ${iconSvg('ph-regular-sun', 'icon--md')}
          </button>
          <div class="pbell">
            <button type="button" class="pnav__mode pbell__btn" aria-label="Thông báo" title="Thông báo">
              ${iconSvg('ph-regular-bell', 'icon--md')}
              <span class="pbell__badge">2</span>
            </button>
          </div>
          <div class="pnav__acct">
            <button type="button" class="pnav__me" aria-label="Menu tài khoản">
              ${avatarHtml('Nguyễn Thị Hồng Ánh', 0, '')}
              <span class="pnav__name">Hồng Ánh</span>
              ${iconSvg('ph-regular-caret-down')}
            </button>
          </div>
        </div>
      </header>
      <nav class="ptabbar" aria-label="Điều hướng di động">
        <a href="#home">${iconSvg('ph-bold-house', 'icon--lg')}<span>Trang chủ</span></a>
        <a href="#rooms" class="is-active" aria-current="page">${iconSvg('ph-regular-door-open', 'icon--lg')}<span>Phòng</span></a>
        <a href="#rankings">${iconSvg('ph-regular-crown-simple', 'icon--lg')}<span>Xếp hạng</span></a>
        <a href="#tournaments">${iconSvg('ph-regular-trophy', 'icon--lg')}<span>Giải</span></a>
        <a href="#me">${iconSvg('ph-regular-user-circle', 'icon--lg')}<span>Tôi</span></a>
      </nav>
    `;

    // Floating review dock (desktop only)
    const dock = document.createElement('div');
    dock.className = 'mk-dock';
    dock.setAttribute('role', 'region');
    dock.setAttribute('aria-label', 'Công cụ xem mockup');
    dock.innerHTML = `
      <a href="index.html">${iconSvg('ph-regular-arrow-left')}<span>Thư viện</span></a>
      <span class="mk-dock__sep" aria-hidden="true"></span>
      <a href="a-sanh-ban.html" class="${activeMockup === 'a' ? 'is-on' : ''}">A: Sảnh bàn</a>
      <a href="b-bang-dau.html" class="${activeMockup === 'b' ? 'is-on' : ''}">B: Bảng đấu</a>
      <a href="c-ky-vien.html" class="${activeMockup === 'c' ? 'is-on' : ''}">C: Kỳ viện</a>
      <span class="mk-dock__sep" aria-hidden="true"></span>
      <button type="button" id="mk-dock-mode">Sáng / Tối</button>
      <button type="button" id="mk-dock-skin">Skin: Arena</button>
      <button type="button" id="mk-dock-empty">Trạng thái trống</button>
    `;
    document.body.appendChild(dock);

    const toast = document.createElement('div');
    toast.className = 'mk-toast';
    toast.id = 'mk-toast';
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    // Apply URL params (?mode=light&skin=zen&empty=1) for screenshot automation
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('mode') === 'light') document.documentElement.setAttribute('data-mode', 'light');
    if (qs.get('skin') && ['arena', 'zen', 'bento'].includes(qs.get('skin'))) {
      document.documentElement.setAttribute('data-skin', qs.get('skin'));
    }

    const syncModeIcon = () => {
      const isLight = document.documentElement.getAttribute('data-mode') === 'light';
      const btn = document.getElementById('mk-nav-mode');
      if (btn) btn.innerHTML = iconSvg(isLight ? 'ph-regular-moon' : 'ph-regular-sun', 'icon--md');
      const dbtn = document.getElementById('mk-dock-mode');
      if (dbtn) dbtn.textContent = isLight ? 'Chế độ tối' : 'Chế độ sáng';
    };
    const toggleMode = () => {
      const isLight = document.documentElement.getAttribute('data-mode') === 'light';
      if (isLight) document.documentElement.removeAttribute('data-mode');
      else document.documentElement.setAttribute('data-mode', 'light');
      syncModeIcon();
    };
    document.getElementById('mk-nav-mode')?.addEventListener('click', toggleMode);
    document.getElementById('mk-dock-mode')?.addEventListener('click', toggleMode);
    syncModeIcon();

    const skins = ['arena', 'zen', 'bento'];
    const skinLabels = { arena: 'Arena', zen: 'Zen', bento: 'Bento' };
    const skinBtn = document.getElementById('mk-dock-skin');
    const syncSkin = () => {
      const cur = document.documentElement.getAttribute('data-skin') || 'arena';
      if (skinBtn) skinBtn.textContent = 'Skin: ' + (skinLabels[cur] || 'Arena');
    };
    skinBtn?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-skin') || 'arena';
      const next = skins[(skins.indexOf(cur) + 1) % skins.length];
      if (next === 'arena') document.documentElement.removeAttribute('data-skin');
      else document.documentElement.setAttribute('data-skin', next);
      syncSkin();
    });
    syncSkin();
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('mk-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2200);
  }

  function renderRulesInto(container) {
    if (!container) return;
    if (global.RoomRulesGuide && typeof global.t === 'function') {
      global.RoomRulesGuide.render(container, { t: global.t, active: ['freestyle', 'wall'] });
    }
  }

  function wireMockupInteractions(opts) {
    const emptyBtn = document.getElementById('mk-dock-empty');
    let isEmpty = new URLSearchParams(window.location.search).get('empty') === '1';
    if (emptyBtn && opts && typeof opts.onEmptyToggle === 'function') {
      const sync = () => {
        emptyBtn.classList.toggle('is-on', isEmpty);
        emptyBtn.textContent = isEmpty ? 'Hiện bàn mẫu' : 'Trạng thái trống';
        opts.onEmptyToggle(isEmpty);
      };
      emptyBtn.addEventListener('click', () => { isEmpty = !isEmpty; sync(); });
      if (isEmpty) sync();
    }

    document.addEventListener('click', (e) => {
      const createBtn = e.target.closest('[data-create-room]');
      if (createBtn) { showToast('Mở hộp thoại Tạo bàn mới'); return; }
      const roomBtn = e.target.closest('[data-room-id]');
      if (roomBtn) {
        const id = roomBtn.dataset.roomId;
        const t = TABLES.find((x) => x.roomId === id);
        const verb = t && t.kind === 'open' ? 'Ngồi vào bàn' : 'Vào xem bàn';
        showToast(`${verb} #${id} — ${t ? t.roomName : ''}`);
        return;
      }
      const userBtn = e.target.closest('[data-user-id]');
      if (userBtn) {
        const u = ONLINE_USERS.find((x) => x.userId === userBtn.dataset.userId);
        if (u && !u.isMe) showToast(`Nhắn tin với ${u.displayName}`);
      }
    });
  }

  global.RoomsMockup = {
    SPRITE,
    STATS,
    TABLES,
    ONLINE_USERS,
    STATUS_META,
    esc,
    iconSvg,
    initials,
    avatarHtml,
    renderShell,
    showToast,
    renderRulesInto,
    wireMockupInteractions,
  };
})(window);
