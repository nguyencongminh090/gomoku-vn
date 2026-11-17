'use strict';

/**
 * Play3CR Round 3 — Concepts 19 to 23 (Cinematic Split, Matchmaking Nexus, Kinetic Playground, Monochrome Brutalist, Signature Concept).
 */
(() => {
  const D = window.Play3CRData;

  function renderNavLinks(items, cls = 'nav-btn') {
    return items.map((s) => `<button type="button" class="${cls}" data-action="${s.id}">${s.label}</button>`).join('');
  }

  function renderMatchScrubber(matchId, step, totalMoves) {
    return `<div class="board-controls">
      <div class="board-match-tabs" role="group" aria-label="Chọn ván trực tiếp">
        ${['V8Q', 'K7M', 'N4X'].map((id) => `<button type="button" class="b-tab ${matchId === id ? 'is-on' : ''}" data-match-switch="${id}">#${id}</button>`).join('')}
      </div>
      <div class="board-steps" role="group" aria-label="Xem từng nước">
        <button type="button" class="b-step" data-board-step="prev" aria-label="Nước trước">‹</button>
        <span class="b-step-num">${step}/${totalMoves}</span>
        <button type="button" class="b-step" data-board-step="next" aria-label="Nước sau">›</button>
        <button type="button" class="b-step" data-board-step="live">Mới nhất</button>
      </div>
    </div>`;
  }

  const DESIGNS = [
    // ───────────────────────────────────────────────────────────────────────────
    // 19 — CINEMATIC SPLIT
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'cinematic-split',
      num: '19',
      name: 'Cinematic Split',
      color: '#D97706',
      summary: 'Bố cục phân cực sáng/tối 50/50 đậm chất điện ảnh, ảnh studio bàn cờ óc chó kết hợp bàn đấu tương tác',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const match = D.MATCHES[state.activeMatchId] || D.MATCHES.V8Q;
        const step = Math.min(state.moveStep, match.moves.length);
        return `<div class="cin-wrap">
          <header class="cin-header">
            <div class="cin-brand">
              <img src="assets/logo-mark.svg" alt="" width="26" height="26">
              <span>Play3CR</span>
            </div>
            <nav class="cin-nav" aria-label="Điều hướng">
              ${renderNavLinks(D.NAV_SECTIONS.filter((s) => s.id !== 'home'), 'cin-nav-btn')}
            </nav>
            <button type="button" class="cin-user" data-action="profile">${D.PLAYER.name} · ${D.PLAYER.elo}</button>
          </header>

          <main class="cin-split">
            <section class="cin-dark-half" aria-label="Khu vực khởi trận">
              <div class="cin-dark-inner">
                <span class="cin-eyebrow">PLAY3CR · SẢNH ĐỐI KHÁNG</span>
                <h1 class="cin-h1">Mỗi nước cờ là một <em>bước ngoặt.</em></h1>
                <p class="cin-lede">Bàn cờ 15×15 theo chuẩn Việt Nam — nơi chiến thuật cổ điển gặp Ô khoá và Cổng dịch chuyển.</p>

                <div class="cin-controls">
                  <div class="cin-ctrl-row">
                    <span>Luật</span>
                    <div>
                      ${D.RULES.map((r) => `<button type="button" class="cin-opt ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                      <button type="button" class="cin-opt ${state.wall ? 'is-on' : ''}" data-toggle-wall>Ô khoá</button>
                      <button type="button" class="cin-opt ${state.portal ? 'is-on' : ''}" data-toggle-portal>Cổng</button>
                    </div>
                  </div>
                  <div class="cin-ctrl-row">
                    <span>Tốc độ</span>
                    <div>
                      ${D.CLOCKS.slice(0, 4).map((c) => `<button type="button" class="cin-opt ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                      <button type="button" class="cin-opt ${state.rated ? 'is-on' : ''}" data-set-rated="true">Xếp hạng</button>
                    </div>
                  </div>
                </div>

                ${renderSearchingBanner()}

                <div class="cin-cta-row">
                  <button type="button" class="cin-amber-btn" data-action="play">
                    <span>Chơi nhanh ngay ↗</span>
                    <small>${fullPickSummary()}</small>
                  </button>
                  <button type="button" class="cin-ghost-btn" data-action="create-room">Tạo phòng</button>
                  <button type="button" class="cin-ghost-btn" data-action="challenge">Thách đấu</button>
                </div>

                <div class="cin-code-wrap">
                  ${renderCodeForm({ split: true, label: 'Vào thẳng bàn bằng mã phòng', btnLabel: 'Vào bàn', cls: 'cin-code' })}
                </div>

                <div class="cin-metrics">
                  <span><b>${D.STATS.online}</b> trực tuyến</span>
                  <span><b>${D.STATS.searching}</b> đang tìm trận</span>
                  <span><b>${D.STATS.playing}</b> ván đang đấu</span>
                </div>
              </div>
            </section>

            <section class="cin-light-half" aria-label="Khung hình bàn cờ và ván đấu">
              <div class="cin-photo-banner">
                <img src="assets/cinematic-duel.jpg" alt="Cận cảnh bàn cờ Caro gỗ óc chó ánh sáng tương phản" width="1280" height="720">
                <div class="cin-photo-badge">
                  <span>TIÊU ĐIỂM #${match.id}</span>
                  <strong>${match.black.name} vs ${match.white.name}</strong>
                </div>
              </div>

              <div class="cin-board-stage">
                <div class="cin-duel-bar">
                  <div><small>ĐEN</small><strong>${match.black.name} (${match.black.elo})</strong></div>
                  <span class="cin-vs">VS</span>
                  <div><small>TRẮNG</small><strong>${match.white.name} (${match.white.elo})</strong></div>
                </div>
                <div class="cin-svg-box">
                  ${D.renderBoardSVG({ theme: 'cinematic', matchId: match.id, moveLimit: step, showCoords: true, showThreat: true })}
                </div>
                ${renderMatchScrubber(match.id, step, match.moves.length)}
                <div class="cin-rooms-strip">
                  ${state.rooms.slice(0, 3).map((r) => `
                    <button type="button" class="cin-room-chip" data-action="room-${r.code}">
                      <strong>#${r.code}</strong>
                      <span>${r.name}</span>
                      <small>${r.clock}</small>
                    </button>
                  `).join('')}
                </div>
              </div>
            </section>
          </main>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 20 — MATCHMAKING NEXUS
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'matchmaking-nexus',
      num: '20',
      name: 'Matchmaking Nexus',
      color: '#10F5A0',
      summary: 'Hệ thống ghép trận siêu tốc với 4 làn chọn chế độ 1 chạm, bàn phím mã phòng cơ học và radar bàn mở',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const match = D.MATCHES[state.activeMatchId] || D.MATCHES.V8Q;
        const step = Math.min(state.moveStep, match.moves.length);
        const activeLane = state.portal ? 'portal'
          : (!state.rated && !state.wall && state.clock === 'auto') ? 'casual'
          : (state.rule === 'caro' && state.clock === '1+1') ? 'blitz'
          : 'fast';

        const lanes = [
          { id: 'fast', title: 'NHANH · LUẬT 1 + Ô KHOÁ', meta: '45s/nước · Xếp hạng', queue: '6 chờ · ~5s' },
          { id: 'blitz', title: 'BLITZ · CARO VN 1+1', meta: 'Chặn 2 đầu · Xếp hạng', queue: '4 chờ · ~9s' },
          { id: 'portal', title: 'ĐỘT BIẾN · Ô KHOÁ + CỔNG', meta: '30s/nước · Giao hữu', queue: '2 chờ · ~14s' },
          { id: 'casual', title: 'GIAO HỮU TỰ DO', meta: 'Tự động · Không tính Elo', queue: '5 chờ · ~6s' },
        ];

        return `<div class="nx-shell">
          <aside class="nx-rail" aria-label="Điều hướng chính">
            <div class="nx-rail-brand">
              <img src="assets/logo-mark.svg" alt="" width="28" height="28">
              <span>Play3CR</span>
            </div>
            <nav class="nx-rail-nav">
              ${D.NAV_SECTIONS.map((s) => `
                <button type="button" class="nx-rail-btn ${s.id === 'home' ? 'is-current' : ''}" data-action="${s.id}">${s.label}</button>
              `).join('')}
            </nav>
            <button type="button" class="nx-rail-user" data-action="profile">
              <strong>${D.PLAYER.name}</strong>
              <small>${D.PLAYER.elo} Elo · #${D.PLAYER.rank}</small>
            </button>
          </aside>

          <main class="nx-main">
            <header class="nx-topbar">
              <div>
                <span class="nx-kicker">GHÉP TRẬN TỨC THÌ · ETA TRUNG BÌNH 7 GIÂY</span>
                <h1 class="nx-h1">Matchmaking Nexus</h1>
              </div>
              <div class="nx-live-counts">
                <span><strong>${D.STATS.online}</strong> ONLINE</span>
                <span><strong>${D.STATS.searching}</strong> HÀNG CHỜ</span>
                <span><strong>${D.STATS.playing}</strong> BÀN SÁNG</span>
              </div>
            </header>

            <section class="nx-lanes" aria-label="Chọn nhanh chế độ ghép trận">
              ${lanes.map((lane) => `
                <button type="button" class="nx-lane ${activeLane === lane.id ? 'is-on' : ''}" data-preset="${lane.id}">
                  <span class="nx-lane-q">${lane.queue}</span>
                  <strong>${lane.title}</strong>
                  <small>${lane.meta}</small>
                </button>
              `).join('')}
            </section>

            ${renderSearchingBanner()}

            <section class="nx-dock">
              <div class="nx-dock-play">
                <div class="nx-dock-status">
                  <span>CẤU HÌNH ĐÃ NẠP:</span>
                  <strong>${fullPickSummary()}</strong>
                </div>
                <div class="nx-dock-buttons">
                  <button type="button" class="nx-go-btn" data-action="play">BẮT ĐẦU GHÉP TRẬN ⚡</button>
                  <button type="button" class="nx-alt-btn" data-action="create-room">+ Tạo phòng lấy mã</button>
                  <button type="button" class="nx-alt-btn" data-action="challenge">Thách đấu bạn</button>
                </div>
              </div>

              <div class="nx-dock-keypad">
                ${renderCodeForm({ split: true, label: 'NHẬP MÃ PHÒNG 3 KÝ TỰ', btnLabel: 'VÀO NGAY', cls: 'nx-code' })}
              </div>
            </section>

            <section class="nx-lower">
              <div class="nx-radar">
                <div class="nx-subhead">
                  <h2>RADAR PHÒNG MỞ (${state.rooms.length})</h2>
                  <button type="button" class="nx-link-sm" data-action="nav-rooms">Mở toàn bộ sảnh ↗</button>
                </div>
                <div class="nx-room-rows">
                  ${state.rooms.map((r) => `
                    <div class="nx-room-row">
                      <div class="nx-room-id">#${r.code}</div>
                      <div class="nx-room-info">
                        <strong>${r.name}</strong>
                        <small>${r.host} (${r.elo}) · ${r.rule} · ${r.clock}</small>
                      </div>
                      <button type="button" class="nx-seat-btn" data-action="room-${r.code}">${r.open ? 'Ngồi ngay' : 'Xem'}</button>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="nx-mini-board-box">
                <div class="nx-subhead">
                  <h2>VÁN TIÊU ĐIỂM #${match.id}</h2>
                  <button type="button" class="nx-link-sm" data-action="room-${match.id}">Quan sát ↗</button>
                </div>
                <div class="nx-board-svg-wrap">
                  ${D.renderBoardSVG({ theme: 'nexus', matchId: match.id, moveLimit: step, showCoords: false, showThreat: true })}
                </div>
                ${renderMatchScrubber(match.id, step, match.moves.length)}
              </div>
            </section>
          </main>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 21 — KINETIC PLAYGROUND
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'kinetic-playground',
      num: '21',
      name: 'Kinetic Playground',
      color: '#FF5A1F',
      summary: 'Hình học tân tiến, đường viền sắc nét, bàn cờ 11×11 đặt quân thử trực tiếp ngay trên trang chủ',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const navItems = D.NAV_SECTIONS.filter((s) => s.id !== 'home');
        return `<div class="kin-page">
          <header class="kin-bar">
            <div class="kin-brand">
              <span class="kin-badge-p">P3</span>
              <strong>Play3CR</strong>
            </div>
            <nav class="kin-nav" aria-label="Điều hướng">
              ${renderNavLinks(navItems, 'kin-nav-pill')}
            </nav>
            <button type="button" class="kin-user-pill" data-action="profile">${D.PLAYER.name} · ${D.PLAYER.elo}</button>
          </header>

          <main class="kin-stage">
            <section class="kin-hero-col">
              <div class="kin-sticker-row">
                <span class="kin-sticker kin-sticker--lime">● ${D.STATS.online} ONLINE</span>
                <span class="kin-sticker kin-sticker--blue">CARO 15×15 · MÙA 4</span>
              </div>

              <h1 class="kin-h1">Đánh nhanh.<br><span>Thắng gọn.</span></h1>
              <p class="kin-sub">Không rườm rà. Chọn luật, búng một nút hoặc chạm bàn cờ bên cạnh để thử nước khai cuộc.</p>

              <div class="kin-switch-panel">
                <div class="kin-switch-group">
                  ${D.RULES.map((r) => `<button type="button" class="kin-toggle ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                  <button type="button" class="kin-toggle ${state.wall ? 'is-on' : ''}" data-toggle-wall>+ Ô khoá</button>
                  <button type="button" class="kin-toggle ${state.portal ? 'is-on' : ''}" data-toggle-portal>+ Cổng</button>
                </div>
                <div class="kin-switch-group">
                  ${D.CLOCKS.slice(0, 4).map((c) => `<button type="button" class="kin-toggle ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                  <button type="button" class="kin-toggle ${state.rated ? 'is-on' : ''}" data-set-rated="true">Xếp hạng</button>
                </div>
              </div>

              ${renderSearchingBanner()}

              <div class="kin-cta-stack">
                <button type="button" class="kin-btn-orange" data-action="play">
                  <span>CHƠI NGAY →</span>
                  <small>${fullPickSummary()}</small>
                </button>
                <div class="kin-cta-pair">
                  <button type="button" class="kin-btn-blue" data-action="create-room">+ TẠO PHÒNG</button>
                  <button type="button" class="kin-btn-white" data-action="challenge">THÁCH ĐẤU</button>
                </div>
              </div>

              <div class="kin-code-block">
                ${renderCodeForm({ split: true, label: 'ĐÃ CÓ MÃ BÀN? NHẬP VÀO ĐÂY', btnLabel: 'VÀO!', cls: 'kin-code' })}
              </div>
            </section>

            <section class="kin-board-col" aria-label="Sân chơi bàn cờ tương tác">
              <div class="kin-board-frame">
                <div class="kin-board-top">
                  <strong>BÀN CỜ TƯƠNG TÁC (11×11)</strong>
                  <span>${state.nextSide === 'B' ? 'Lượt Xanh (Đen)' : 'Lượt Cam (Trắng)'}</span>
                </div>
                <div class="kin-svg-wrap">
                  ${D.renderBoardSVG({
                    theme: 'kinetic',
                    size: 11,
                    useCustomOnly: true,
                    extraStones: state.customStones,
                    walls: state.wall ? [[5, 7], [9, 6]] : [],
                    interactive: true,
                    showCoords: true,
                    ariaLabel: 'Bàn cờ Kinetic tương tác, chạm để đặt quân',
                  })}
                </div>
                <div class="kin-board-foot">
                  <button type="button" class="kin-mini-ctrl" data-board-step="sample5">Thế 5 quân mẫu</button>
                  <button type="button" class="kin-mini-ctrl" data-board-step="reset">Xoá bàn</button>
                  <button type="button" class="kin-mini-ctrl kin-mini-ctrl--fill" data-action="learn">Giải Puzzle #402 ↗</button>
                </div>
              </div>
            </section>
          </main>

          <section class="kin-ticket-strip" aria-label="Phòng mở nhanh">
            ${state.rooms.slice(0, 3).map((r, i) => `
              <button type="button" class="kin-ticket kin-ticket--${i}" data-action="room-${r.code}">
                <span class="kin-ticket-code">#${r.code}</span>
                <div>
                  <strong>${r.name}</strong>
                  <small>${r.host} · ${r.rule} · ${r.clock}</small>
                </div>
                <span class="kin-ticket-go">${r.open ? 'VÀO ↗' : 'XEM ↗'}</span>
              </button>
            `).join('')}
          </section>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 22 — MONOCHROME BRUTALIST
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'monochrome-brutalist',
      num: '22',
      name: 'Monochrome Brutalist',
      color: '#0D0D0D',
      summary: 'Kiến trúc đen trắng tương phản tuyệt đối, 0px bo góc, đường kẻ kết cấu và typography khối lớn',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const match = D.MATCHES[state.activeMatchId] || D.MATCHES.V8Q;
        const step = Math.min(state.moveStep, match.moves.length);
        return `<div class="br-grid-page">
          <header class="br-row-head">
            <div class="br-cell br-brand-cell">
              <strong>PLAY3CR</strong>
              <span>[VN-15×15]</span>
            </div>
            <nav class="br-cell br-nav-cell" aria-label="Điều hướng chính">
              ${renderNavLinks(D.NAV_SECTIONS.filter((s) => s.id !== 'home'), 'br-nav-btn')}
            </nav>
            <button type="button" class="br-cell br-user-cell" data-action="profile">
              <span>MINH</span>
              <strong>${D.PLAYER.elo}</strong>
            </button>
          </header>

          <section class="br-row-hero">
            <div class="br-cell br-title-cell">
              <span class="br-kicker">NỀN TẢNG CARO TRỰC TUYẾN // MÙA 4</span>
              <h1 class="br-h1">CARO.<br>KHÔNG NHIỄU.</h1>
            </div>
            <div class="br-cell br-stat-cell"><span>ONLINE</span><strong>${D.STATS.online}</strong></div>
            <div class="br-cell br-stat-cell"><span>TÌM TRẬN</span><strong>${D.STATS.searching}</strong></div>
            <div class="br-cell br-stat-cell"><span>ĐANG ĐẤU</span><strong>${D.STATS.playing}</strong></div>
          </section>

          <main class="br-row-main">
            <section class="br-cell br-col-action">
              <div class="br-block-label">01 // THIẾT LẬP VÀO VÁN</div>

              <div class="br-matrix">
                <div class="br-m-row">
                  <span>LUẬT</span>
                  <div>
                    ${D.RULES.map((r) => `<button type="button" class="br-btn-opt ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                    <button type="button" class="br-btn-opt ${state.wall ? 'is-on' : ''}" data-toggle-wall>+ Ô KHOÁ</button>
                    <button type="button" class="br-btn-opt ${state.portal ? 'is-on' : ''}" data-toggle-portal>+ CỔNG</button>
                  </div>
                </div>
                <div class="br-m-row">
                  <span>ĐỒNG HỒ</span>
                  <div>
                    ${D.CLOCKS.slice(0, 4).map((c) => `<button type="button" class="br-btn-opt ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                  </div>
                </div>
                <div class="br-m-row">
                  <span>HẠNG</span>
                  <div>
                    <button type="button" class="br-btn-opt ${state.rated ? 'is-on' : ''}" data-set-rated="true">XẾP HẠNG</button>
                    <button type="button" class="br-btn-opt ${!state.rated ? 'is-on' : ''}" data-set-rated="false">GIAO HỮU</button>
                  </div>
                </div>
              </div>

              ${renderSearchingBanner()}

              <button type="button" class="br-cta-solid" data-action="play">
                <span>CHƠI NHANH ↗</span>
                <small>${fullPickSummary()}</small>
              </button>

              <div class="br-cta-twin">
                <button type="button" class="br-cta-outline" data-action="create-room">+ TẠO PHÒNG</button>
                <button type="button" class="br-cta-outline" data-action="challenge">THÁCH ĐẤU</button>
              </div>

              <div class="br-code-zone">
                ${renderCodeForm({ label: 'MÃ PHÒNG [ 3 KÝ TỰ ]', btnLabel: 'VÀO', cls: 'br-code' })}
              </div>
            </section>

            <section class="br-cell br-col-board" aria-label="Bàn cờ phân tích đơn sắc">
              <div class="br-block-label">02 // BẢN GHI TRỰC TIẾP #${match.id}</div>
              <div class="br-match-meta">
                <span>${match.black.name} (${match.black.elo})</span>
                <span>VS</span>
                <span>${match.white.name} (${match.white.elo})</span>
              </div>
              <div class="br-board-wrap">
                ${D.renderBoardSVG({ theme: 'brutalist', matchId: match.id, moveLimit: step, showCoords: true, showThreat: true })}
              </div>
              <div class="br-board-foot">
                ${renderMatchScrubber(match.id, step, match.moves.length)}
                <button type="button" class="br-link-raw" data-action="room-${match.id}">XEM PHÒNG #${match.id} →</button>
              </div>
            </section>

            <aside class="br-cell br-col-ledger" aria-label="Danh mục phòng và sự kiện">
              <div class="br-block-label">03 // SỔ PHÒNG MỞ</div>
              <div class="br-ledger-list">
                ${state.rooms.map((r) => `
                  <button type="button" class="br-ledger-item" data-action="room-${r.code}">
                    <span class="br-l-code">#${r.code}</span>
                    <span class="br-l-name">${r.name}</span>
                    <span class="br-l-meta">${r.host} · ${r.clock} · ${r.state}</span>
                  </button>
                `).join('')}
              </div>
              <div class="br-ledger-extra">
                <button type="button" class="br-extra-btn" data-action="tournament">GIẢI ĐẤU 20:30 · 24 KỲ THỦ ↗</button>
                <button type="button" class="br-extra-btn" data-action="learn">PUZZLE #402 · 4 NƯỚC THẮNG ↗</button>
              </div>
            </aside>
          </main>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 23 — SIGNATURE CONCEPT: KỲ ĐÀI BIẾN ẢO (PLAY3CR ATELIER & PORTAL)
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'signature-portal',
      num: '23',
      name: 'Kỳ Đài Biến Ảo (Signature)',
      color: '#0F766E',
      summary: 'Định danh độc bản cho Play3CR: Bàn cờ tương tác chuyển đổi trực tiếp giữa Bàn Giấy (✕ ○) / Quân Đá (● ○) cùng cơ chế Ô khoá & Cổng dịch chuyển',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const isPortalShowcase = state.signatureRule === 'portal';
        const showcaseMatchId = isPortalShowcase ? 'N4X' : 'V8Q';
        const match = D.MATCHES[showcaseMatchId];
        const isPaper = state.signatureMode === 'paper';

        let tabMarkup = '';
        if (state.signatureTab === 'rooms') {
          tabMarkup = state.rooms.slice(0, 3).map((r) => `
            <button type="button" class="sg-drawer-row" data-action="room-${r.code}">
              <span class="sg-d-code">#${r.code}</span>
              <div><strong>${r.name}</strong><small>${r.host} · ${r.rule} · ${r.clock}</small></div>
              <span class="sg-d-go">${r.open ? 'Vào' : 'Xem'}</span>
            </button>
          `).join('');
        } else if (state.signatureTab === 'live') {
          tabMarkup = ['V8Q', 'K7M', 'N4X'].map((id) => {
            const m = D.MATCHES[id];
            return `<button type="button" class="sg-drawer-row" data-action="room-${id}">
              <span class="sg-d-code">#${id}</span>
              <div><strong>${m.title}</strong><small>${m.rule} · ${m.viewers} đang xem</small></div>
              <span class="sg-d-go">Xem</span>
            </button>`;
          }).join('');
        } else if (state.signatureTab === 'puzzle') {
          tabMarkup = `<button type="button" class="sg-drawer-row" data-action="learn">
            <span class="sg-d-code">${D.EXTRA_DATA.puzzle.id}</span>
            <div><strong>${D.EXTRA_DATA.puzzle.title}</strong><small>${D.EXTRA_DATA.puzzle.level} · ${D.EXTRA_DATA.puzzle.solved} người giải</small></div>
            <span class="sg-d-go">Giải</span>
          </button>`;
        } else {
          tabMarkup = `<button type="button" class="sg-drawer-row" data-action="tournament">
            <span class="sg-d-code">20:30</span>
            <div><strong>${D.EXTRA_DATA.tournament.name}</strong><small>${D.EXTRA_DATA.tournament.players} · ${D.EXTRA_DATA.tournament.format}</small></div>
            <span class="sg-d-go">Đăng ký</span>
          </button>`;
        }

        return `<div class="sg-atelier">
          <header class="sg-top">
            <div class="sg-brand">
              <img src="assets/logo-mark.svg" alt="" width="28" height="28">
              <div>
                <strong>Play3CR</strong>
                <small>Kỳ đài Việt Nam · Ô khoá &amp; Cổng</small>
              </div>
            </div>
            <nav class="sg-nav" aria-label="Điều hướng chính">
              ${renderNavLinks(D.NAV_SECTIONS.filter((s) => s.id !== 'home'), 'sg-nav-link')}
            </nav>
            <div class="sg-top-right">
              <span class="sg-pulse"><i aria-hidden="true"></i> ${D.STATS.online} online</span>
              <button type="button" class="sg-user" data-action="profile">${D.PLAYER.name} · ${D.PLAYER.elo}</button>
            </div>
          </header>

          <main class="sg-stage">
            <section class="sg-spine" aria-label="Bảng điều khiển vào ván">
              <div class="sg-spine-head">
                <span class="sg-badge">ĐỘC BẢN PLAY3CR</span>
                <h1 class="sg-h1">Caro quen thuộc,<br><span>chiến thuật mới.</span></h1>
                <p class="sg-lede">Đấu nhanh trên bàn 15×15 chuẩn, mở phòng mời bạn bằng mã 3 ký tự, hoặc bứt phá với luật Ô khoá &amp; Cổng.</p>
              </div>

              <div class="sg-config-block">
                <div class="sg-cfg-row">
                  <span>Luật chơi</span>
                  <div class="sg-chips">
                    ${D.RULES.map((r) => `<button type="button" class="sg-chip ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                  </div>
                </div>
                <div class="sg-cfg-row">
                  <span>Cơ chế đặc biệt</span>
                  <div class="sg-chips">
                    <button type="button" class="sg-chip sg-chip--jade ${state.wall ? 'is-on' : ''}" data-toggle-wall>Ô khoá ${state.wall ? '✓' : ''}</button>
                    <button type="button" class="sg-chip sg-chip--jade ${state.portal ? 'is-on' : ''}" data-toggle-portal>Cổng A↔B ${state.portal ? '✓' : ''}</button>
                  </div>
                </div>
                <div class="sg-cfg-row">
                  <span>Thời gian &amp; Hạng</span>
                  <div class="sg-chips">
                    ${D.CLOCKS.slice(0, 3).map((c) => `<button type="button" class="sg-chip ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                    <button type="button" class="sg-chip ${state.rated ? 'is-on' : ''}" data-set-rated="true">Xếp hạng</button>
                    <button type="button" class="sg-chip ${!state.rated ? 'is-on' : ''}" data-set-rated="false">Giao hữu</button>
                  </div>
                </div>
              </div>

              ${renderSearchingBanner()}

              <div class="sg-play-cluster">
                <button type="button" class="sg-cta-vermilion" data-action="play">
                  <span>Chơi nhanh ngay ↗</span>
                  <small>${fullPickSummary()}</small>
                </button>
                <div class="sg-sub-pair">
                  <button type="button" class="sg-cta-dark" data-action="create-room">+ Tạo phòng</button>
                  <button type="button" class="sg-cta-dark" data-action="challenge">Thách đấu</button>
                </div>
                ${renderCodeForm({ split: true, label: 'Nhập mã phòng từ bạn bè', btnLabel: 'Vào bàn', cls: 'sg-code' })}
              </div>

              <div class="sg-drawer">
                <div class="sg-drawer-tabs" role="tablist" aria-label="Hoạt động sảnh">
                  <button type="button" role="tab" aria-selected="${state.signatureTab === 'rooms'}" class="sg-d-tab ${state.signatureTab === 'rooms' ? 'is-on' : ''}" data-sig-tab="rooms">Phòng (${state.rooms.length})</button>
                  <button type="button" role="tab" aria-selected="${state.signatureTab === 'live'}" class="sg-d-tab ${state.signatureTab === 'live' ? 'is-on' : ''}" data-sig-tab="live">Đang đấu (${D.STATS.playing})</button>
                  <button type="button" role="tab" aria-selected="${state.signatureTab === 'puzzle'}" class="sg-d-tab ${state.signatureTab === 'puzzle' ? 'is-on' : ''}" data-sig-tab="puzzle">Puzzle</button>
                  <button type="button" role="tab" aria-selected="${state.signatureTab === 'tournament'}" class="sg-d-tab ${state.signatureTab === 'tournament' ? 'is-on' : ''}" data-sig-tab="tournament">Giải</button>
                </div>
                <div class="sg-drawer-body">${tabMarkup}</div>
              </div>
            </section>

            <section class="sg-canvas" aria-label="Bàn cờ trưng bày tương tác Play3CR">
              <div class="sg-canvas-bar">
                <div class="sg-mode-switch" role="group" aria-label="Kiểu hiển thị quân cờ">
                  <button type="button" class="sg-sw ${!isPaper ? 'is-on' : ''}" data-sig-mode="stone">● ○ Quân đá</button>
                  <button type="button" class="sg-sw ${isPaper ? 'is-on' : ''}" data-sig-mode="paper">✕ ○ Bàn giấy</button>
                </div>
                <div class="sg-mode-switch" role="group" aria-label="Thế cờ minh hoạ">
                  <button type="button" class="sg-sw ${isPortalShowcase ? 'is-on' : ''}" data-sig-rule="portal">Cổng + Ô khoá</button>
                  <button type="button" class="sg-sw ${!isPortalShowcase ? 'is-on' : ''}" data-sig-rule="classic">Cổ điển</button>
                </div>
              </div>

              <div class="sg-board-showcase">
                ${D.renderBoardSVG({
                  theme: 'signature',
                  matchId: showcaseMatchId,
                  extraStones: state.sigCustomStones,
                  paperMode: isPaper,
                  interactive: true,
                  showCoords: true,
                  showThreat: true,
                  radius: 6,
                  ariaLabel: 'Bàn cờ Signature tương tác Play3CR, chạm ô trống để đặt nước thử',
                })}
              </div>

              <div class="sg-canvas-foot">
                <div>
                  <strong>${isPortalShowcase ? 'Thế cờ #N4X · Cổng D6 ↔ K11' : 'Thế cờ #V8Q · Song tam trung tâm'}</strong>
                  <p>${match.note} Chạm vào giao điểm trống bất kỳ để đặt thử quân ${state.nextSide === 'B' ? 'Đen' : 'Trắng'}.</p>
                </div>
                <div class="sg-foot-acts">
                  <button type="button" class="sg-foot-btn" data-board-step="reset">Xoá quân thử</button>
                  <button type="button" class="sg-foot-btn sg-foot-btn--accent" data-action="room-${showcaseMatchId}">Vào ván #${showcaseMatchId} ↗</button>
                </div>
              </div>
            </section>
          </main>
        </div>`;
      },
    },
  ];

  window.Play3CRRuntime.registerDesigns(DESIGNS);
})();
