'use strict';

/**
 * Play3CR Round 3 — Concepts 14 to 18 (5 genuinely distinct layout systems).
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
        <button type="button" class="b-step" data-board-step="live" title="Về nước mới nhất">Mới nhất</button>
      </div>
    </div>`;
  }

  const DESIGNS = [
    // ───────────────────────────────────────────────────────────────────────────
    // 14 — GRANDMASTER EDITORIAL
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'editorial',
      num: '14',
      name: 'Grandmaster Editorial',
      color: '#B52B21',
      summary: 'Tạp chí kỳ đài bất đối xứng, thước kẻ biên tập, bàn cờ minh hoạ chú thích từng nước đi',
      render: ({ D, state, ruleSummary, renderSearchingBanner, renderCodeForm, getRuleObj, getClockObj }) => {
        const match = D.MATCHES[state.activeMatchId] || D.MATCHES.V8Q;
        const step = Math.min(state.moveStep, match.moves.length);
        const navItems = D.NAV_SECTIONS.filter((s) => s.id !== 'home');
        return `<div class="ed-page">
          <header class="ed-masthead">
            <div class="ed-mast-top">
              <span class="ed-issue">KỲ ĐÀI PLAY3CR · TẬP IV · SỐ 14</span>
              <span class="ed-brand"><img src="assets/logo-mark.svg" alt="" width="24" height="24">Play3CR</span>
              <button type="button" class="ed-profile" data-action="profile">${D.PLAYER.name} · ${D.PLAYER.elo} Elo</button>
            </div>
            <nav class="ed-nav" aria-label="Chuyên mục Play3CR">
              ${renderNavLinks(navItems, 'ed-nav-link')}
            </nav>
          </header>

          <main class="ed-spread">
            <section class="ed-col-lead">
              <p class="ed-kicker">TIÊU ĐIỂM BÀN CỜ · TRỰC TUYẾN 248 KỲ THỦ</p>
              <h1 class="ed-title">Nước đi <em>định đoạt</em> cả ván đấu.</h1>
              <p class="ed-lede">Chọn thể thức Caro Việt Nam, cài đồng hồ và bước thẳng vào bàn cờ không rào cản.</p>

              <div class="ed-ledger" aria-label="Thiết lập ván nhanh">
                <div class="ed-ledger-row">
                  <span class="ed-ledger-lbl">01 · Luật</span>
                  <div class="ed-ledger-opts">
                    ${D.RULES.map((r) => `<button type="button" class="ed-opt ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                    <button type="button" class="ed-opt ${state.wall ? 'is-on' : ''}" data-toggle-wall>+ Ô khoá</button>
                    <button type="button" class="ed-opt ${state.portal ? 'is-on' : ''}" data-toggle-portal>+ Cổng</button>
                  </div>
                </div>
                <div class="ed-ledger-row">
                  <span class="ed-ledger-lbl">02 · Đồng hồ</span>
                  <div class="ed-ledger-opts">
                    ${D.CLOCKS.slice(0, 4).map((c) => `<button type="button" class="ed-opt ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                  </div>
                </div>
                <div class="ed-ledger-row">
                  <span class="ed-ledger-lbl">03 · Chế độ</span>
                  <div class="ed-ledger-opts">
                    <button type="button" class="ed-opt ${state.rated ? 'is-on' : ''}" data-set-rated="true">Xếp hạng Elo</button>
                    <button type="button" class="ed-opt ${!state.rated ? 'is-on' : ''}" data-set-rated="false">Giao hữu</button>
                  </div>
                </div>
              </div>

              ${renderSearchingBanner()}

              <div class="ed-cta-row">
                <button type="button" class="ed-btn-primary" data-action="play">Chơi nhanh · ${getRuleObj().short} ↗</button>
                <button type="button" class="ed-btn-outline" data-action="create-room">Tạo phòng</button>
                <button type="button" class="ed-btn-outline" data-action="challenge">Thách đấu</button>
              </div>

              <div class="ed-code-wrap">
                ${renderCodeForm({ label: 'Nhập mã bàn mời (VD: K7M)', btnLabel: 'Mở bàn ↗', cls: 'ed-code' })}
              </div>

              <dl class="ed-stats">
                <div><dt>Đang trực tuyến</dt><dd>${D.STATS.online}</dd></div>
                <div><dt>Trong hàng chờ</dt><dd>${D.STATS.searching}</dd></div>
                <div><dt>Ván đang đấu</dt><dd>${D.STATS.playing}</dd></div>
              </dl>
            </section>

            <aside class="ed-col-plate" aria-label="Bản ghi thế cờ tiêu điểm">
              <div class="ed-plate-head">
                <span class="ed-plate-tag">BẢN GHI #${match.id} · ${match.rule.toUpperCase()}</span>
                <span class="ed-plate-players">${match.black.name} (${match.black.elo}) vs ${match.white.name} (${match.white.elo})</span>
              </div>

              <figure class="ed-plate-frame">
                ${D.renderBoardSVG({ theme: 'editorial', matchId: match.id, moveLimit: step, showCoords: true, showMoveNums: true, showThreat: true })}
                <figcaption class="ed-plate-cap">
                  ${renderMatchScrubber(match.id, step, match.moves.length)}
                  <p class="ed-plate-note">${match.note}</p>
                  <button type="button" class="ed-text-link" data-action="room-${match.id}">Vào quan sát ván #${match.id} →</button>
                </figcaption>
              </figure>

              <div class="ed-marginalia">
                <div class="ed-marg-block">
                  <h3>Phòng đang mở</h3>
                  ${state.rooms.slice(0, 3).map((r) => `
                    <button type="button" class="ed-room-line" data-action="room-${r.code}">
                      <span class="ed-room-code">#${r.code}</span>
                      <span class="ed-room-name">${r.name}</span>
                      <span class="ed-room-meta">${r.clock}</span>
                    </button>
                  `).join('')}
                </div>
                <div class="ed-marg-block">
                  <h3>Bài tập kỳ đài ${D.EXTRA_DATA.puzzle.id}</h3>
                  <p class="ed-marg-copy">${D.EXTRA_DATA.puzzle.title} — ${D.EXTRA_DATA.puzzle.level}.</p>
                  <button type="button" class="ed-text-link" data-action="learn">Thử giải thế cờ →</button>
                </div>
              </div>
            </aside>
          </main>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 15 — THE ARENA
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'arena-esports',
      num: '15',
      name: 'The Arena',
      color: '#D7FF3B',
      summary: 'Sảnh thi đấu esports 3 cánh: Cổng ghép trận bên trái, Sàn đấu trực tiếp trung tâm, Bảng giải đấu bên phải',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const match = D.MATCHES[state.activeMatchId] || D.MATCHES.V8Q;
        const step = Math.min(state.moveStep, match.moves.length);
        return `<div class="ar-shell">
          <header class="ar-topbar">
            <div class="ar-brand-wrap">
              <img src="assets/logo-mark.svg" alt="" width="26" height="26">
              <span class="ar-brand">PLAY3CR</span>
              <span class="ar-season">MÙA 4 · ARENA</span>
            </div>
            <nav class="ar-nav" aria-label="Điều hướng đấu trường">
              ${renderNavLinks(D.NAV_SECTIONS.filter((s) => s.id !== 'home'), 'ar-nav-btn')}
            </nav>
            <button type="button" class="ar-player-pill" data-action="profile">
              <span class="ar-dot" aria-hidden="true"></span>
              <span>${D.PLAYER.name}</span>
              <strong>${D.PLAYER.elo}</strong>
            </button>
          </header>

          <main class="ar-grid">
            <section class="ar-wing-launch" aria-label="Khu vực vào trận">
              <div class="ar-wing-head">
                <span class="ar-eyebrow">CHUẨN BỊ RA SÂN</span>
                <h1>BƯỚC VÀO<br>ĐẤU TRƯỜNG.</h1>
              </div>

              <div class="ar-spec-box">
                <div class="ar-spec-lbl">THỂ THỨC THI ĐẤU</div>
                <div class="ar-seg-row">
                  ${D.RULES.map((r) => `<button type="button" class="ar-seg ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                </div>
                <div class="ar-seg-row">
                  <button type="button" class="ar-seg ${state.wall ? 'is-on' : ''}" data-toggle-wall>Ô khoá ${state.wall ? 'BẬT' : 'TẮT'}</button>
                  <button type="button" class="ar-seg ${state.portal ? 'is-on' : ''}" data-toggle-portal>Cổng ${state.portal ? 'BẬT' : 'TẮT'}</button>
                </div>
                <div class="ar-spec-lbl">ĐỒNG HỒ &amp; HẠNG</div>
                <div class="ar-seg-row">
                  ${D.CLOCKS.slice(0, 4).map((c) => `<button type="button" class="ar-seg ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                </div>
                <div class="ar-seg-row">
                  <button type="button" class="ar-seg ${state.rated ? 'is-on' : ''}" data-set-rated="true">Tính điểm Elo</button>
                  <button type="button" class="ar-seg ${!state.rated ? 'is-on' : ''}" data-set-rated="false">Giao hữu</button>
                </div>
              </div>

              ${renderSearchingBanner()}

              <div class="ar-launch-btns">
                <button type="button" class="ar-ignite" data-action="play">
                  <span>CHƠI NHANH</span>
                  <small>${fullPickSummary()}</small>
                </button>
                <div class="ar-sub-actions">
                  <button type="button" class="ar-btn-sec" data-action="create-room">+ Tạo phòng</button>
                  <button type="button" class="ar-btn-sec" data-action="challenge">Thách đấu</button>
                </div>
              </div>

              <div class="ar-code-panel">
                ${renderCodeForm({ split: true, label: 'MÃ PHÒNG THI ĐẤU', btnLabel: 'VÀO', cls: 'ar-code' })}
              </div>
            </section>

            <section class="ar-center-stage" aria-label="Trận đấu tiêu điểm trên sân">
              <div class="ar-stage-hud">
                <div class="ar-fighter ar-fighter--b">
                  <span class="ar-side-tag">ĐEN</span>
                  <div>
                    <strong>${match.black.name}</strong>
                    <small>${match.black.elo} ELO</small>
                  </div>
                  <time class="ar-clock">${match.clockBlack}</time>
                </div>
                <div class="ar-vs-pill">
                  <span class="ar-live-badge">● TRỰC TIẾP</span>
                  <small>${match.viewers} khán giả</small>
                </div>
                <div class="ar-fighter ar-fighter--w">
                  <time class="ar-clock">${match.clockWhite}</time>
                  <div>
                    <strong>${match.white.name}</strong>
                    <small>${match.white.elo} ELO</small>
                  </div>
                  <span class="ar-side-tag">TRẮNG</span>
                </div>
              </div>

              <div class="ar-eval-bar" aria-label="Tỉ lệ ưu thế ${match.winProbBlack}%">
                <div class="ar-eval-fill" style="width:${match.winProbBlack}%"></div>
              </div>

              <div class="ar-board-stage">
                ${D.renderBoardSVG({ theme: 'esports', matchId: match.id, moveLimit: step, showCoords: true, showThreat: true })}
              </div>

              <div class="ar-stage-foot">
                ${renderMatchScrubber(match.id, step, match.moves.length)}
                <button type="button" class="ar-watch-btn" data-action="room-${match.id}">Vào khán đài #${match.id} ↗</button>
              </div>
            </section>

            <aside class="ar-wing-bracket" aria-label="Giải đấu và bàn mở">
              <div class="ar-telemetry">
                <div><span>ONLINE</span><strong>${D.STATS.online}</strong></div>
                <div><span>CHỜ GHÉP</span><strong>${D.STATS.searching}</strong></div>
                <div><span>ĐANG ĐẤU</span><strong>${D.STATS.playing}</strong></div>
              </div>

              <div class="ar-panel-block">
                <div class="ar-block-head">
                  <h2>GIẢI ĐẤU TỐI NAY</h2>
                  <button type="button" class="ar-link-sm" data-action="tournament">Chi tiết ↗</button>
                </div>
                <div class="ar-tour-card">
                  <strong>${D.EXTRA_DATA.tournament.name}</strong>
                  <p>${D.EXTRA_DATA.tournament.time} · ${D.EXTRA_DATA.tournament.players}</p>
                  <div class="ar-bracket-mini" aria-hidden="true">
                    <span>Tứ kết 1 — 20:30</span>
                    <span>Tứ kết 2 — 20:30</span>
                    <span class="is-final">Chung kết — 21:45</span>
                  </div>
                </div>
              </div>

              <div class="ar-panel-block">
                <div class="ar-block-head">
                  <h2>PHÒNG ĐANG MỞ</h2>
                  <button type="button" class="ar-link-sm" data-action="nav-rooms">Tất cả ↗</button>
                </div>
                <div class="ar-room-list">
                  ${state.rooms.slice(0, 3).map((r) => `
                    <button type="button" class="ar-room-item" data-action="room-${r.code}">
                      <div><strong>${r.name}</strong><small>${r.host} · ${r.rule}</small></div>
                      <span class="ar-room-code">#${r.code}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            </aside>
          </main>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 16 — TACTICAL BLUEPRINT
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'blueprint',
      num: '16',
      name: 'Tactical Blueprint',
      color: '#38BDF8',
      summary: 'Bản vẽ chiến thuật tọa độ A–O / 1–15, sơ đồ Ô khoá & Cổng dịch chuyển, kết nối vector kỹ thuật',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const bpId = state.userPickedMatch ? state.activeMatchId : 'N4X';
        const match = D.MATCHES[bpId] || D.MATCHES.N4X;
        const step = state.userPickedMatch ? Math.min(state.moveStep, match.moves.length) : match.moves.length;
        return `<div class="bp-canvas">
          <header class="bp-bar">
            <div class="bp-callsign">
              <span class="bp-tag">[SYS]</span>
              <strong>PLAY3CR // TACTICAL-15×15</strong>
            </div>
            <nav class="bp-nav" aria-label="Điều hướng kỹ thuật">
              ${D.NAV_SECTIONS.filter((s) => s.id !== 'home').map((s, idx) => `
                <button type="button" class="bp-nav-item" data-action="${s.id}">[0${idx + 1}] ${s.label.toUpperCase()}</button>
              `).join('')}
            </nav>
            <button type="button" class="bp-op" data-action="profile">OP: ${D.PLAYER.name.toUpperCase()} (${D.PLAYER.elo})</button>
          </header>

          <main class="bp-sheet">
            <section class="bp-left-schematic">
              <div class="bp-frame-corner">
                <span class="bp-coord-id">SEC-01 // MATCH INIT</span>
                <h1 class="bp-h1">ĐIỀU HÀNH<br>THẾ TRẬN CARO.</h1>
                <p class="bp-sub">Bản đồ tác chiến hỗ trợ Ô khoá (Wall) và Cổng không gian (Portal) thời gian thực.</p>
              </div>

              <div class="bp-matrix">
                <div class="bp-matrix-row">
                  <span class="bp-key">LUẬT_CHƠI</span>
                  <div class="bp-vals">
                    ${D.RULES.map((r) => `<button type="button" class="bp-chip ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                  </div>
                </div>
                <div class="bp-matrix-row">
                  <span class="bp-key">BIẾN_THỂ</span>
                  <div class="bp-vals">
                    <button type="button" class="bp-chip ${state.wall ? 'is-on' : ''}" data-toggle-wall>[WALL: ${state.wall ? 'ON' : 'OFF'}]</button>
                    <button type="button" class="bp-chip ${state.portal ? 'is-on' : ''}" data-toggle-portal>[PORTAL: ${state.portal ? 'ON' : 'OFF'}]</button>
                  </div>
                </div>
                <div class="bp-matrix-row">
                  <span class="bp-key">ĐỒNG_HỒ</span>
                  <div class="bp-vals">
                    ${D.CLOCKS.slice(0, 4).map((c) => `<button type="button" class="bp-chip ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                  </div>
                </div>
                <div class="bp-matrix-row">
                  <span class="bp-key">CHẾ_ĐỘ</span>
                  <div class="bp-vals">
                    <button type="button" class="bp-chip ${state.rated ? 'is-on' : ''}" data-set-rated="true">RANKED</button>
                    <button type="button" class="bp-chip ${!state.rated ? 'is-on' : ''}" data-set-rated="false">CASUAL</button>
                  </div>
                </div>
              </div>

              ${renderSearchingBanner()}

              <div class="bp-actions">
                <button type="button" class="bp-exec-btn" data-action="play">▶ KHỞI CHẠY GHÉP TRẬN</button>
                <div class="bp-sec-pair">
                  <button type="button" class="bp-wire-btn" data-action="create-room">+ TẠO BÀN TÁC CHIẾN</button>
                  <button type="button" class="bp-wire-btn" data-action="challenge">THÁCH ĐẤU ↗</button>
                </div>
              </div>

              <div class="bp-uplink">
                ${renderCodeForm({ label: 'MÃ TỌA ĐỘ PHÒNG (3 KÝ TỰ)', btnLabel: 'KẾT NỐI', cls: 'bp-code' })}
              </div>

              <div class="bp-telemetry-strip">
                <span>ONLINE: <strong>${D.STATS.online}</strong></span>
                <span>HÀNG CHỜ: <strong>${D.STATS.searching}</strong></span>
                <span>TRẬN MỞ: <strong>${D.STATS.playing}</strong></span>
              </div>
            </section>

            <section class="bp-right-grid" aria-label="Sơ đồ bàn cờ tọa độ">
              <div class="bp-map-header">
                <span>SEC-02 // LIVE VECTOR BOARD (#${match.id})</span>
                <span>${match.rule}</span>
              </div>
              <div class="bp-board-frame">
                ${D.renderBoardSVG({ theme: 'blueprint', matchId: match.id, moveLimit: step, showCoords: true, showThreat: true })}
              </div>
              <div class="bp-map-footer">
                ${renderMatchScrubber(match.id, step, match.moves.length)}
                <div class="bp-vector-note">
                  <span>VECTOR: ${match.note}</span>
                  <button type="button" class="bp-inspect-btn" data-action="room-${match.id}">TRUY CẬP PHÒNG #${match.id} ↗</button>
                </div>
              </div>
            </section>
          </main>

          <footer class="bp-ledger">
            <span class="bp-ledger-title">OPEN_ROOMS //</span>
            <div class="bp-ledger-items">
              ${state.rooms.slice(0, 4).map((r) => `
                <button type="button" class="bp-room-pill" data-action="room-${r.code}">
                  <code>#${r.code}</code>
                  <span>${r.name}</span>
                  <small>${r.state}</small>
                </button>
              `).join('')}
            </div>
          </footer>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 17 — ZEN & STONE
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'zen-stone',
      num: '17',
      name: 'Zen & Stone',
      color: '#436040',
      summary: 'Không gian tĩnh lặng kiểu Á Đông, bàn gỗ Hinoki cho phép đặt quân thử trực tiếp và khoảng trắng có chủ đích',
      render: ({ D, state, renderSearchingBanner, renderCodeForm }) => {
        const lastPlaced = state.customStones[state.customStones.length - 1];
        const nextTxt = state.nextSide === 'B' ? 'Lượt quân Đen' : 'Lượt quân Trắng';
        return `<div class="zen-sanctuary">
          <header class="zen-top">
            <div class="zen-seal-brand">
              <span class="zen-hanko" aria-hidden="true">棋</span>
              <span class="zen-wordmark">Play3CR</span>
            </div>
            <nav class="zen-nav" aria-label="Điều hướng">
              ${renderNavLinks(D.NAV_SECTIONS.filter((s) => s.id !== 'home'), 'zen-link')}
            </nav>
            <button type="button" class="zen-user" data-action="profile">${D.PLAYER.name} · ${D.PLAYER.elo}</button>
          </header>

          <main class="zen-gallery">
            <section class="zen-column-quiet">
              <p class="zen-poem-tag">KỲ ĐẠO · BÀN CỜ TĨNH</p>
              <h1 class="zen-h1">Đặt một quân.<br>Lắng nghe ván cờ.</h1>
              <p class="zen-sub">Sự tĩnh tại của gỗ Hinoki và nhịp đấu 15×15 không nhiễu loạn.</p>

              <div class="zen-selectors" aria-label="Chọn luật ván">
                <div class="zen-line-group">
                  <span>Luật</span>
                  <div>
                    ${D.RULES.map((r) => `<button type="button" class="zen-opt ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                    <button type="button" class="zen-opt ${state.wall ? 'is-on' : ''}" data-toggle-wall>Ô khoá</button>
                  </div>
                </div>
                <div class="zen-line-group">
                  <span>Thời gian</span>
                  <div>
                    ${D.CLOCKS.slice(0, 3).map((c) => `<button type="button" class="zen-opt ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                  </div>
                </div>
                <div class="zen-line-group">
                  <span>Hình thức</span>
                  <div>
                    <button type="button" class="zen-opt ${state.rated ? 'is-on' : ''}" data-set-rated="true">Xếp hạng</button>
                    <button type="button" class="zen-opt ${!state.rated ? 'is-on' : ''}" data-set-rated="false">Giao hữu</button>
                  </div>
                </div>
              </div>

              ${renderSearchingBanner()}

              <div class="zen-actions">
                <button type="button" class="zen-stone-btn" data-action="play">Chơi nhanh</button>
                <button type="button" class="zen-ghost-btn" data-action="create-room">Tạo bàn mới</button>
                <button type="button" class="zen-ghost-btn" data-action="challenge">Thách đấu</button>
              </div>

              <div class="zen-code-block">
                ${renderCodeForm({ split: true, label: 'Mời vào phòng bằng mã', btnLabel: 'Vào', cls: 'zen-code' })}
              </div>
            </section>

            <section class="zen-board-altar" aria-label="Bàn cờ tương tác Zen">
              <div class="zen-board-meta">
                <span>BÀN GỖ TƯƠNG TÁC · CHẠM ĐỂ ĐẶT QUÂN (${nextTxt})</span>
                <div class="zen-board-tools">
                  <button type="button" class="zen-whisper" data-board-step="sample5">Thế cờ mẫu</button>
                  <button type="button" class="zen-whisper" data-board-step="reset">Dọn bàn</button>
                </div>
              </div>
              <div class="zen-hinoki-slab">
                ${D.renderBoardSVG({
                  theme: 'zen',
                  useCustomOnly: true,
                  extraStones: state.customStones,
                  walls: state.wall ? [[5, 7], [9, 6]] : [],
                  interactive: true,
                  showCoords: false,
                  radius: 4,
                  ariaLabel: 'Bàn cờ Zen tương tác, bấm vào giao điểm để đặt quân',
                })}
              </div>
              <div class="zen-altar-foot">
                <span>${lastPlaced ? `Nước vừa đặt: ${D.formatCoord(lastPlaced[0], lastPlaced[1])}` : 'Bàn trống — chạm để khởi tạo khai cuộc'}</span>
                <button type="button" class="zen-whisper" data-action="room-V8Q">Đang đấu: Thanh Lam vs Quang Huy (#V8Q) ↗</button>
              </div>
            </section>
          </main>

          <footer class="zen-horizon">
            <div class="zen-metrics-line">
              <span><strong>${D.STATS.online}</strong> kỳ thủ trực tuyến</span>
              <span><strong>${D.STATS.searching}</strong> đang tìm trận</span>
              <span><strong>${D.STATS.playing}</strong> bàn đang sáng</span>
            </div>
            <div class="zen-invites">
              ${state.rooms.slice(0, 3).map((r) => `<button type="button" class="zen-invite-link" data-action="room-${r.code}">#${r.code} ${r.name} (${r.clock})</button>`).join('')}
            </div>
          </footer>
        </div>`;
      },
    },

    // ───────────────────────────────────────────────────────────────────────────
    // 18 — LIVE BROADCAST
    // ───────────────────────────────────────────────────────────────────────────
    {
      id: 'live-broadcast',
      num: '18',
      name: 'Live Broadcast',
      color: '#E11D48',
      summary: 'Đài phát sóng giải đấu: Kênh bàn cờ trực tiếp bên trái & Phòng điều khiển vào ván + tin cộng đồng bên phải',
      render: ({ D, state, fullPickSummary, renderSearchingBanner, renderCodeForm }) => {
        const match = D.MATCHES[state.activeMatchId] || D.MATCHES.V8Q;
        const step = Math.min(state.moveStep, match.moves.length);
        return `<div class="tv-studio">
          <header class="tv-ticker-bar">
            <div class="tv-ticker-left">
              <span class="tv-live-pill"><i aria-hidden="true"></i> TRỰC TIẾP</span>
              <span class="tv-ticker-brand">PLAY3CR TV</span>
              <span class="tv-ticker-copy">Cúp Cuối Tuần 20:30 · ${match.black.name} vs ${match.white.name} (${match.viewers} khán giả)</span>
            </div>
            <nav class="tv-nav" aria-label="Kênh Play3CR">
              ${renderNavLinks(D.NAV_SECTIONS.filter((s) => s.id !== 'home'), 'tv-nav-link')}
            </nav>
            <button type="button" class="tv-user-btn" data-action="profile">${D.PLAYER.name} · ${D.PLAYER.elo}</button>
          </header>

          <main class="tv-split-stage">
            <section class="tv-monitor" aria-label="Màn hình phát sóng trực tiếp">
              <div class="tv-channels" role="tablist" aria-label="Chọn kênh bàn cờ">
                ${['V8Q', 'K7M', 'N4X'].map((id, i) => `
                  <button type="button" role="tab" aria-selected="${state.activeMatchId === id}" class="tv-ch-btn ${state.activeMatchId === id ? 'is-on' : ''}" data-match-switch="${id}">
                    <span>KÊNH 0${i + 1}</span>
                    <strong>#${id} · ${D.MATCHES[id].black.name}</strong>
                  </button>
                `).join('')}
              </div>

              <div class="tv-monitor-body">
                <div class="tv-board-col">
                  <div class="tv-player-strip">
                    <span>● <strong>${match.black.name}</strong> (${match.black.elo})</span>
                    <span class="tv-clock-pill">${match.clockBlack}</span>
                  </div>
                  <div class="tv-board-box">
                    ${D.renderBoardSVG({ theme: 'broadcast', matchId: match.id, moveLimit: step, showCoords: true, showMoveNums: false, showThreat: true })}
                  </div>
                  <div class="tv-player-strip">
                    <span>○ <strong>${match.white.name}</strong> (${match.white.elo})</span>
                    <span class="tv-clock-pill">${match.clockWhite}</span>
                  </div>
                </div>

                <aside class="tv-feed-col">
                  <div class="tv-feed-head">
                    <strong>BÌNH LUẬN TRỰC TIẾP</strong>
                    <span>${match.rule}</span>
                  </div>
                  <p class="tv-commentary">${match.note}</p>
                  <div class="tv-chat-log" aria-label="Nhật ký bình luận giả lập">
                    <div><b>Minh Anh:</b> Nước Cổng này bẻ hướng hay quá!</div>
                    <div><b>Bảo Long:</b> Trắng còn 29s, dễ hở song tam.</div>
                    <div><b>Bình luận viên:</b> Bấm ‹ › bên dưới để tua nước đi.</div>
                  </div>
                  ${renderMatchScrubber(match.id, step, match.moves.length)}
                  <button type="button" class="tv-watch-cta" data-action="room-${match.id}">Mở phòng phát sóng #${match.id} ↗</button>
                </aside>
              </div>
            </section>

            <section class="tv-control-desk" aria-label="Khu vực chơi và cộng đồng">
              <div class="tv-desk-play">
                <span class="tv-desk-kicker">${D.STATS.online} NGƯỜI ONLINE · ${D.STATS.playing} VÁN ĐANG PHÁT</span>
                <h1 class="tv-desk-h1">Lên sóng ván của bạn.</h1>

                <div class="tv-pill-matrix">
                  <div class="tv-pill-row">
                    ${D.RULES.map((r) => `<button type="button" class="tv-pill ${state.rule === r.id ? 'is-on' : ''}" data-set-rule="${r.id}">${r.short}</button>`).join('')}
                    <button type="button" class="tv-pill ${state.wall ? 'is-on' : ''}" data-toggle-wall>+ Ô khoá</button>
                    <button type="button" class="tv-pill ${state.portal ? 'is-on' : ''}" data-toggle-portal>+ Cổng</button>
                  </div>
                  <div class="tv-pill-row">
                    ${D.CLOCKS.slice(0, 4).map((c) => `<button type="button" class="tv-pill ${state.clock === c.id ? 'is-on' : ''}" data-set-clock="${c.id}">${c.short}</button>`).join('')}
                    <button type="button" class="tv-pill ${state.rated ? 'is-on' : ''}" data-set-rated="true">Xếp hạng</button>
                  </div>
                </div>

                ${renderSearchingBanner()}

                <div class="tv-cta-group">
                  <button type="button" class="tv-btn-crimson" data-action="play">Chơi nhanh ngay (${fullPickSummary()})</button>
                  <div class="tv-cta-sub">
                    <button type="button" class="tv-btn-ink" data-action="create-room">Tạo phòng riêng</button>
                    <button type="button" class="tv-btn-ink" data-action="challenge">Thách đấu bạn</button>
                  </div>
                </div>

                <div class="tv-code-box">
                  ${renderCodeForm({ label: 'Vào bàn theo mã phát sóng', btnLabel: 'Vào bàn', cls: 'tv-code' })}
                </div>
              </div>

              <div class="tv-community-feed">
                <h2>Cộng đồng hôm nay</h2>
                <button type="button" class="tv-feed-row" data-action="learn">
                  <span class="tv-tag-cat">PUZZLE</span>
                  <span><strong>${D.EXTRA_DATA.puzzle.id} ${D.EXTRA_DATA.puzzle.title}</strong><small>${D.EXTRA_DATA.puzzle.solved} kỳ thủ đã giải</small></span>
                </button>
                <button type="button" class="tv-feed-row" data-action="forum">
                  <span class="tv-tag-cat">DIỄN ĐÀN</span>
                  <span><strong>${D.EXTRA_DATA.forum[0].title}</strong><small>${D.EXTRA_DATA.forum[0].replies} bình luận mới</small></span>
                </button>
                <button type="button" class="tv-feed-row" data-action="nav-rooms">
                  <span class="tv-tag-cat">BÀN MỞ</span>
                  <span><strong>${state.rooms[0].name} (#${state.rooms[0].code})</strong><small>${state.rooms[0].host} · ${state.rooms[0].clock}</small></span>
                </button>
              </div>
            </section>
          </main>
        </div>`;
      },
    },
  ];

  window.Play3CRRuntime.registerDesigns(DESIGNS);
})();
