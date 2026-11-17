'use strict';

/**
 * Play3CR Round 4 — Domain Data, 5-in-a-row / Portal-Win Checker, Custom SVG Illustrations, and Tactile Interactive Boards.
 */
window.Play3CR4Data = (() => {
  const PLAYER = {
    name: 'Minh',
    elo: 1480,
    rank: 42,
    streak: 4,
  };

  const STATS = {
    online: 248,
    searching: 12,
    playing: 18,
  };

  const RULES = [
    { id: 'freestyle', short: 'Luật 1', label: 'Luật 1 (5+ quân liên tiếp)' },
    { id: 'caro', short: 'Luật 2', label: 'Luật 2 (Caro VN · trừ chặn 2 đầu)' },
    { id: 'standard', short: 'Tiêu chuẩn', label: 'Tiêu chuẩn (Đúng 5 · Tạo phòng)' },
  ];

  const CLOCKS = [
    { id: 'auto', short: 'Tự động', label: 'Tự động (mặc định 60s/nước)' },
    { id: 'm60', short: '60s/nước', label: '60 giây / nước' },
    { id: 'm45', short: '45s/nước', label: '45 giây / nước' },
    { id: 'm30', short: '30s/nước', label: '30 giây / nước' },
    { id: '1+1', short: '1+1', label: '1 phút + 1s' },
    { id: '3+2', short: '3+2', label: '3 phút + 2s' },
  ];

  const INITIAL_ROOMS = [
    {
      code: 'K7M',
      name: 'Bàn tre cuối tuần',
      host: 'Minh Anh',
      elo: 1620,
      rule: 'Luật 1 · Ô khoá',
      clock: '45s/nước',
      mode: 'Xếp hạng',
      open: true,
      note: 'Đang mở ghế Trắng',
      previewMoves: [[7, 7], [7, 8], [8, 6], [6, 8], [9, 5], [5, 9], [6, 6]],
    },
    {
      code: 'N4X',
      name: 'Phố Cổng #1',
      host: 'Quang Huy',
      elo: 1585,
      rule: 'Luật 1 · Ô khoá + Cổng',
      clock: '30s/nước',
      mode: 'Giao hữu',
      open: true,
      note: 'Mời giao lưu nhẹ nhàng',
      previewMoves: [[7, 7], [8, 7], [6, 8], [7, 8], [5, 9], [8, 8], [9, 6]],
    },
    {
      code: 'V8Q',
      name: 'Đấu trường Tối thứ Bảy',
      host: 'Thanh Lam',
      guest: 'Bảo Long',
      elo: 1645,
      rule: 'Luật 2 (Caro VN)',
      clock: '1+1',
      mode: 'Xếp hạng',
      open: false,
      note: '42 người đang xem · Nước 19',
      previewMoves: [[7, 7], [7, 8], [8, 6], [6, 8], [6, 6], [8, 8], [9, 5], [5, 9], [8, 7]],
    },
  ];

  const FRIENDS = [
    { name: 'Minh Anh', elo: 1620, status: 'Đang ngồi chờ tại #K7M' },
    { name: 'Thanh Lam', elo: 1645, status: 'Đang đấu tại #V8Q' },
    { name: 'Quang Huy', elo: 1585, status: 'Mở bàn #N4X (Cổng)' },
    { name: 'Ngọc Trâm', elo: 1540, status: 'Vừa giải xong Puzzle #402' },
  ];

  const NAV_ITEMS = [
    { id: 'rooms', label: 'Phòng chơi', desc: '18 bàn đang đấu · 4 bàn mở' },
    { id: 'ranking', label: 'Xếp hạng', desc: 'Bảng Glicko-2 · Bạn hạng #42' },
    { id: 'tournament', label: 'Giải đấu', desc: 'Cúp Cuối Tuần · 20:30 hôm nay' },
    { id: 'learn', label: 'Học & Puzzle', desc: 'Thế cờ #402 · Tìm nước tất thắng' },
    { id: 'club', label: 'Hội nhóm', desc: 'CLB Bàn Tre · 142 thành viên' },
    { id: 'forum', label: 'Diễn đàn', desc: 'Thảo luận Ô khoá & Cổng' },
  ];

  // Living Board opening position (inviting tactical tension around center H8)
  const LIVING_SEED = [
    [7, 7, 'B'], [7, 8, 'W'],
    [8, 6, 'B'], [6, 8, 'W'],
    [6, 6, 'B'], [8, 8, 'W'],
    [9, 5, 'B'], [5, 9, 'W'],
    [8, 7, 'B'], [6, 7, 'W'],
    [9, 6, 'B'], [9, 7, 'W'],
    [10, 4, 'B'],
  ]; // Placing at [11, 3] or [6, 9] creates thrilling continuation; [11, 3] makes 4/5 if extended! Let's check: (7,7)? Wait: (8,6)-(9,5)-(10,4) is 3 in a row diagonal! [11,3] makes 4 open, or let's make an immediate 4-in-a-row threat!
  // Let's check exact diagonal: (6,8)? No: (6,6)->(7,7)->(8,8) blocked. Let's inspect (8,6),(9,5),(10,4): let's add [7,7,'B'] (already there! (7,7),(8,6),(9,5),(10,4) IS 4 BLACK STONES IN A ROW!!).
  // Wait! Let's verify: (7,7), (8,6), (9,5), (10,4) -> x increases +1, y decreases -1! Yes! So [11,3] (L12) OR [6,8] (blocked by White at [6,8]!) — so [11,3] completes 5-IN-A-ROW immediately!! That's awesome!

  // Valid WallGenerator sample coords (WALL_EDGE_MIN_DIST = 4, outside center 3x3, Chebyshev >= 5)
  const LIVING_WALLS = [[4, 4], [4, 10], [10, 9]];

  // Social Playground 9x9 daily puzzle (cropped 3..11): Black to move and win at (9, 5) -> wait let's use clean clear win at (9, 5)
  const SOCIAL_PUZZLE_STONES = [
    [5, 7, 'B'], [6, 8, 'W'],
    [6, 7, 'B'], [7, 8, 'W'],
    [7, 7, 'B'], [8, 8, 'W'],
    [8, 7, 'B'], [4, 7, 'W'], // 4 black stones at y=7: x=5,6,7,8! Blocked at x=4 by W, open at x=9 (J8)!
    [7, 5, 'B'], [7, 6, 'W'],
  ];

  // Signature Concept: 15x15 Portal + Wall dramatic decisive position
  // Portal A links [3, 8] (D7) <-> [10, 4] (K11)
  // Walls block center: [6, 7], [7, 6], [8, 7]
  // Black diagonal through portal: [2, 9] (C6) -> [3, 8] (D7 Portal A) ===teleport===> [10, 4] (K11 Portal A) -> [11, 3] (L12) -> missing 5th stone at [12, 2] (M13)!
  const SIGNATURE_SEED = [
    [7, 7, 'B'], [7, 8, 'W'],
    [5, 6, 'B'], [6, 6, 'W'],
    [4, 7, 'B'], [5, 8, 'W'],
    [3, 8, 'B'], [8, 8, 'W'],
    [10, 4, 'B'], [9, 5, 'W'],
    [11, 3, 'B'], [8, 6, 'W'],
    [2, 9, 'B'], [6, 8, 'W'],
  ];
  const SIGNATURE_WALLS = [[6, 7], [7, 6], [8, 7]];
  const SIGNATURE_PORTALS = [[[3, 8], [10, 4]]];

  function colLabel(x) { return String.fromCharCode(65 + x); }
  function rowLabel(y) { return String(15 - y); }
  function formatCoord(x, y) { return colLabel(x) + rowLabel(y); }

  /** Check Luật 1 (freestyle): 5+ contiguous stones in any direction win (GameEngine freestyle parity). */
  function findFive(stones) {
    const map = new Map();
    for (const [x, y, s] of stones) map.set(`${x},${y}`, s);
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [x, y, s] of stones) {
      for (const [dx, dy] of dirs) {
        if (map.get(`${x - dx},${y - dy}`) === s) continue; // start at head of contiguous line
        const line = [[x, y]];
        let k = 1;
        while (map.get(`${x + dx * k},${y + dy * k}`) === s) {
          line.push([x + dx * k, y + dy * k]);
          k++;
        }
        if (line.length >= 5) return { side: s, line };
      }
    }
    return null;
  }

  function isLivingL12Winning(stones, nextSide) {
    if (nextSide !== 'B') return false;
    if (stones.some(([x, y]) => x === 11 && y === 3)) return false;
    return Boolean(findFive([...stones, [11, 3, 'B']]));
  }

  /**
   * 1) Living Board SVG — Warm Kaya/Hinoki wooden slab with natural grain, bevel depth,
   * subtle carved edge coordinates, directional sunlight cast shadows, tactile obsidian/shell stones,
   * and verified 5-in-a-row win locking.
   */
  function renderLivingBoard(stones, nextSide, { highlightHint = true, winInfo = null, wallCoords = [] } = {}) {
    const size = 15;
    const pad = 24;
    const inner = 372;
    const total = inner + pad * 2;
    const step = inner / (size - 1);
    const pos = (c) => pad + c * step;
    const occupied = new Set(stones.map(([x, y]) => `${x},${y}`));
    wallCoords.forEach(([wx, wy]) => occupied.add(`${wx},${wy}`));
    const stoneR = step * 0.425;
    const showL12Beacon = Boolean(highlightHint && !winInfo && isLivingL12Winning(stones, nextSide));

    const boardAria = winInfo
      ? 'Bàn thử Luật 1 đã kết thúc và tạm khoá sau nước thắng'
      : 'Bàn cờ gỗ Hinoki chơi thử Luật 1 Play3CR';
    let svg = `<svg class="r4-board-svg lv-board-svg${winInfo ? ' is-locked' : ''}" viewBox="0 0 ${total} ${total + 10}" role="img" aria-label="${boardAria}">`;
    svg += `<defs>
      <linearGradient id="lv-wood" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#EED6A9"/>
        <stop offset="52%" stop-color="#E2C18B"/>
        <stop offset="100%" stop-color="#D4AF76"/>
      </linearGradient>
      <linearGradient id="lv-sun" x1="0%" y1="0%" x2="80%" y2="85%">
        <stop offset="0%" stop-color="#FFF7E4" stop-opacity="0.38"/>
        <stop offset="45%" stop-color="#FFF7E4" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#7A5226" stop-opacity="0.16"/>
      </linearGradient>
      <radialGradient id="lv-b" cx="32%" cy="26%" r="72%">
        <stop offset="0%" stop-color="#585C57"/>
        <stop offset="45%" stop-color="#232523"/>
        <stop offset="100%" stop-color="#101110"/>
      </radialGradient>
      <radialGradient id="lv-w" cx="34%" cy="26%" r="74%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="72%" stop-color="#F6F1E5"/>
        <stop offset="100%" stop-color="#D9D0BE"/>
      </radialGradient>
      <filter id="lv-shadow" x="-20%" y="-20%" width="150%" height="150%">
        <feDropShadow dx="1.6" dy="2.6" stdDeviation="1.7" flood-color="#2E1D0A" flood-opacity="0.38"/>
      </filter>
    </defs>`;

    // Board thickness bevel underneath
    svg += `<rect x="2" y="10" width="${total - 4}" height="${total - 2}" rx="8" fill="#9E7744"/>`;
    // Top wood surface + warm sunlight sheen
    svg += `<rect x="0" y="0" width="${total}" height="${total}" rx="7" fill="url(#lv-wood)" stroke="#B78F58" stroke-width="1.2"/>`;
    // Subtle organic wood grain lines
    svg += `<g stroke="#B88E54" stroke-opacity="0.14" stroke-width="1">`;
    for (let gx = 14; gx < total; gx += 18) {
      svg += `<path d="M ${gx} 4 Q ${gx + ((gx % 3) - 1) * 5} ${total / 2} ${gx + 2} ${total - 4}" fill="none"/>`;
    }
    svg += `</g>`;
    svg += `<rect x="0" y="0" width="${total}" height="${total}" rx="7" fill="url(#lv-sun)" pointer-events="none"/>`;

    // Crisp grid lines
    svg += `<g stroke="#5C4426" stroke-opacity="0.72" stroke-width="0.95">`;
    for (let i = 0; i < size; i++) {
      const p = pos(i);
      svg += `<line x1="${pos(0)}" y1="${p}" x2="${pos(size - 1)}" y2="${p}"/>`;
      svg += `<line x1="${p}" y1="${pos(0)}" x2="${p}" y2="${pos(size - 1)}"/>`;
    }
    svg += `</g>`;

    // Star points
    svg += `<g fill="#4A351C" fill-opacity="0.82">`;
    for (const [sx, sy] of [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]]) {
      svg += `<circle cx="${pos(sx)}" cy="${pos(sy)}" r="2.9"/>`;
    }
    svg += `</g>`;

    // Win highlight beam if 5+ connected, else L12 beacon only when Black actually wins there
    if (winInfo) {
      const first = winInfo.line[0];
      const last = winInfo.line[winInfo.line.length - 1];
      svg += `<line x1="${pos(first[0])}" y1="${pos(first[1])}" x2="${pos(last[0])}" y2="${pos(last[1])}" stroke="#B8332A" stroke-width="6.5" stroke-linecap="round" stroke-opacity="0.58"/>`;
    } else if (showL12Beacon) {
      const hx = pos(11), hy = pos(3);
      svg += `<circle class="r4-beacon" cx="${hx}" cy="${hy}" r="${stoneR * 0.92}" fill="#B8332A" fill-opacity="0.16" stroke="#B8332A" stroke-width="1.6" stroke-dasharray="3 2"/>`;
    }

    // Stones with cast shadows
    stones.forEach(([x, y, side], idx) => {
      const cx = pos(x);
      const cy = pos(y);
      const isLast = idx === stones.length - 1;
      const cls = isLast ? 'r4-just-placed' : '';
      svg += `<g class="${cls}" filter="url(#lv-shadow)">`;
      svg += `<circle cx="${cx}" cy="${cy}" r="${stoneR}" fill="url(#${side === 'B' ? 'lv-b' : 'lv-w'})" stroke="${side === 'B' ? '#0C0D0C' : '#CEC4B1'}" stroke-width="0.7"/>`;
      if (isLast && !winInfo) {
        svg += `<circle cx="${cx}" cy="${cy}" r="${stoneR * 0.28}" fill="none" stroke="${side === 'B' ? '#F3D299' : '#B8332A'}" stroke-width="1.6"/>`;
      }
      svg += `</g>`;
    });

    // Interactive hover intersections — disabled cleanly once a 5-in-a-row win finishes the demo
    if (!winInfo) {
      const ghostFill = nextSide === 'B' ? '#1A1C1A' : '#FFFFFF';
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (occupied.has(`${x},${y}`)) continue;
          const cx = pos(x), cy = pos(y);
          svg += `<g data-cell="${x},${y}">
            <rect x="${cx - step / 2}" y="${cy - step / 2}" width="${step}" height="${step}" fill="transparent"/>
            <circle class="r4-ghost" cx="${cx}" cy="${cy}" r="${stoneR * 0.88}" fill="${ghostFill}" stroke="#5C4426" stroke-width="0.8"/>
          </g>`;
        }
      }
    }

    svg += `</svg>`;
    return svg;
  }

  /**
   * 2) Social Playground Puzzle/Table Mini-Board (9x9 cropped view around 3..11) + Custom Editorial Illustration
   */
  function renderSocialBoard(stones, { solved = false, mini = false } = {}) {
    const offset = 3;
    const size = 9;
    const pad = 16;
    const inner = 248;
    const total = inner + pad * 2;
    const step = inner / (size - 1);
    const pos = (c) => pad + (c - offset) * step;
    const inView = (x, y) => x >= offset && x < offset + size && y >= offset && y < offset + size;
    const occupied = new Set(stones.map(([x, y]) => `${x},${y}`));
    const stoneR = step * 0.41;

    let svg = `<svg class="r4-board-svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="Bàn cờ cộng đồng 9×9">`;
    svg += `<rect x="0" y="0" width="${total}" height="${total}" rx="12" fill="#FFFDF8" stroke="#1E4D3B" stroke-width="1.5"/>`;
    svg += `<g stroke="#C6D1C8" stroke-width="1">`;
    for (let i = 0; i < size; i++) {
      const p = pad + i * step;
      svg += `<line x1="${pad}" y1="${p}" x2="${pad + inner}" y2="${p}"/>`;
      svg += `<line x1="${p}" y1="${pad}" x2="${p}" y2="${pad + inner}"/>`;
    }
    svg += `</g>`;
    svg += `<circle cx="${pos(7)}" cy="${pos(7)}" r="2.8" fill="#1E4D3B"/>`;

    if (solved) {
      svg += `<line x1="${pos(5)}" y1="${pos(7)}" x2="${pos(9)}" y2="${pos(7)}" stroke="#E85D3F" stroke-width="6" stroke-linecap="round" stroke-opacity="0.48"/>`;
    } else if (!mini && !occupied.has('9,5')) {
      svg += `<circle class="r4-beacon" cx="${pos(9)}" cy="${pos(7)}" r="${stoneR * 0.92}" fill="#E85D3F" fill-opacity="0.18" stroke="#E85D3F" stroke-width="1.8" stroke-dasharray="3 2"/>`;
    }

    stones.forEach(([x, y, side], idx) => {
      if (!inView(x, y)) return;
      const cx = pos(x), cy = pos(y);
      const col = side === 'B' ? '#1E4D3B' : '#F2B749';
      const stroke = '#1B2420';
      svg += `<circle cx="${cx}" cy="${cy}" r="${stoneR}" fill="${col}" stroke="${stroke}" stroke-width="1.4"/>`;
      if (idx === stones.length - 1 && solved) {
        svg += `<circle cx="${cx}" cy="${cy}" r="${stoneR * 0.34}" fill="#FFFFFF"/>`;
      }
    });

    if (!mini) {
      for (let y = offset; y < offset + size; y++) {
        for (let x = offset; x < offset + size; x++) {
          if (occupied.has(`${x},${y}`)) continue;
          const cx = pos(x), cy = pos(y);
          svg += `<g data-cell="${x},${y}">
            <rect x="${cx - step / 2}" y="${cy - step / 2}" width="${step}" height="${step}" fill="transparent"/>
            <circle class="r4-ghost" cx="${cx}" cy="${cy}" r="${stoneR * 0.85}" fill="#1E4D3B"/>
          </g>`;
        }
      }
    }

    svg += `</svg>`;
    return svg;
  }

  /** Hand-crafted custom editorial illustration for Hướng B (friendly club atmosphere, zero generic AI clipart). */
  function renderClubIllustration() {
    return `<svg class="sp-illus" viewBox="0 0 220 92" fill="none" aria-hidden="true">
      <ellipse cx="110" cy="82" rx="92" ry="7" fill="#E8DFCE"/>
      <!-- Warm wooden table silhouette -->
      <path d="M28 68 L192 68 L178 44 L42 44 Z" fill="#E5B975" stroke="#1B2420" stroke-width="2" stroke-linejoin="round"/>
      <path d="M58 63 L162 63 L152 47 L68 47 Z" fill="#FBF6EC" stroke="#1B2420" stroke-width="1.5"/>
      <!-- Perspective grid hint -->
      <line x1="84" y1="47" x2="78" y2="63" stroke="#99A59B" stroke-width="1"/>
      <line x1="110" y1="47" x2="110" y2="63" stroke="#99A59B" stroke-width="1"/>
      <line x1="136" y1="47" x2="142" y2="63" stroke="#99A59B" stroke-width="1"/>
      <line x1="63" y1="55" x2="157" y2="55" stroke="#99A59B" stroke-width="1"/>
      <!-- Stones on table -->
      <circle cx="94" cy="54" r="4.5" fill="#1E4D3B" stroke="#1B2420" stroke-width="1.2"/>
      <circle cx="110" cy="54" r="4.5" fill="#E85D3F" stroke="#1B2420" stroke-width="1.2"/>
      <circle cx="125" cy="54" r="4.5" fill="#1E4D3B" stroke="#1B2420" stroke-width="1.2"/>
      <!-- Left player friendly crest -->
      <circle cx="48" cy="24" r="12" fill="#1E4D3B" stroke="#1B2420" stroke-width="2"/>
      <path d="M32 45 C32 37 64 37 64 45" fill="#3B7A5E" stroke="#1B2420" stroke-width="2" stroke-linecap="round"/>
      <circle cx="44" cy="23" r="1.6" fill="#FBF6EC"/>
      <circle cx="52" cy="23" r="1.6" fill="#FBF6EC"/>
      <path d="M45 27 Q48 30 51 27" stroke="#FBF6EC" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Right player friendly crest -->
      <circle cx="172" cy="24" r="12" fill="#E85D3F" stroke="#1B2420" stroke-width="2"/>
      <path d="M156 45 C156 37 188 37 188 45" fill="#F2896B" stroke="#1B2420" stroke-width="2" stroke-linecap="round"/>
      <circle cx="168" cy="23" r="1.6" fill="#1B2420"/>
      <circle cx="176" cy="23" r="1.6" fill="#1B2420"/>
      <path d="M169 27 Q172 30 175 27" stroke="#1B2420" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Iced tea glass & chess clock detail -->
      <rect x="97" y="29" width="26" height="12" rx="3" fill="#FFFFFF" stroke="#1B2420" stroke-width="1.8"/>
      <circle cx="104" cy="35" r="3" fill="#1E4D3B"/>
      <circle cx="116" cy="35" r="3" fill="#E85D3F"/>
    </svg>`;
  }

  /**
   * 3) Signature Experience Board — "Khoảnh Khắc Tứ-Tam · Cổng Không Gian"
   * Switches seamlessly between Vietnamese squared-notebook Paper mode (✕ ○) and Deep Lacquer mode (● ○),
   * highlighting Play3CR's exclusive Wall + Portal win across the diagonal!
   */
  function renderSignatureBoard(stones, { paper = false, portalWin = false, nextSide = 'B' } = {}) {
    const size = 15;
    const pad = 22;
    const inner = 376;
    const total = inner + pad * 2;
    const step = inner / (size - 1);
    const pos = (c) => pad + c * step;
    const occupied = new Set([...stones.map(([x, y]) => `${x},${y}`), ...SIGNATURE_WALLS.map(([x, y]) => `${x},${y}`)]);
    const stoneR = step * 0.41;

    const bg = paper ? '#FBF7EE' : '#131519';
    const frame = paper ? '#D5CCB9' : '#323741';
    const grid = paper ? '#CFDDF0' : '#262C36';
    const starCol = paper ? '#7691B8' : '#576274';
    const portalCol = paper ? '#0F766E' : '#2DD4BF';
    const wallFill = paper ? '#44403C' : '#2B313B';
    const wallStroke = paper ? '#1C1917' : '#64748B';

    let svg = `<svg class="r4-board-svg sg-board-svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="Bàn cờ độc bản Play3CR với Ô khoá và Cổng dịch chuyển">`;
    svg += `<defs>
      <radialGradient id="sg-b" cx="32%" cy="26%" r="72%">
        <stop offset="0%" stop-color="#4B525E"/>
        <stop offset="100%" stop-color="#0A0B0E"/>
      </radialGradient>
      <radialGradient id="sg-w" cx="32%" cy="26%" r="72%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="#DFD8CA"/>
      </radialGradient>
    </defs>`;

    svg += `<rect x="0" y="0" width="${total}" height="${total}" rx="10" fill="${bg}" stroke="${frame}" stroke-width="1.5"/>`;

    // Paper notebook left margin red rule for authentic Vietnamese vở ô ly cue
    if (paper) {
      svg += `<line x1="${pad + step * 0.45}" y1="8" x2="${pad + step * 0.45}" y2="${total - 8}" stroke="#E57373" stroke-opacity="0.35" stroke-width="1.2"/>`;
    }

    // Grid lines
    svg += `<g stroke="${grid}" stroke-width="0.95">`;
    for (let i = 0; i < size; i++) {
      const p = pos(i);
      svg += `<line x1="${pos(0)}" y1="${p}" x2="${pos(size - 1)}" y2="${p}"/>`;
      svg += `<line x1="${p}" y1="${pos(0)}" x2="${p}" y2="${pos(size - 1)}"/>`;
    }
    svg += `</g>`;

    // Star points
    svg += `<g fill="${starCol}">`;
    for (const [sx, sy] of [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]]) {
      svg += `<circle cx="${pos(sx)}" cy="${pos(sy)}" r="2.5"/>`;
    }
    svg += `</g>`;

    // Portal bridge & rings
    for (const [[ax, ay], [bx, by]] of SIGNATURE_PORTALS) {
      svg += `<line x1="${pos(ax)}" y1="${pos(ay)}" x2="${pos(bx)}" y2="${pos(by)}" stroke="${portalCol}" stroke-width="${portalWin ? 2.4 : 1.5}" stroke-dasharray="5 4" stroke-opacity="${portalWin ? 0.95 : 0.68}"/>`;
      for (const [px, py] of [[ax, ay], [bx, by]]) {
        const cx = pos(px), cy = pos(py), rr = step * 0.5;
        svg += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${portalCol}" fill-opacity="0.14" stroke="${portalCol}" stroke-width="2"/>`;
        svg += `<circle cx="${cx}" cy="${cy}" r="${rr * 0.72}" fill="none" stroke="${portalCol}" stroke-width="1" stroke-dasharray="2.5 2"/>`;
      }
    }

    // Portal win line when [12, 2] (M13) is placed!
    if (portalWin) {
      svg += `<line x1="${pos(2)}" y1="${pos(9)}" x2="${pos(3)}" y2="${pos(8)}" stroke="#D93829" stroke-width="6" stroke-linecap="round" stroke-opacity="0.72"/>`;
      svg += `<line x1="${pos(10)}" y1="${pos(4)}" x2="${pos(12)}" y2="${pos(2)}" stroke="#D93829" stroke-width="6" stroke-linecap="round" stroke-opacity="0.72"/>`;
    } else if (!occupied.has('12,2')) {
      const tx = pos(12), ty = pos(2);
      svg += `<circle class="r4-beacon" cx="${tx}" cy="${ty}" r="${stoneR * 0.95}" fill="#D93829" fill-opacity="0.2" stroke="#D93829" stroke-width="2" stroke-dasharray="3 2"/>`;
    }

    // Walls (Ô khoá)
    for (const [wx, wy] of SIGNATURE_WALLS) {
      const cx = pos(wx), cy = pos(wy), s = step * 0.74;
      svg += `<g>
        <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="3" fill="${wallFill}" stroke="${wallStroke}" stroke-width="1.3"/>
        <line x1="${cx - s * 0.28}" y1="${cy - s * 0.28}" x2="${cx + s * 0.28}" y2="${cy + s * 0.28}" stroke="${wallStroke}" stroke-width="1.4"/>
        <line x1="${cx + s * 0.28}" y1="${cy - s * 0.28}" x2="${cx - s * 0.28}" y2="${cy + s * 0.28}" stroke="${wallStroke}" stroke-width="1.4"/>
      </g>`;
    }

    // Stones / Paper X & O
    stones.forEach(([x, y, side], idx) => {
      const cx = pos(x), cy = pos(y);
      const isLast = idx === stones.length - 1;
      if (paper) {
        if (isLast) {
          svg += `<rect x="${cx - step * 0.44}" y="${cy - step * 0.44}" width="${step * 0.88}" height="${step * 0.88}" rx="3" fill="#FDE047" fill-opacity="0.45"/>`;
        }
        if (side === 'B') {
          const d = stoneR * 0.72;
          svg += `<line x1="${cx - d}" y1="${cy - d}" x2="${cx + d}" y2="${cy + d}" stroke="#1D4ED8" stroke-width="2.6" stroke-linecap="round"/>`;
          svg += `<line x1="${cx + d}" y1="${cy - d}" x2="${cx - d}" y2="${cy + d}" stroke="#1D4ED8" stroke-width="2.6" stroke-linecap="round"/>`;
        } else {
          svg += `<circle cx="${cx}" cy="${cy}" r="${stoneR * 0.76}" fill="none" stroke="#D93829" stroke-width="2.5"/>`;
        }
      } else {
        svg += `<circle cx="${cx + 1}" cy="${cy + 1.6}" r="${stoneR}" fill="rgba(0,0,0,0.4)"/>`;
        svg += `<circle cx="${cx}" cy="${cy}" r="${stoneR}" fill="url(#${side === 'B' ? 'sg-b' : 'sg-w'})" stroke="${side === 'B' ? '#475569' : '#FFFFFF'}" stroke-width="${side === 'B' ? 0.9 : 0.6}"/>`;
        if (isLast) {
          svg += `<circle cx="${cx}" cy="${cy}" r="${stoneR * 0.3}" fill="none" stroke="#D93829" stroke-width="1.8"/>`;
        }
      }
    });

    // Clickable empty cells
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (occupied.has(`${x},${y}`)) continue;
        const cx = pos(x), cy = pos(y);
        svg += `<g data-cell="${x},${y}">
          <rect x="${cx - step / 2}" y="${cy - step / 2}" width="${step}" height="${step}" fill="transparent"/>
          <circle class="r4-ghost" cx="${cx}" cy="${cy}" r="${stoneR * 0.84}" fill="none" stroke="${nextSide === 'B' ? '#D93829' : portalCol}" stroke-width="1.7"/>
        </g>`;
      }
    }

    svg += `</svg>`;
    return svg;
  }

  return {
    PLAYER,
    STATS,
    RULES,
    CLOCKS,
    INITIAL_ROOMS,
    FRIENDS,
    NAV_ITEMS,
    LIVING_SEED,
    LIVING_WALLS,
    SOCIAL_PUZZLE_STONES,
    SIGNATURE_SEED,
    SIGNATURE_WALLS,
    formatCoord,
    findFive,
    isLivingL12Winning,
    renderLivingBoard,
    renderSocialBoard,
    renderClubIllustration,
    renderSignatureBoard,
  };
})();
