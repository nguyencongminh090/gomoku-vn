'use strict';

/**
 * Play3CR Round 3 — Shared mock domain data, interactive game states, and multi-style SVG board engine.
 * Keeps round-2 untouched; strictly client-side simulation.
 */
window.Play3CRData = (() => {
  const PLAYER = {
    name: 'Minh',
    handle: '@minhcaro',
    elo: 1480,
    rank: 42,
    streak: 4,
    winRate: '64%',
    games: 126,
  };

  const STATS = {
    online: 248,
    searching: 12,
    playing: 18,
  };

  const RULES = [
    { id: 'freestyle', short: 'Luật 1', label: 'Luật 1 (Tự do)', desc: '5+ quân thẳng hàng thắng ngay' },
    { id: 'caro', short: 'Luật 2', label: 'Luật 2 (Caro VN)', desc: 'Chặn 2 đầu không thắng, đúng 5 quân' },
    { id: 'standard', short: 'Standard', label: 'Standard (Đúng 5)', desc: 'Chỉ thắng khi xếp đúng 5 quân' },
  ];

  const CLOCKS = [
    { id: 'auto', short: 'Tự động', label: 'Tự động (60s)' },
    { id: 'm45', short: '45s/nước', label: '45 giây / nước' },
    { id: 'm30', short: '30s/nước', label: '30 giây / nước' },
    { id: '1+1', short: '1+1 Blitz', label: '1 phút + 1s' },
    { id: '3+2', short: '3+2 Nhanh', label: '3 phút + 2s' },
  ];

  const INITIAL_ROOMS = [
    {
      code: 'K7M',
      name: 'Bàn tre cổ điển',
      host: 'Minh Anh',
      elo: 1620,
      rule: 'Luật 1 · Ô khoá',
      clock: '45s/nước',
      mode: 'Xếp hạng',
      state: 'Chờ đối thủ',
      open: true,
      seats: '1/2',
      viewers: 3,
    },
    {
      code: 'V8Q',
      name: 'Đấu trường Tối thứ Bảy',
      host: 'Thanh Lam',
      guest: 'Quang Huy',
      elo: 1645,
      guestElo: 1585,
      rule: 'Luật 2 (Caro)',
      clock: '1+1 Blitz',
      mode: 'Xếp hạng',
      state: 'Đang đấu · Nước 19',
      open: false,
      seats: '2/2',
      viewers: 42,
    },
    {
      code: 'N4X',
      name: 'Cổng dịch chuyển #1',
      host: 'Quang Huy',
      elo: 1585,
      rule: 'Luật 1 · Ô khoá + Cổng',
      clock: '30s/nước',
      mode: 'Giao hữu',
      state: 'Chờ đối thủ',
      open: true,
      seats: '1/2',
      viewers: 5,
    },
    {
      code: 'R2P',
      name: 'Phòng luyện Swap2',
      host: 'Ngọc Trâm',
      guest: 'Bảo Long',
      elo: 1540,
      guestElo: 1512,
      rule: 'Standard',
      clock: '3+2 Nhanh',
      mode: 'Xếp hạng',
      state: 'Đang đấu · Nước 14',
      open: false,
      seats: '2/2',
      viewers: 11,
    },
  ];

  const FRIENDS = [
    { id: 'ma', name: 'Minh Anh', elo: 1620, status: 'Đang rảnh · Mở mời', online: true },
    { id: 'tl', name: 'Thanh Lam', elo: 1645, status: 'Đang đấu #V8Q', online: true },
    { id: 'qh', name: 'Quang Huy', elo: 1585, status: 'Trong phòng #N4X', online: true },
    { id: 'nt', name: 'Ngọc Trâm', elo: 1540, status: 'Vừa thắng chuỗi 3', online: true },
  ];

  const RANKINGS = [
    { rank: 1, name: 'Thanh Lam', elo: 1645, wins: 192, streak: 6, badge: 'VĐ Mùa 3' },
    { rank: 2, name: 'Minh Anh', elo: 1620, wins: 174, streak: 3, badge: 'Á quân' },
    { rank: 3, name: 'Quang Huy', elo: 1585, wins: 159, streak: 2, badge: 'Top 5' },
    { rank: 4, name: 'Ngọc Trâm', elo: 1540, wins: 141, streak: 4, badge: 'Chiến thuật' },
    { rank: 42, name: 'Minh (Bạn)', elo: 1480, wins: 81, streak: 4, badge: 'Đang thăng hạng' },
  ];

  // Authentic 15x15 Gomoku/Caro positions (0..14 coords: x=col A..O, y=row 15..1)
  const MATCHES = {
    V8Q: {
      id: 'V8Q',
      title: 'Thanh Lam vs Quang Huy',
      rule: 'Luật 2 (Caro VN)',
      clockBlack: '01:42',
      clockWhite: '01:58',
      black: { name: 'Thanh Lam', elo: 1645 },
      white: { name: 'Quang Huy', elo: 1585 },
      winProbBlack: 62,
      viewers: 42,
      note: 'Nước 19: Đen tạo thế song tam ở H8–J9, buộc Trắng chặn đường chéo chính.',
      walls: [],
      portals: [],
      threatLine: [[5, 9], [8, 6]],
      moves: [
        [7, 7], [7, 8], [8, 6], [6, 8], [6, 6], [8, 8],
        [9, 5], [5, 9], [8, 7], [8, 9], [6, 7], [9, 7],
        [7, 6], [7, 5], [5, 7], [4, 7], [9, 6], [10, 6], [8, 5],
      ],
    },
    K7M: {
      id: 'K7M',
      title: 'Minh Anh vs Bảo Long',
      rule: 'Luật 1 · Ô khoá',
      clockBlack: '38s',
      clockWhite: '41s',
      black: { name: 'Minh Anh', elo: 1620 },
      white: { name: 'Bảo Long', elo: 1512 },
      winProbBlack: 54,
      viewers: 19,
      note: 'Ô khoá tại F8 & J7 bẻ gãy đường tấn công trung tâm, mở hướng đánh biên.',
      walls: [[5, 7], [9, 6], [7, 4], [7, 10]],
      portals: [],
      threatLine: [[4, 9], [8, 5]],
      moves: [
        [7, 7], [6, 7], [8, 7], [8, 8], [6, 8], [7, 8],
        [5, 9], [4, 10], [8, 6], [9, 5], [7, 6], [6, 6],
        [9, 7], [10, 7], [5, 8], [4, 8], [6, 9],
      ],
    },
    N4X: {
      id: 'N4X',
      title: 'Ngọc Trâm vs Minh',
      rule: 'Luật 1 · Ô khoá + Cổng',
      clockBlack: '24s',
      clockWhite: '29s',
      black: { name: 'Ngọc Trâm', elo: 1540 },
      white: { name: 'Minh', elo: 1480 },
      winProbBlack: 68,
      viewers: 27,
      note: 'Cổng D6 ↔ K11 nối mạch 5 quân xuyên bàn cờ — cơ chế đặc trưng Play3CR.',
      walls: [[6, 7], [8, 7], [7, 6]],
      portals: [[[3, 8], [10, 4]]],
      threatLine: [[2, 9], [3, 8], [10, 4], [12, 2]],
      moves: [
        [7, 7], [7, 8], [5, 6], [6, 6], [4, 7], [5, 8],
        [3, 8], [8, 8], [10, 4], [9, 5], [11, 3], [8, 6],
        [2, 9], [4, 9], [12, 2],
      ],
    },
  };

  const NAV_SECTIONS = [
    { id: 'home', label: 'Trang chủ' },
    { id: 'nav-rooms', label: 'Phòng chơi' },
    { id: 'ranking', label: 'Xếp hạng' },
    { id: 'tournament', label: 'Giải đấu' },
    { id: 'club', label: 'Hội nhóm' },
    { id: 'learn', label: 'Học & Puzzle' },
    { id: 'forum', label: 'Diễn đàn' },
  ];

  const EXTRA_DATA = {
    tournament: {
      name: 'Cúp Cuối Tuần · Mùa 4',
      time: '20:30 tối nay',
      players: '24 / 32 kỳ thủ',
      format: 'Thụy Sĩ 5 vòng · Luật 2 (Caro VN) · 3+2',
      prize: 'Huy hiệu Quán quân + 120 Elo thưởng bảng mùa',
    },
    puzzle: {
      id: '#402',
      title: 'Đánh thức song tứ qua Ô khoá',
      level: 'Khó · 4 nước tất thắng',
      author: 'Thanh Lam',
      solved: 318,
    },
    club: {
      name: 'Câu lạc bộ Bàn Tre',
      members: 142,
      avgElo: 1535,
      weeklyGames: 412,
      note: 'Giao lưu tối thứ 4 & thứ 7 hàng tuần.',
    },
    forum: [
      { title: 'Cách tận dụng Ô khoá cắt đường chéo chủ lực ở nước 7', author: 'Thanh Lam', replies: 24, tag: 'Chiến thuật' },
      { title: 'Giải mã thế Cổng D6↔K11 trong Cúp Tuần vừa qua', author: 'Minh Anh', replies: 18, tag: 'Phân tích' },
      { title: 'Swap2 cho người mới: khi nào nên đổi sang đi Trắng?', author: 'Ngọc Trâm', replies: 31, tag: 'Khai cuộc' },
    ],
  };

  const BOARD_THEMES = {
    editorial: {
      bg: '#F2EBD9',
      frame: '#C9BEA4',
      grid: '#A6987B',
      coord: '#6D624D',
      star: '#6D624D',
      blackFill: '#1B1916',
      blackStroke: '#1B1916',
      whiteFill: '#FFFDF8',
      whiteStroke: '#1B1916',
      wallFill: '#8C7E65',
      wallStroke: '#4D4435',
      portalA: '#B52B21',
      portalB: '#B52B21',
      lastMove: '#B52B21',
      threatLine: 'rgba(181, 43, 33, 0.35)',
      numLight: '#FFFDF8',
      numDark: '#1B1916',
    },
    esports: {
      bg: '#0D131D',
      frame: '#263549',
      grid: '#233246',
      coord: '#7C93B0',
      star: '#4E6A8E',
      blackFill: '#D7FF3B',
      blackStroke: '#EFFF9E',
      whiteFill: '#38BDF8',
      whiteStroke: '#BAE6FD',
      wallFill: '#334155',
      wallStroke: '#64748B',
      portalA: '#F472B6',
      portalB: '#F472B6',
      lastMove: '#FFFFFF',
      threatLine: 'rgba(215, 255, 59, 0.35)',
      numLight: '#0A0D12',
      numDark: '#061522',
    },
    blueprint: {
      bg: '#071B2E',
      frame: '#3B82B6',
      grid: '#144166',
      coord: '#7CC4FA',
      star: '#52A8E8',
      blackFill: '#E6F4FF',
      blackStroke: '#FFFFFF',
      whiteFill: '#071B2E',
      whiteStroke: '#7CC4FA',
      wallFill: '#173A57',
      wallStroke: '#FFB020',
      portalA: '#FFB020',
      portalB: '#34D399',
      lastMove: '#FFB020',
      threatLine: 'rgba(255, 176, 32, 0.55)',
      numLight: '#071B2E',
      numDark: '#E6F4FF',
    },
    zen: {
      bg: '#DFC397',
      frame: '#A98A5D',
      grid: '#695335',
      coord: '#5E4B32',
      star: '#4A3923',
      blackFill: '#1F1E1B',
      blackStroke: '#090908',
      whiteFill: '#FAF7F0',
      whiteStroke: '#C8BFA8',
      wallFill: '#8D7B64',
      wallStroke: '#574938',
      portalA: '#A83227',
      portalB: '#4D6B4A',
      lastMove: '#A83227',
      threatLine: 'rgba(168, 50, 39, 0.28)',
      numLight: '#FAF7F0',
      numDark: '#1F1E1B',
    },
    broadcast: {
      bg: '#ECE2CE',
      frame: '#B5A58A',
      grid: '#8F8068',
      coord: '#574E40',
      star: '#574E40',
      blackFill: '#181A1F',
      blackStroke: '#090A0D',
      whiteFill: '#FFFFFF',
      whiteStroke: '#525866',
      wallFill: '#78716C',
      wallStroke: '#44403C',
      portalA: '#E11D48',
      portalB: '#0284C7',
      lastMove: '#E11D48',
      threatLine: 'rgba(225, 29, 72, 0.35)',
      numLight: '#FFFFFF',
      numDark: '#181A1F',
    },
    cinematic: {
      bg: '#161311',
      frame: '#493D30',
      grid: '#3C3227',
      coord: '#9E8B70',
      star: '#7D6A50',
      blackFill: '#0C0C0E',
      blackStroke: '#544B41',
      whiteFill: '#F4EDE0',
      whiteStroke: '#C6B79E',
      wallFill: '#45382B',
      wallStroke: '#8C7458',
      portalA: '#F59E0B',
      portalB: '#F59E0B',
      lastMove: '#F59E0B',
      threatLine: 'rgba(245, 158, 11, 0.42)',
      numLight: '#F4EDE0',
      numDark: '#161311',
    },
    nexus: {
      bg: '#0E1C1E',
      frame: '#1E4044',
      grid: '#193538',
      coord: '#75A5AA',
      star: '#2A595F',
      blackFill: '#10F5A0',
      blackStroke: '#A7FCD9',
      whiteFill: '#FF6B6B',
      whiteStroke: '#FFC4C4',
      wallFill: '#244145',
      wallStroke: '#517A7F',
      portalA: '#38BDF8',
      portalB: '#38BDF8',
      lastMove: '#FFFFFF',
      threatLine: 'rgba(16, 245, 160, 0.35)',
      numLight: '#071B16',
      numDark: '#260808',
    },
    kinetic: {
      bg: '#FFFDF7',
      frame: '#111827',
      grid: '#CBD5E1',
      coord: '#111827',
      star: '#111827',
      blackFill: '#1D4ED8',
      blackStroke: '#111827',
      whiteFill: '#FF5A1F',
      whiteStroke: '#111827',
      wallFill: '#111827',
      wallStroke: '#111827',
      portalA: '#65A30D',
      portalB: '#65A30D',
      lastMove: '#A3E635',
      threatLine: 'rgba(29, 78, 216, 0.3)',
      numLight: '#FFFFFF',
      numDark: '#FFFFFF',
    },
    brutalist: {
      bg: '#FFFFFF',
      frame: '#0D0D0D',
      grid: '#B8B8B3',
      coord: '#0D0D0D',
      star: '#0D0D0D',
      blackFill: '#0D0D0D',
      blackStroke: '#0D0D0D',
      whiteFill: '#FFFFFF',
      whiteStroke: '#0D0D0D',
      wallFill: '#0D0D0D',
      wallStroke: '#0D0D0D',
      portalA: '#0D0D0D',
      portalB: '#0D0D0D',
      lastMove: '#0D0D0D',
      threatLine: 'rgba(13, 13, 13, 0.25)',
      numLight: '#FFFFFF',
      numDark: '#0D0D0D',
    },
    signature: {
      bg: '#FAF5EB',
      frame: '#CBBFA9',
      grid: '#D2C8B6',
      coord: '#7A6E5D',
      star: '#9C8E78',
      blackFill: '#1D1B18',
      blackStroke: '#0E0D0B',
      whiteFill: '#FFFFFF',
      whiteStroke: '#9E9382',
      paperX: '#1D4ED8',
      paperO: '#D93829',
      wallFill: '#57534E',
      wallStroke: '#292524',
      portalA: '#0F766E',
      portalB: '#14B8A6',
      lastMove: '#D93829',
      threatLine: 'rgba(20, 184, 166, 0.45)',
      numLight: '#FAF5EB',
      numDark: '#1D1B18',
    },
  };

  function colLabel(x) {
    return String.fromCharCode(65 + x);
  }

  function rowLabel(y) {
    return String(15 - y);
  }

  function formatCoord(x, y) {
    return colLabel(x) + rowLabel(y);
  }

  /**
   * Renders a crisp SVG 15x15 (or 11x11 cropped) Caro/Gomoku board tailored to a concept's visual theme.
   */
  function renderBoardSVG(opts = {}) {
    const theme = BOARD_THEMES[opts.theme || 'editorial'] || BOARD_THEMES.editorial;
    const size = opts.size || 15; // 15 (0..14) or 11 (2..12 centered window)
    const offset = size === 11 ? 2 : 0;
    const pad = opts.showCoords ? 26 : 16;
    const inner = 328;
    const total = inner + pad * 2;
    const step = inner / (size - 1);

    const pos = (c) => pad + (c - offset) * step;
    const inView = (x, y) => x >= offset && x < offset + size && y >= offset && y < offset + size;

    const match = MATCHES[opts.matchId || 'V8Q'] || MATCHES.V8Q;
    const stepLimit = typeof opts.moveLimit === 'number'
      ? Math.max(1, Math.min(opts.moveLimit, match.moves.length))
      : match.moves.length;

    const baseMoves = opts.useCustomOnly ? [] : match.moves.slice(0, stepLimit);
    const walls = opts.walls !== undefined ? opts.walls : match.walls;
    const portals = opts.portals !== undefined ? opts.portals : match.portals;
    const extraStones = opts.extraStones || [];
    const paperMode = !!opts.paperMode;
    const showCoords = !!opts.showCoords;
    const showMoveNums = !!opts.showMoveNums;
    const interactive = !!opts.interactive;
    const uid = 'p3b-' + Math.random().toString(36).slice(2, 7);

    let out = `<svg class="p3-board-svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${opts.ariaLabel || 'Bàn cờ Caro Play3CR 15×15'}">`;

    // Subtle radial gradient for 3D tactile stones when not paper mode
    out += `<defs>
      <radialGradient id="${uid}-b" cx="32%" cy="28%" r="70%">
        <stop offset="0%" stop-color="#5a5e5a" stop-opacity="${theme.blackFill === '#1F1E1B' || theme.blackFill === '#1B1916' || theme.blackFill === '#181A1F' || theme.blackFill === '#0C0C0E' ? '0.45' : '0'}"/>
        <stop offset="100%" stop-color="${theme.blackFill}" stop-opacity="1"/>
      </radialGradient>
      <radialGradient id="${uid}-w" cx="32%" cy="26%" r="72%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
        <stop offset="100%" stop-color="${theme.whiteFill}" stop-opacity="1"/>
      </radialGradient>
    </defs>`;

    // Background & outer frame
    out += `<rect x="0" y="0" width="${total}" height="${total}" rx="${opts.radius || 0}" fill="${theme.bg}" stroke="${theme.frame}" stroke-width="1.5"/>`;

    // Grid lines
    out += `<g stroke="${theme.grid}" stroke-width="${opts.theme === 'kinetic' || opts.theme === 'brutalist' ? 1.2 : 0.9}">`;
    for (let i = 0; i < size; i++) {
      const p = pad + i * step;
      out += `<line x1="${pad}" y1="${p}" x2="${pad + inner}" y2="${p}"/>`;
      out += `<line x1="${p}" y1="${pad}" x2="${p}" y2="${pad + inner}"/>`;
    }
    out += `</g>`;

    // Coordinate labels
    if (showCoords) {
      out += `<g fill="${theme.coord}" font-family="ui-monospace, Consolas, monospace" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="central">`;
      for (let i = 0; i < size; i++) {
        const real = offset + i;
        const p = pad + i * step;
        if (i % 2 === 0 || size <= 11) {
          out += `<text x="${p}" y="11">${colLabel(real)}</text>`;
          out += `<text x="11" y="${p}">${rowLabel(real)}</text>`;
        }
      }
      out += `</g>`;
    }

    // Star points
    const stars = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
    out += `<g fill="${theme.star}">`;
    for (const [sx, sy] of stars) {
      if (inView(sx, sy)) {
        out += `<circle cx="${pos(sx)}" cy="${pos(sy)}" r="2.7"/>`;
      }
    }
    out += `</g>`;

    // Threat / win connector line if at full view
    if (opts.showThreat && match.threatLine && stepLimit === match.moves.length) {
      if (portals.length && match.threatLine.length === 4) {
        const [a1, a2, b1, b2] = match.threatLine;
        if (inView(a1[0], a1[1]) && inView(a2[0], a2[1]) && inView(b1[0], b1[1]) && inView(b2[0], b2[1])) {
          out += `<line x1="${pos(a1[0])}" y1="${pos(a1[1])}" x2="${pos(a2[0])}" y2="${pos(a2[1])}" stroke="${theme.threatLine}" stroke-width="5" stroke-linecap="round"/>`;
          out += `<line x1="${pos(b1[0])}" y1="${pos(b1[1])}" x2="${pos(b2[0])}" y2="${pos(b2[1])}" stroke="${theme.threatLine}" stroke-width="5" stroke-linecap="round"/>`;
        }
      } else if (match.threatLine.length === 2) {
        const [p1, p2] = match.threatLine;
        if (inView(p1[0], p1[1]) && inView(p2[0], p2[1])) {
          out += `<line x1="${pos(p1[0])}" y1="${pos(p1[1])}" x2="${pos(p2[0])}" y2="${pos(p2[1])}" stroke="${theme.threatLine}" stroke-width="5.5" stroke-linecap="round"/>`;
        }
      }
    }

    // Portals (paired rings + dashed energy bridge)
    for (const pair of portals) {
      const [[ax, ay], [bx, by]] = pair;
      if (inView(ax, ay) && inView(bx, by)) {
        out += `<line x1="${pos(ax)}" y1="${pos(ay)}" x2="${pos(bx)}" y2="${pos(by)}" stroke="${theme.portalA}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.75"/>`;
        for (const [px, py, col, tag] of [[ax, ay, theme.portalA, 'A'], [bx, by, theme.portalB, 'A']]) {
          const cx = pos(px);
          const cy = pos(py);
          const rr = step * 0.43;
          out += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${col}" stroke-width="2.2"/>`;
          out += `<circle cx="${cx}" cy="${cy}" r="${rr * 0.68}" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="1" stroke-dasharray="2 2"/>`;
          out += `<text x="${cx + rr * 0.72}" y="${cy - rr * 0.72}" font-family="ui-monospace,monospace" font-size="8" font-weight="800" fill="${col}">${tag}</text>`;
        }
      }
    }

    // Walls (Ô khoá)
    for (const [wx, wy] of walls) {
      if (!inView(wx, wy)) continue;
      const cx = pos(wx);
      const cy = pos(wy);
      const s = step * 0.72;
      out += `<g>
        <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="2.5" fill="${theme.wallFill}" stroke="${theme.wallStroke}" stroke-width="1.4"/>
        <line x1="${cx - s / 3}" y1="${cy - s / 3}" x2="${cx + s / 3}" y2="${cy + s / 3}" stroke="${theme.wallStroke}" stroke-width="1.2"/>
        <line x1="${cx + s / 3}" y1="${cy - s / 3}" x2="${cx - s / 3}" y2="${cy + s / 3}" stroke="${theme.wallStroke}" stroke-width="1.2"/>
      </g>`;
    }

    // Combine baseMoves + interactive extraStones
    const occupied = new Set(walls.map(([x, y]) => `${x},${y}`));
    const placed = [];
    baseMoves.forEach(([x, y], idx) => {
      occupied.add(`${x},${y}`);
      placed.push({ x, y, side: idx % 2 === 0 ? 'B' : 'W', num: idx + 1 });
    });
    extraStones.forEach(([x, y, side], idx) => {
      const k = `${x},${y}`;
      if (occupied.has(k)) return;
      occupied.add(k);
      placed.push({ x, y, side, num: baseMoves.length + idx + 1 });
    });

    const stoneR = step * 0.41;
    placed.forEach((m, idx) => {
      if (!inView(m.x, m.y)) return;
      const cx = pos(m.x);
      const cy = pos(m.y);
      const isLast = idx === placed.length - 1;

      if (paperMode) {
        if (isLast) {
          out += `<rect x="${cx - step * 0.45}" y="${cy - step * 0.45}" width="${step * 0.9}" height="${step * 0.9}" fill="rgba(255, 234, 0, 0.42)" rx="2"/>`;
        }
        if (m.side === 'B') {
          const d = stoneR * 0.72;
          const col = theme.paperX || '#2962FF';
          out += `<line x1="${cx - d}" y1="${cy - d}" x2="${cx + d}" y2="${cy + d}" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>`;
          out += `<line x1="${cx + d}" y1="${cy - d}" x2="${cx - d}" y2="${cy + d}" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>`;
        } else {
          const col = theme.paperO || '#D93829';
          out += `<circle cx="${cx}" cy="${cy}" r="${stoneR * 0.78}" fill="none" stroke="${col}" stroke-width="2.4"/>`;
        }
      } else {
        const fill = m.side === 'B'
          ? (opts.theme === 'esports' || opts.theme === 'kinetic' || opts.theme === 'nexus' || opts.theme === 'brutalist' ? theme.blackFill : `url(#${uid}-b)`)
          : (opts.theme === 'esports' || opts.theme === 'kinetic' || opts.theme === 'nexus' || opts.theme === 'brutalist' ? theme.whiteFill : `url(#${uid}-w)`);
        const stroke = m.side === 'B' ? theme.blackStroke : theme.whiteStroke;
        if (opts.theme !== 'brutalist' && opts.theme !== 'blueprint') {
          out += `<circle cx="${cx + 1}" cy="${cy + 1.5}" r="${stoneR}" fill="rgba(0,0,0,0.22)"/>`;
        }
        out += `<circle cx="${cx}" cy="${cy}" r="${stoneR}" fill="${fill}" stroke="${stroke}" stroke-width="${opts.theme === 'brutalist' ? 1.8 : 1.1}"/>`;

        if (showMoveNums) {
          const tCol = m.side === 'B' ? theme.numLight : theme.numDark;
          out += `<text x="${cx}" y="${cy + 0.5}" font-family="Nunito,sans-serif" font-size="${stoneR * 0.88}" font-weight="800" fill="${tCol}" text-anchor="middle" dominant-baseline="central">${m.num}</text>`;
        } else if (isLast) {
          out += `<circle cx="${cx}" cy="${cy}" r="${stoneR * 0.32}" fill="none" stroke="${theme.lastMove}" stroke-width="1.8"/>`;
        }
      }
    });

    // Interactive invisible hit targets for empty cells
    if (interactive) {
      out += `<g>`;
      for (let y = offset; y < offset + size; y++) {
        for (let x = offset; x < offset + size; x++) {
          if (occupied.has(`${x},${y}`)) continue;
          const cx = pos(x);
          const cy = pos(y);
          out += `<g data-cell="${x},${y}">
            <rect x="${cx - step / 2}" y="${cy - step / 2}" width="${step}" height="${step}" fill="transparent"/>
            <circle class="p3-hover-ring" cx="${cx}" cy="${cy}" r="${stoneR * 0.85}" fill="none" stroke="${theme.lastMove}" stroke-width="1.5" stroke-dasharray="2 2"/>
          </g>`;
        }
      }
      out += `</g>`;
    }

    out += `</svg>`;
    return out;
  }

  return {
    PLAYER,
    STATS,
    RULES,
    CLOCKS,
    INITIAL_ROOMS,
    FRIENDS,
    RANKINGS,
    MATCHES,
    NAV_SECTIONS,
    EXTRA_DATA,
    renderBoardSVG,
    formatCoord,
  };
})();
