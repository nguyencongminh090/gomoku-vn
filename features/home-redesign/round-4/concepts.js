'use strict';

/**
 * Play3CR Round 4 — Three Art-Directed Concepts:
 *   A. the-living-board         (Tactile sunlit wooden Go/Caro table + stone tray)
 *   B. the-social-playground    (Warm lively community club + custom illustrations + 1-move puzzle)
 *   C. the-signature-experience (Portal & Wall decisive moment + Paper/Lacquer morph)
 */
(() => {
  const D = window.Play3CR4Data;

  function renderSearchingPill(state, formatTime) {
    if (!state.searching) return '';
    return `<div class="r4-search-pill" role="status" aria-live="polite">
      <span class="r4-search-dot" aria-hidden="true"></span>
      <span>Đang tìm đối thủ (mô phỏng) · <strong>${formatTime(state.searchElapsed)}</strong></span>
      <button type="button" class="r4-sp-btn" data-action="simulate-found">Vào trận mẫu</button>
      <button type="button" class="r4-sp-btn" data-action="cancel-search">Huỷ</button>
    </div>`;
  }

  function renderLivingBoardZone(D, state) {
    const win = D.findFive(state.livingStones);
    const canWinL12 = D.isLivingL12Winning(state.livingStones, state.livingTurn);
    const turnText = win
      ? `${win.side === 'B' ? 'Đen' : 'Trắng'} vừa nối đủ ${win.line.length} quân (đã khoá bàn thử) — Xếp lại hoặc Chơi ngay.`
      : canWinL12
        ? 'Lượt Đen — chạm ô sáng L12 hoặc giao điểm bất kỳ.'
        : `Lượt ${state.livingTurn === 'B' ? 'Đen' : 'Trắng'}${state.livingLastCoord ? ` (vừa đặt ${state.livingLastCoord})` : ''} — chạm vào mặt bàn để đi tiếp.`;

    return `<section class="lv-board-zone" aria-label="Bàn cờ gỗ tương tác">
      <div class="lv-board-wrap">
        ${D.renderLivingBoard(state.livingStones, state.livingTurn, { highlightHint: true, winInfo: win })}
      </div>
      <div class="lv-board-caption${win ? ' is-won' : ''}">
        <span>${turnText}</span>
        <button type="button" class="lv-reset-link" data-reset-board>Xếp lại bàn</button>
      </div>
    </section>`;
  }

  function renderLivingScaffold({ topHtml, kickerHtml, controlsHtml, roomHtml, D, state, formatTime }) {
    return `<div class="lv-page">
      <div class="lv-backdrop" aria-hidden="true"></div>
      ${topHtml}
      <main class="lv-scene">
        <section class="lv-story" aria-label="Khu vực khởi trận">
          <div class="lv-copy">
            ${kickerHtml}
            <h1 class="lv-h1">Đặt một nước.<br>Bước vào ván.</h1>
            <p class="lv-sub">Chạm thẳng lên bàn cờ để thử nước chốt 5 quân, hoặc ngồi vào bàn thật chỉ với một chạm.</p>
          </div>
          ${renderSearchingPill(state, formatTime)}
          ${controlsHtml}
          ${roomHtml}
        </section>
        ${renderLivingBoardZone(D, state)}
      </main>
    </div>`;
  }

  const CONCEPTS = [
    // =========================================================================
    // HƯỚNG A0 — BẢN GỐC ROUND 4.0 (GIỮ ĐỐI CHIẾU)
    // =========================================================================
    {
      id: 'the-living-board',
      code: 'A0',
      label: 'Hướng A0 · Gốc 4.0',
      accent: '#B8332A',
      hook: 'Bản Round 4.0 gốc (giữ nguyên để đối chiếu với 3 phương án thiết kế lại 5 vùng)',
      render: ({ D, state, shortConfigLabel, formatTime }) => renderLivingScaffold({
        D,
        state,
        formatTime,
        topHtml: `<header class="lv-top">
          <div class="lv-brand">
            <img src="assets/logo-mark.svg" alt="" width="28" height="28">
            <span>Play3CR</span>
            <span class="lv-online-tag"><i aria-hidden="true"></i> ${D.STATS.online} đang chơi</span>
          </div>
          <nav class="lv-nav" aria-label="Điều hướng">
            <button type="button" class="lv-nav-link" data-action="nav-rooms">Phòng chơi</button>
            <button type="button" class="lv-nav-link" data-action="nav-ranking">Xếp hạng</button>
            <button type="button" class="lv-nav-link" data-action="nav-learn">Puzzle</button>
            <button type="button" class="lv-menu-btn" data-action="menu">Menu · ${D.PLAYER.name}</button>
          </nav>
        </header>`,
        kickerHtml: `<p class="lv-kicker">BÀN CỜ GỖ HINOKI · 15×15</p>`,
        controlsHtml: `<div class="lv-tray" aria-label="Khay điều khiển vào ván">
          <div class="lv-tray-primary">
            <button type="button" class="lv-play-btn" data-action="play">
              <span>Chơi ngay</span>
              <small>${shortConfigLabel()}</small>
            </button>
            <button type="button" class="lv-gear-btn" data-action="settings" aria-label="Tuỳ chỉnh luật và đồng hồ" title="Tuỳ chỉnh luật &amp; đồng hồ">
              ⚙ Luật
            </button>
          </div>
          <div class="lv-tray-secondary">
            <button type="button" class="lv-sec-btn" data-action="room-hub">+ Tạo bàn</button>
            <form class="lv-code-form" data-quick-code novalidate autocomplete="off">
              <span class="lv-hash" aria-hidden="true">#</span>
              <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
              <button type="submit">Vào</button>
            </form>
          </div>
        </div>`,
        roomHtml: `<div class="lv-live-whisper">
          <span>Bàn đang mở:</span>
          <button type="button" data-action="room-K7M">#K7M Bàn tre (${state.rooms[0]?.host || 'Minh Anh'}) ↗</button>
        </div>`,
      }),
    },

    // =========================================================================
    // HƯỚNG A1 — TRIỆN MỘC & ĐÔI CHÉN (Tách rời quân cờ, không hộp đen SaaS)
    // =========================================================================
    {
      id: 'living-v1-triad',
      code: 'A1',
      label: 'Hướng A1 · Triện Mộc',
      accent: '#9E3929',
      hook: 'Bỏ hộp chữ nhật tối; nút sơn mài có quân cờ & gạch Luật rời, triện mộc đỏ và thẻ ghép cặp ● vs ○',
      render: ({ D, state, shortConfigLabel, formatTime }) => renderLivingScaffold({
        D,
        state,
        formatTime,
        topHtml: `<header class="lv1-top">
          <div class="lv1-brand">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="30" height="30" rx="6" fill="#FAF2E3" stroke="#C6A677" stroke-width="1"/>
              <path d="M9 5v22M16 5v22M23 5v22M5 9h22M5 16h22M5 23h22" stroke="#9B7E57" stroke-opacity="0.45" stroke-width="0.9"/>
              <circle cx="9" cy="23" r="3.2" fill="#231911"/>
              <circle cx="16" cy="16" r="3.2" fill="#231911"/>
              <circle cx="23" cy="9" r="3.4" fill="#A63A2B"/>
            </svg>
            <div class="lv1-brand-text">
              <strong>Play3CR</strong>
              <small>Kỳ đài Caro · ${D.STATS.online} đang chơi</small>
            </div>
          </div>
          <nav class="lv1-nav" aria-label="Điều hướng">
            <div class="lv1-nav-ribbon">
              <button type="button" data-action="nav-rooms">Phòng chơi</button>
              <span aria-hidden="true">·</span>
              <button type="button" data-action="nav-ranking">Xếp hạng</button>
              <span aria-hidden="true">·</span>
              <button type="button" data-action="nav-learn">Puzzle</button>
            </div>
            <button type="button" class="lv1-user-seal" data-action="menu">
              <span class="lv1-coin" aria-hidden="true">${D.PLAYER.name[0]}</span>
              <span class="lv1-user-info"><strong>${D.PLAYER.name}</strong><small>Menu ≡</small></span>
            </button>
          </nav>
        </header>`,
        kickerHtml: `<div class="lv1-kicker-row">
          <span class="lv1-stamp" aria-hidden="true">五子</span>
          <div class="lv1-kicker-text">
            <strong>GỖ HINOKI TỰ NHIÊN</strong>
            <span>Bàn tiêu chuẩn 15×15 đường</span>
          </div>
        </div>`,
        controlsHtml: `<div class="lv1-controls" aria-label="Cụm điều khiển ván đấu">
          <div class="lv1-primary-split">
            <button type="button" class="lv1-play-plinth" data-action="play">
              <span class="lv1-stone-black" aria-hidden="true"></span>
              <span class="lv1-play-copy">
                <strong>Chơi ngay</strong>
                <small>${shortConfigLabel()}</small>
              </span>
              <span class="lv1-play-go" aria-hidden="true">→</span>
            </button>
            <button type="button" class="lv1-law-tile" data-action="settings" aria-label="Tuỳ chỉnh luật và đồng hồ">
              <span class="lv1-law-ico" aria-hidden="true">⚙</span>
              <span>Luật</span>
            </button>
          </div>
          <div class="lv1-secondary-bar">
            <button type="button" class="lv1-create-pill" data-action="room-hub">
              <span class="lv1-stone-white" aria-hidden="true"></span>
              <span>+ Tạo phòng</span>
            </button>
            <form class="lv1-code-slot" data-quick-code novalidate autocomplete="off">
              <span class="lv1-hash" aria-hidden="true">#</span>
              <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
              <button type="submit">Vào bàn</button>
            </form>
          </div>
        </div>`,
        roomHtml: `<button type="button" class="lv1-match-slip" data-action="room-K7M">
          <span class="lv1-slip-code">#K7M</span>
          <span class="lv1-slip-versus">
            <i class="lv1-dot-b" aria-hidden="true"></i>
            <span>${state.rooms[0]?.host || 'Minh Anh'}</span>
            <small>đợi</small>
            <i class="lv1-dot-w" aria-hidden="true"></i>
            <span>Ghế Trắng</span>
          </span>
          <span class="lv1-slip-cta" aria-hidden="true">Ngồi vào ↗</span>
        </button>`,
      }),
    },

    // =========================================================================
    // HƯỚNG A2 — LỆCH TRỤC & PHÍM ĐÁ (Ma trận bất đối xứng 2 cột cao–thấp)
    // =========================================================================
    {
      id: 'living-v2-dial',
      code: 'A2',
      label: 'Hướng A2 · Lệch Trục',
      accent: '#2B2118',
      hook: 'Cụm điều khiển lưới bất đối xứng (Chơi ngay cao 2 tầng bên trái, 2 tầng phím phải), logo 5 quân & bàn cờ mini',
      render: ({ D, state, shortConfigLabel, formatTime }) => renderLivingScaffold({
        D,
        state,
        formatTime,
        topHtml: `<header class="lv2-top">
          <div class="lv2-brand">
            <svg width="36" height="22" viewBox="0 0 36 22" fill="none" aria-hidden="true">
              <line x1="3" y1="18" x2="33" y2="4" stroke="#9C7B50" stroke-width="1.2" stroke-dasharray="2 2"/>
              <circle cx="5" cy="17" r="3" fill="#231911"/>
              <circle cx="11.5" cy="14" r="3" fill="#231911"/>
              <circle cx="18" cy="11" r="3.3" fill="#A63A2B"/>
              <circle cx="24.5" cy="8" r="3" fill="#231911"/>
              <circle cx="31" cy="5" r="3" fill="#231911"/>
            </svg>
            <strong>Play3CR</strong>
            <span class="lv2-live-num">${D.STATS.online} online</span>
          </div>
          <nav class="lv2-nav" aria-label="Điều hướng">
            <div class="lv2-rail">
              <button type="button" data-action="nav-rooms">Phòng chơi</button>
              <button type="button" data-action="nav-ranking">Xếp hạng</button>
              <button type="button" data-action="nav-learn">Puzzle</button>
            </div>
            <button type="button" class="lv2-menu-key" data-action="menu">≡ Menu · ${D.PLAYER.name}</button>
          </nav>
        </header>`,
        kickerHtml: `<div class="lv2-specimen">
          <span class="lv2-spec-tag">15×15</span>
          <span class="lv2-spec-name">Mặt bàn gỗ Hinoki nguyên tấm</span>
        </div>`,
        controlsHtml: `<div class="lv2-matrix" aria-label="Ma trận điều khiển ván đấu">
          <button type="button" class="lv2-hero-card" data-action="play">
            <span class="lv2-hero-head">
              <span class="lv2-hero-tag">● GHÉP TRẬN</span>
              <span class="lv2-hero-arrow" aria-hidden="true">↗</span>
            </span>
            <strong>Chơi ngay</strong>
            <small>${shortConfigLabel()}</small>
          </button>
          <div class="lv2-right-stack">
            <div class="lv2-utility-pair">
              <button type="button" class="lv2-util-key" data-action="settings">⚙ Luật</button>
              <button type="button" class="lv2-util-key" data-action="room-hub">+ Tạo bàn</button>
            </div>
            <form class="lv2-code-box" data-quick-code novalidate autocomplete="off">
              <span class="lv2-code-lbl" aria-hidden="true">#</span>
              <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
              <button type="submit">Vào</button>
            </form>
          </div>
        </div>`,
        roomHtml: `<button type="button" class="lv2-room-invite" data-action="room-K7M">
          <svg class="lv2-mini-grid" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect x="0.75" y="0.75" width="26.5" height="26.5" rx="4" fill="#E9C98E" stroke="#AA824C" stroke-width="1"/>
            <path d="M6 5v18M11 5v18M17 5v18M22 5v18M5 6h18M5 11h18M5 17h18M5 22h18" stroke="#6E522E" stroke-opacity="0.45" stroke-width="0.8"/>
            <circle cx="11" cy="11" r="2.2" fill="#1C150F"/>
            <circle cx="17" cy="11" r="2.2" fill="#FAF6EC" stroke="#B7A991" stroke-width="0.5"/>
            <circle cx="11" cy="17" r="2.2" fill="#FAF6EC" stroke="#B7A991" stroke-width="0.5"/>
            <circle cx="17" cy="17" r="2.2" fill="#1C150F"/>
            <circle cx="22" cy="11" r="2.2" fill="#A63A2B"/>
          </svg>
          <div class="lv2-invite-body">
            <strong>#K7M · ${state.rooms[0]?.name || 'Bàn tre cuối tuần'}</strong>
            <small>${state.rooms[0]?.host || 'Minh Anh'} (${state.rooms[0]?.elo || 1620} Elo) đang mở bàn</small>
          </div>
          <span class="lv2-invite-btn" aria-hidden="true">Vào đấu →</span>
        </button>`,
      }),
    },

    // =========================================================================
    // HƯỚNG A3 — VÒNG CỜ & SỔ TAY (Viên nang 2 tông tròn + Dòng sổ tay mở)
    // =========================================================================
    {
      id: 'living-v3-atelier',
      code: 'A3',
      label: 'Hướng A3 · Vòng Cờ',
      accent: '#7D3525',
      hook: 'Thanh viên nang tròn 2 nửa Đen–Trắng ghép Chơi ngay & Luật, hàng sổ tay mở và khối trích dẫn ván chờ',
      render: ({ D, state, shortConfigLabel, formatTime }) => renderLivingScaffold({
        D,
        state,
        formatTime,
        topHtml: `<header class="lv3-top">
          <div class="lv3-brand">
            <svg width="32" height="26" viewBox="0 0 32 26" fill="none" aria-hidden="true">
              <path d="M16 2v22M3 13h26" stroke="#8F714B" stroke-opacity="0.55" stroke-width="1"/>
              <circle cx="12" cy="13" r="6.5" fill="#231911"/>
              <circle cx="21" cy="13" r="6.5" fill="#FAF6EE" stroke="#BDA682" stroke-width="1.1"/>
              <circle cx="12" cy="13" r="2" fill="none" stroke="#E4C18A" stroke-width="1.1"/>
            </svg>
            <div class="lv3-brand-stack">
              <strong>Play3CR</strong>
              <span>VIỆT NAM · ${D.STATS.online} KỲ THỦ</span>
            </div>
          </div>
          <nav class="lv3-nav" aria-label="Điều hướng">
            <div class="lv3-slash-links">
              <button type="button" data-action="nav-rooms">Phòng chơi</button>
              <span aria-hidden="true">/</span>
              <button type="button" data-action="nav-ranking">Xếp hạng</button>
              <span aria-hidden="true">/</span>
              <button type="button" data-action="nav-learn">Puzzle</button>
            </div>
            <button type="button" class="lv3-menu-capsule" data-action="menu">
              <i aria-hidden="true">${D.PLAYER.name[0]}</i>
              <span>Menu · ${D.PLAYER.name}</span>
            </button>
          </nav>
        </header>`,
        kickerHtml: `<div class="lv3-sig-line">
          <span class="lv3-sig-num">Nº 15×15</span>
          <span class="lv3-sig-rule" aria-hidden="true"></span>
          <span class="lv3-sig-title">Bàn cờ gỗ Hinoki thủ công</span>
        </div>`,
        controlsHtml: `<div class="lv3-command" aria-label="Thanh vào ván">
          <div class="lv3-capsule">
            <button type="button" class="lv3-cap-play" data-action="play">
              <span class="lv3-cap-disc" aria-hidden="true">●</span>
              <span class="lv3-cap-text">
                <strong>Chơi ngay</strong>
                <small>${shortConfigLabel()}</small>
              </span>
            </button>
            <button type="button" class="lv3-cap-law" data-action="settings" aria-label="Tuỳ chỉnh luật và đồng hồ">
              <span>⚙ Luật</span>
            </button>
          </div>
          <div class="lv3-ledger-row">
            <button type="button" class="lv3-open-btn" data-action="room-hub">+ Tạo bàn mới</button>
            <span class="lv3-ledger-sep" aria-hidden="true"></span>
            <form class="lv3-inline-code" data-quick-code novalidate autocomplete="off">
              <span class="lv3-code-word">Mã</span>
              <span class="lv3-hash" aria-hidden="true">#</span>
              <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
              <button type="submit">Vào ↗</button>
            </form>
          </div>
        </div>`,
        roomHtml: `<button type="button" class="lv3-callout" data-action="room-K7M">
          <div class="lv3-callout-meta">
            <span>ĐANG MỞ GHẾ TRẮNG</span>
            <strong>#K7M · 45s/nước</strong>
          </div>
          <div class="lv3-callout-main">
            <span>Bàn tre của <b>${state.rooms[0]?.host || 'Minh Anh'}</b> (${state.rooms[0]?.elo || 1620} Elo)</span>
            <span class="lv3-callout-go" aria-hidden="true">Nhận ván →</span>
          </div>
        </button>`,
      }),
    },

    // =========================================================================
    // HƯỚNG A4 — NHỊP THỞ EDITORIAL (Organic Minimalism, không đóng hộp)
    // =========================================================================
    {
      id: 'living-v4-shiori',
      code: 'A4',
      label: 'Hướng A4 · Nhịp Thở',
      accent: '#261C14',
      hook: 'Không hộp bao, không mảng đỏ lớn: nút Chơi ngay mun trầm vừa vặn, luật & mời bạn bằng nét gạch mảnh tự nhiên',
      render: ({ D, state, shortConfigLabel, formatTime }) => renderLivingScaffold({
        D,
        state,
        formatTime,
        topHtml: `<header class="lv4-top">
          <div class="lv4-brand">
            <span class="lv4-duo" aria-hidden="true"><i class="lv4-s-b"></i><i class="lv4-s-w"></i></span>
            <strong>Play3CR</strong>
            <span class="lv4-online-note">· <em>${D.STATS.online} người trên sảnh</em></span>
          </div>
          <nav class="lv4-nav" aria-label="Điều hướng">
            <button type="button" data-action="nav-rooms">Phòng chơi</button>
            <button type="button" data-action="nav-ranking">Xếp hạng</button>
            <button type="button" data-action="nav-learn">Puzzle</button>
            <button type="button" class="lv4-menu-link" data-action="menu"><i aria-hidden="true"></i>Menu · ${D.PLAYER.name}</button>
          </nav>
        </header>`,
        kickerHtml: `<p class="lv4-kicker"><i>Gỗ Hinoki tự nhiên</i> <span>·</span> Bàn 15×15</p>`,
        controlsHtml: `<div class="lv4-flow" aria-label="Điều khiển vào ván">
          <div class="lv4-primary-line">
            <button type="button" class="lv4-play-btn" data-action="play">
              <i aria-hidden="true"></i>
              <span>Chơi ngay</span>
              <span class="lv4-arr" aria-hidden="true">→</span>
            </button>
            <div class="lv4-rule-inline">
              <span>${shortConfigLabel()}</span>
              <button type="button" data-action="settings">⚙ Tuỳ chỉnh</button>
            </div>
          </div>

          <div class="lv4-friend-zone">
            <button type="button" class="lv4-create-link" data-action="room-hub">+ Mở bàn riêng</button>
            <span class="lv4-or">hoặc nhập mã</span>
            <form class="lv4-code-inline" data-quick-code novalidate autocomplete="off">
              <span class="lv4-hash" aria-hidden="true">#</span>
              <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
              <button type="submit">Vào →</button>
            </form>
          </div>
        </div>`,
        roomHtml: `<button type="button" class="lv4-invitation" data-action="room-K7M">
          <span class="lv4-inv-stones" aria-hidden="true"><i></i><i></i></span>
          <span class="lv4-inv-text"><b>${state.rooms[0]?.host || 'Minh Anh'}</b> đang đợi người ngồi đối diện tại Bàn tre <code>#K7M</code></span>
          <span class="lv4-inv-go" aria-hidden="true">Ngồi vào bàn ↗</span>
        </button>`,
      }),
    },

    // =========================================================================
    // HƯỚNG A5 — BÀN TRÀ WASHI LEDGER (Sổ tay giấy mỏng 2 vế theo mục đích)
    // =========================================================================
    {
      id: 'living-v5-tokonoma',
      code: 'A5',
      label: 'Hướng A5 · Bàn Trà',
      accent: '#A63D2D',
      hook: 'Tờ giấy Washi mỏng chia 2 vế mục đích (Ghép ván / Mời bạn) ngăn bằng chỉ dọc, thanh gạch điều hướng mảnh',
      render: ({ D, state, shortConfigLabel, formatTime }) => renderLivingScaffold({
        D,
        state,
        formatTime,
        topHtml: `<header class="lv5-top">
          <div class="lv5-brand">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <path d="M5 19V5h14" stroke="#6E5233" stroke-width="1.35" stroke-linecap="round"/>
              <circle cx="14.5" cy="14.5" r="5.5" fill="#261C14"/>
              <circle cx="12.7" cy="12.6" r="1.4" fill="#FAF2E3" fill-opacity="0.28"/>
            </svg>
            <strong>Play3CR</strong>
            <span class="lv5-brand-sep" aria-hidden="true"></span>
            <span class="lv5-brand-sub">Kỳ đài trực tuyến · ${D.STATS.online}</span>
          </div>
          <nav class="lv5-nav" aria-label="Điều hướng">
            <div class="lv5-nav-links">
              <button type="button" data-action="nav-rooms">Phòng chơi</button>
              <button type="button" data-action="nav-ranking">Xếp hạng</button>
              <button type="button" data-action="nav-learn">Puzzle</button>
            </div>
            <button type="button" class="lv5-menu-btn" data-action="menu">Menu · ${D.PLAYER.name}</button>
          </nav>
        </header>`,
        kickerHtml: `<p class="lv5-kicker">· Mặt bàn gỗ Hinoki · 15×15 ·</p>`,
        controlsHtml: `<div class="lv5-washi-ledger" aria-label="Sổ chọn vào ván">
          <div class="lv5-col-match">
            <button type="button" class="lv5-play-btn" data-action="play">
              <span>Chơi ngay</span>
              <span aria-hidden="true">↗</span>
            </button>
            <div class="lv5-match-meta">
              <span>${shortConfigLabel()}</span>
              <button type="button" data-action="settings">⚙ Luật</button>
            </div>
          </div>

          <span class="lv5-v-rule" aria-hidden="true"></span>

          <div class="lv5-col-friend">
            <button type="button" class="lv5-friend-create" data-action="room-hub">+ Tạo phòng mời bạn</button>
            <form class="lv5-friend-code" data-quick-code novalidate autocomplete="off">
              <span class="lv5-code-lbl">Mã:</span>
              <span class="lv5-hash" aria-hidden="true">#</span>
              <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
              <button type="submit">Vào</button>
            </form>
          </div>
        </div>`,
        roomHtml: `<button type="button" class="lv5-invitation" data-action="room-K7M">
          <span class="lv5-inv-dash" aria-hidden="true">—</span>
          <span class="lv5-inv-body">Bàn tre <b>#K7M</b> đang mở ghế Trắng chờ bạn (${state.rooms[0]?.host || 'Minh Anh'}, ${state.rooms[0]?.elo || 1620} Elo)</span>
          <span class="lv5-inv-cta" aria-hidden="true">Vào bàn →</span>
        </button>`,
      }),
    },

    // =========================================================================
    // HƯỚNG A6 — BẢN HỢP NHẤT (Cấu trúc 2 vế A5 × Nhịp thở A4 & Phân tách Header)
    // =========================================================================
    {
      id: 'living-v6-master',
      code: 'A6',
      label: 'Hướng A6 · Bản Hợp Nhất',
      accent: '#231911',
      hook: 'Hợp nhất cấu trúc 2 vế của A5 với khoảng thở A4; tách riêng Điều hướng & Tài khoản, hiển thị cấu hình rõ ràng và nhãn dữ liệu mẫu',
      render: ({ D, state, shortConfigLabel, formatTime }) => {
        const isGuest = state.authMode === 'guest';
        const room = state.rooms[0] || { host: 'Minh Anh', elo: 1620, clock: '45s/nước' };
        const hostInitials = String(room.host || 'MA')
          .trim()
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        return renderLivingScaffold({
          D,
          state,
          formatTime,
          topHtml: `<header class="lv6-top">
            <div class="lv6-brand">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect x="1.5" y="1.5" width="25" height="25" rx="5" fill="#F8EEDB" stroke="#A6875B" stroke-width="1"/>
                <path d="M9.5 4.5v19M18.5 4.5v19M4.5 9.5h19M4.5 18.5h19" stroke="#856842" stroke-opacity="0.55" stroke-width="0.95"/>
                <circle cx="9.5" cy="9.5" r="1.4" fill="#5C4426"/>
                <line x1="9.5" y1="18.5" x2="18.5" y2="9.5" stroke="#9E3929" stroke-width="1.3" stroke-linecap="round"/>
                <circle cx="9.5" cy="18.5" r="3.4" fill="#231911"/>
                <circle cx="18.5" cy="9.5" r="3.4" fill="#FFFDF8" stroke="#6E5233" stroke-width="1"/>
              </svg>
              <strong>Play<span>3CR</span></strong>
              <span class="lv6-sample-pill" data-sample-badge="online" title="Số liệu mẫu trong mockup"><i aria-hidden="true"></i>Mẫu · ${D.STATS.online} trên sảnh</span>
            </div>
            <div class="lv6-right">
              <nav class="lv6-nav" aria-label="Điều hướng chính">
                <button type="button" data-action="nav-rooms">Phòng chơi</button>
                <button type="button" data-action="nav-ranking">Xếp hạng</button>
                <button type="button" data-action="nav-learn">Puzzle</button>
              </nav>
              <button type="button" class="lv6-mob-menu-btn" data-action="menu" aria-label="Mở menu điều hướng">
                <span aria-hidden="true">☰</span>
                <span>Menu</span>
              </button>
              <div class="lv6-acct-wrap">
                ${isGuest
                  ? `<span class="lv6-guest-tag">Khách</span>
                     <button type="button" class="lv6-login-btn" data-action="acct-login">Đăng nhập</button>`
                  : `<button type="button" class="lv6-acct-btn" data-action="acct-toggle" aria-haspopup="menu" aria-expanded="${Boolean(state.accountMenuOpen)}">
                       <span class="lv6-avatar" aria-hidden="true">${D.PLAYER.name[0]}</span>
                       <span class="lv6-acct-name">${D.PLAYER.name}</span>
                       <span class="lv6-caret" aria-hidden="true">▾</span>
                     </button>
                     <div id="lv6-acct-menu" class="lv6-acct-menu" role="menu"${state.accountMenuOpen ? '' : ' hidden'}>
                       <div class="lv6-acct-head">
                         <strong>${D.PLAYER.name}</strong>
                         <small>Caro VN ${D.PLAYER.elo} · Hạng #${D.PLAYER.rank} · <em>Dữ liệu mẫu</em></small>
                       </div>
                       <button type="button" role="menuitem" data-action="acct-profile">Hồ sơ cá nhân</button>
                       <button type="button" role="menuitem" data-action="acct-social">Bạn bè &amp; tin nhắn</button>
                       <button type="button" role="menuitem" data-action="acct-sound">Âm thanh đặt quân: <b>${state.soundOn ? 'Bật' : 'Tắt'}</b></button>
                       <hr class="lv6-acct-hr">
                       <button type="button" role="menuitem" class="lv6-acct-logout" data-action="acct-logout">Đăng xuất</button>
                     </div>`}
              </div>
            </div>
          </header>`,
          kickerHtml: `<p class="lv6-kicker"><span class="lv6-kicker-dot" aria-hidden="true"></span><span>Mặt bàn gỗ Hinoki · 15×15 chuẩn Play3CR</span></p>`,
          controlsHtml: `<div class="lv6-ledger" aria-label="Bảng chọn cách vào ván">
            <div class="lv6-zone-match">
              <span class="lv6-zone-lbl">Ghép trận ngẫu nhiên</span>
              <button type="button" class="lv6-play-cta" data-action="play">
                <span class="lv6-cta-stone" aria-hidden="true"></span>
                <span class="lv6-cta-text">
                  <strong>Chơi ngay</strong>
                  <small>Tìm đối thủ · ${state.rated ? 'Xếp hạng' : 'Giao hữu'}</small>
                </span>
                <span class="lv6-cta-arr" aria-hidden="true">→</span>
              </button>
              <div class="lv6-config-bar" role="group" aria-label="Cấu hình luật hiện tại">
                <span class="lv6-cfg-lbl">Đang chọn:</span>
                <strong class="lv6-cfg-current">${shortConfigLabel()}</strong>
                <button type="button" class="lv6-cfg-edit" data-action="settings">Đổi luật ▾</button>
              </div>
            </div>

            <span class="lv6-divider" aria-hidden="true"></span>

            <div class="lv6-zone-friend">
              <span class="lv6-zone-lbl">Chơi cùng bạn</span>
              <button type="button" class="lv6-create-btn" data-action="room-hub">
                <i aria-hidden="true"></i>
                <span>+ Tạo phòng mời bạn</span>
                <span class="lv6-create-arr" aria-hidden="true">↗</span>
              </button>
              <form class="lv6-code-form" data-quick-code novalidate autocomplete="off">
                <label class="lv6-code-lbl" for="lv6-code-in">Mã bàn:</label>
                <div class="lv6-code-field">
                  <span class="lv6-hash" aria-hidden="true">#</span>
                  <input id="lv6-code-in" name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
                  <button type="submit">Vào bàn →</button>
                </div>
              </form>
            </div>
          </div>`,
          roomHtml: `<button type="button" class="lv6-room-invite" data-action="room-K7M">
            <span class="lv6-inv-avatar" aria-hidden="true">${hostInitials}</span>
            <span class="lv6-inv-main"><strong>${room.host}</strong> <span>(${room.elo}) đang chờ ghế Trắng tại</span> <b>Bàn tre #K7M</b> <small>${room.clock} · <em data-sample-badge="room">Mẫu</em></small></span>
            <span class="lv6-inv-cta" aria-hidden="true">Vào bàn →</span>
          </button>`,
        });
      },
    },

    // =========================================================================
    // HƯỚNG A7 — NƯỚC CỜ ĐẦU TIÊN (THE FIRST STONE — ĐỒNG BỘ CHẤT LIỆU HINOKI)
    // =========================================================================
    {
      id: 'living-v7-first-stone',
      code: 'A7',
      label: 'Hướng A7 · Nước Cờ Đầu Tiên',
      accent: '#8E2E20',
      hook: 'The First Stone: Một CTA chính Chơi ngay nổi khối, dòng cấu hình chữ súc tích, dải Tạo phòng / Nhập mã nhẹ nhàng không đóng card đôi, phòng Minh Anh phân cấp rõ',
      render: ({ D, state, formatTime }) => {
        const isGuest = state.authMode === 'guest';
        const room = state.rooms[0] || { host: 'Minh Anh', elo: 1620, rule: 'Luật 1, Ô khoá', clock: '45s/nước' };
        const ruleShort = D.RULES.find((r) => r.id === state.rule)?.short || 'Luật 1';
        const clockShort = D.CLOCKS.find((c) => c.id === state.clock)?.short || 'Tự động';
        const roomRuleText = String(room.rule || 'Luật 1, Ô khoá').replace(/\s*·\s*/g, ', ');
        const ruleParts = [ruleShort];
        if (state.wall) ruleParts.push('Ô khoá');
        if (state.portal) ruleParts.push('Cổng');
        ruleParts.push(clockShort, state.rated ? 'Xếp hạng' : 'Giao hữu');
        const ruleSummaryText = ruleParts.join(', ');

        const svgArrowRight = `<svg class="lv7-ico-arr" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const svgChevronDown = `<svg class="lv7-ico-chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const svgMenuBars = `<svg class="lv7-ico-menu" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg>`;

        return renderLivingScaffold({
          D,
          state,
          formatTime,
          topHtml: `<header class="lv7-top">
            <div class="lv7-brand">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="lv7-brand-wood" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#EED6A9"/>
                    <stop offset="100%" stop-color="#D4AF76"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="4.5" width="26" height="23.5" rx="4.5" fill="#9E7744"/>
                <rect x="2" y="2" width="26" height="24" rx="4.5" fill="url(#lv7-brand-wood)" stroke="#9C743F" stroke-width="1"/>
                <path d="M10.5 6.5v15M19.5 6.5v15M6.5 10.5h17M6.5 17.5h17" stroke="#4E381E" stroke-opacity="0.62" stroke-width="0.95"/>
                <circle cx="10.5" cy="17.5" r="3.4" fill="#1E150D"/>
                <circle cx="19.5" cy="10.5" r="3.4" fill="#FFFDF8" stroke="#5E4528" stroke-width="0.95"/>
              </svg>
              <strong>Play3CR</strong>
              <span class="lv7-sample-tag" data-sample-badge="online">${D.STATS.online} trên sảnh (mẫu)</span>
            </div>
            <div class="lv7-right">
              <nav class="lv7-nav" aria-label="Điều hướng chính">
                <button type="button" data-action="nav-rooms">Phòng chơi</button>
                <button type="button" data-action="nav-ranking">Xếp hạng</button>
                <button type="button" data-action="nav-learn">Puzzle</button>
              </nav>
              <button type="button" class="lv7-mob-menu-btn" data-action="menu" aria-label="Mở menu điều hướng">
                ${svgMenuBars}
                <span>Menu</span>
              </button>
              <div class="lv6-acct-wrap">
                ${isGuest
                  ? `<span class="lv6-guest-tag">Khách</span>
                     <button type="button" class="lv6-login-btn" data-action="acct-login">Đăng nhập</button>`
                  : `<button type="button" class="lv6-acct-btn" data-action="acct-toggle" aria-haspopup="menu" aria-expanded="${Boolean(state.accountMenuOpen)}">
                       <span class="lv6-avatar" aria-hidden="true">${D.PLAYER.name[0]}</span>
                       <span class="lv6-acct-name">${D.PLAYER.name}</span>
                       ${svgChevronDown}
                     </button>
                     <div id="lv6-acct-menu" class="lv6-acct-menu" role="menu"${state.accountMenuOpen ? '' : ' hidden'}>
                       <div class="lv6-acct-head">
                         <strong>${D.PLAYER.name}</strong>
                         <small>Caro VN ${D.PLAYER.elo} — Hạng #${D.PLAYER.rank} (Dữ liệu mẫu)</small>
                       </div>
                       <button type="button" role="menuitem" data-action="acct-profile">Hồ sơ cá nhân</button>
                       <button type="button" role="menuitem" data-action="acct-social">Bạn bè &amp; tin nhắn</button>
                       <button type="button" role="menuitem" data-action="acct-sound">Âm thanh đặt quân: <b>${state.soundOn ? 'Bật' : 'Tắt'}</b></button>
                       <hr class="lv6-acct-hr">
                       <button type="button" role="menuitem" class="lv6-acct-logout" data-action="acct-logout">Đăng xuất</button>
                     </div>`}
              </div>
            </div>
          </header>`,
          kickerHtml: `<p class="lv7-kicker"><span>Bàn gỗ Hinoki nguyên khối</span><span class="lv7-kicker-sep" aria-hidden="true"></span><span>15×15 giao điểm</span></p>`,
          controlsHtml: `<div class="lv7-craft-zone" aria-label="Khu vực khởi trận Nước Cờ Đầu Tiên">
            <div class="lv7-first-stone-stage">
              <button type="button" class="lv7-stone-cta${state.searching ? ' is-searching' : ''}" data-action="play">
                <span class="lv7-stone-art" aria-hidden="true">
                  <svg viewBox="0 0 52 52" fill="none">
                    <defs>
                      <radialGradient id="lv7-b-disc" cx="34%" cy="28%" r="72%">
                        <stop offset="0%" stop-color="#6B6D67"/>
                        <stop offset="46%" stop-color="#22201D"/>
                        <stop offset="100%" stop-color="#0B0908"/>
                      </radialGradient>
                      <filter id="lv7-b-sh" x="-25%" y="-25%" width="150%" height="150%">
                        <feDropShadow dx="1.5" dy="3" stdDeviation="2" flood-color="#050302" flood-opacity="0.65"/>
                      </filter>
                    </defs>
                    <path d="M26 5v42M5 26h42" stroke="#C49A62" stroke-opacity="0.38" stroke-width="1"/>
                    <circle class="lv7-stone-ring" cx="26" cy="26" r="19" stroke="#D15644" stroke-opacity="0.68" stroke-width="1.4" stroke-dasharray="3 2.5"/>
                    <g class="lv7-stone-svg-disc" filter="url(#lv7-b-sh)">
                      <circle cx="26" cy="26" r="14" fill="url(#lv7-b-disc)" stroke="#070605" stroke-width="0.8"/>
                      <circle cx="26" cy="26" r="13.2" stroke="#FAF2E3" stroke-opacity="0.18" stroke-width="0.7"/>
                    </g>
                  </svg>
                </span>
                <span class="lv7-stone-copy">
                  <strong>Chơi ngay</strong>
                  <small>${state.searching ? `Đang tìm đối thủ (mô phỏng) — ${formatTime(state.searchElapsed)}` : `Ghép trận ngẫu nhiên — ${state.rated ? 'Xếp hạng Elo' : 'Giao hữu'}`}</small>
                </span>
                <span class="lv7-stone-enter" aria-hidden="true">${svgArrowRight}</span>
              </button>

              <div class="lv7-rule-strip" role="group" aria-label="Cấu hình luật đang chọn">
                <span class="lv7-rule-summary">Đang chọn: <strong class="lv7-cfg-current">${ruleSummaryText}</strong></span>
                <button type="button" class="lv7-rule-btn" data-action="settings"><span>Đổi luật</span>${svgChevronDown}</button>
              </div>
            </div>

            <div class="lv7-companion-bar">
              <button type="button" class="lv7-host-btn" data-action="room-hub">
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                  <defs>
                    <radialGradient id="lv7-w-disc" cx="34%" cy="26%" r="74%">
                      <stop offset="0%" stop-color="#FFFFFF"/>
                      <stop offset="70%" stop-color="#F6EFE1"/>
                      <stop offset="100%" stop-color="#D2C5AE"/>
                    </radialGradient>
                    <filter id="lv7-w-sh" x="-25%" y="-25%" width="150%" height="150%">
                      <feDropShadow dx="1" dy="2" stdDeviation="1.3" flood-color="#3E2810" flood-opacity="0.32"/>
                    </filter>
                  </defs>
                  <g filter="url(#lv7-w-sh)">
                    <circle cx="13" cy="13" r="10.2" fill="url(#lv7-w-disc)" stroke="#B8A68B" stroke-width="0.8"/>
                  </g>
                </svg>
                <span class="lv7-host-copy">
                  <strong>Tạo phòng mời bạn</strong>
                  <small>Mở bàn riêng lấy mã</small>
                </span>
              </button>

              <span class="lv7-comp-sep" aria-hidden="true"></span>

              <form class="lv7-wood-fuda" data-quick-code novalidate autocomplete="off">
                <label class="lv7-fuda-lbl" for="lv7-code-in">Mã bàn:</label>
                <div class="lv7-fuda-row">
                  <span class="lv7-fuda-hash" aria-hidden="true">#</span>
                  <input id="lv7-code-in" name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
                  <button type="submit">Vào</button>
                </div>
              </form>
            </div>
          </div>`,
          roomHtml: `<button type="button" class="lv7-open-match" data-action="room-K7M">
            <span class="lv7-open-code">#K7M</span>
            <span class="lv7-open-copy">
              <span class="lv7-open-headline"><strong>Phòng của ${room.host}</strong> <span>(${room.elo} Elo)</span></span>
              <span class="lv7-open-meta"><span>Đang chờ ghế Trắng — ${roomRuleText}, ${room.clock}</span> <em data-sample-badge="room">(mẫu)</em></span>
            </span>
            <span class="lv7-open-cta" aria-hidden="true">Vào bàn</span>
          </button>`,
        });
      },
    },

    // --- HƯỚNG A — PHƯƠNG ÁN 8: CHUẨN THAM CHIẾU (AI Reference High-Fidelity HTML/CSS/JS) ---
    {
      id: 'living-v8-reference',
      code: 'A8',
      label: 'Hướng A8 · Chuẩn Tham Chiếu',
      accent: '#8E2E20',
      hook: 'Tái tạo độ chân thực ánh sáng, chất liệu gỗ mật ong, khối CTA 2 tầng và cặp thẻ kem nổi của ảnh tham chiếu bằng HTML/CSS/JS tương tác thật 100%, chuẩn hoá toàn bộ nội dung tiếng Việt.',
      render: ({ D, state, formatTime }) => {
        const isGuest = state.authMode === 'guest';
        const room = state.rooms[0] || { host: 'Minh Anh', elo: 1620, rule: 'Luật 1, Ô khoá', clock: '45s/nước' };
        const ruleShort = D.RULES.find((r) => r.id === state.rule)?.short || 'Luật 1';
        const clockShort = D.CLOCKS.find((c) => c.id === state.clock)?.short || 'Tự động';
        const roomRuleText = String(room.rule || 'Luật 1, Ô khoá').replace(/\s*·\s*/g, ', ');
        const ruleParts = [];
        if (state.wall) ruleParts.push('Ô khoá');
        if (state.portal) ruleParts.push('Cổng');
        ruleParts.push(clockShort, state.rated ? 'Xếp hạng' : 'Giao hữu');
        const ruleSummaryText = `${ruleShort} · ${ruleParts.join(', ')}`;

        return renderLivingScaffold({
          D,
          state,
          formatTime,
          topHtml: `<header class="lv8-top" aria-label="Thanh đầu trang">
            <div class="lv8-brand-cluster">
              <div class="lv8-brand-btn">
                <svg class="lv8-logo-tile" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                  <defs>
                    <linearGradient id="lv8-tile-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#F6E2BE"/>
                      <stop offset="55%" stop-color="#DFB982"/>
                      <stop offset="100%" stop-color="#BC8E52"/>
                    </linearGradient>
                  </defs>
                  <rect x="1" y="1" width="28" height="28" rx="7" fill="url(#lv8-tile-grad)" stroke="#8C5E2A" stroke-width="1.2"/>
                  <path d="M7 11.5h16M7 18.5h16M11.5 7v16M18.5 7v16" stroke="#6E4720" stroke-width="0.95" stroke-opacity="0.58"/>
                  <circle cx="11.5" cy="11.5" r="3.4" fill="#1F140E"/>
                  <circle cx="10.4" cy="10.4" r="1.1" fill="#FFFFFF" fill-opacity="0.55"/>
                  <circle cx="18.5" cy="18.5" r="3.4" fill="#1F140E"/>
                  <circle cx="17.4" cy="17.4" r="1.1" fill="#FFFFFF" fill-opacity="0.55"/>
                  <circle cx="18.5" cy="11.5" r="3.3" fill="#FFFDF9" stroke="#8C6239" stroke-width="0.8"/>
                </svg>
                <strong class="lv8-brand-title">Play3CR</strong>
              </div>
              <span class="lv8-brand-div" aria-hidden="true"></span>
              <span class="lv8-online-meta" data-sample-badge="online">
                <strong>${D.STATS.online}</strong> trên sảnh <em class="lv8-sample-tag">(mẫu)</em>
              </span>
            </div>

            <div class="lv8-right">
              <nav class="lv8-nav" aria-label="Điều hướng chính">
                <button type="button" data-action="nav-rooms">Phòng chơi</button>
                <button type="button" data-action="nav-ranking">Xếp hạng</button>
                <button type="button" data-action="nav-learn">Puzzle</button>
              </nav>

              <button type="button" class="lv8-mob-menu-btn" data-action="menu" aria-label="Mở danh mục điều hướng">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2.5 4.25h11M2.5 8h11M2.5 11.75h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
                <span>Menu</span>
              </button>

              <div class="lv6-acct-wrap lv8-acct-wrap">
                ${isGuest
                  ? `<span class="lv6-guest-tag">Khách</span>
                     <button type="button" class="lv6-login-btn lv8-acct-btn is-guest" data-action="acct-login">Đăng nhập</button>`
                  : `<button type="button" class="lv6-acct-btn lv8-acct-btn" data-action="acct-toggle" aria-haspopup="menu" aria-expanded="${Boolean(state.accountMenuOpen)}">
                       <span class="lv8-avatar" aria-hidden="true">${D.PLAYER.name[0]}</span>
                       <span class="lv8-acct-name">${D.PLAYER.name}</span>
                       <svg class="lv8-acct-caret" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                         <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                       </svg>
                     </button>
                     <div id="lv6-acct-menu" class="lv6-acct-menu" role="menu"${state.accountMenuOpen ? '' : ' hidden'}>
                       <div class="lv6-acct-head">
                         <strong>${D.PLAYER.name}</strong>
                         <small>Caro VN ${D.PLAYER.elo} — Hạng #${D.PLAYER.rank} (Dữ liệu mẫu)</small>
                       </div>
                       <button type="button" role="menuitem" data-action="acct-profile">Hồ sơ cá nhân</button>
                       <button type="button" role="menuitem" data-action="acct-social">Bạn bè &amp; tin nhắn</button>
                       <button type="button" role="menuitem" data-action="acct-sound">Âm thanh đặt quân: <b>${state.soundOn ? 'Bật' : 'Tắt'}</b></button>
                       <hr class="lv6-acct-hr">
                       <button type="button" role="menuitem" class="lv6-acct-logout" data-action="acct-logout">Đăng xuất</button>
                     </div>`}
              </div>
            </div>
          </header>`,
          kickerHtml: `<div class="lv8-kicker-row">
            <span class="lv8-kicker-pill">
              <svg class="lv8-kicker-ico" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2" y="2.5" width="12" height="11" rx="2.2" fill="#D59B43" fill-opacity="0.24" stroke="#9B6523" stroke-width="1.35"/>
                <path d="M5.5 2.5v11M10.5 2.5v11M2 6.2h12M2 9.8h12" stroke="#9B6523" stroke-width="0.95" stroke-opacity="0.75"/>
              </svg>
              <span>Bàn gỗ Hinoki nguyên khối</span>
            </span>
            <span class="lv8-kicker-grid">15×15 giao điểm</span>
          </div>`,
          controlsHtml: `<div class="lv8-controls" aria-label="Bảng khởi tạo ván đấu">
            <div class="lv8-cta-unit${state.searching ? ' is-searching' : ''}">
              <button type="button" class="lv8-stone-cta${state.searching ? ' is-searching' : ''}" data-action="play">
                <span class="lv8-stone-emblem" aria-hidden="true">
                  <span class="lv8-stone-halo"></span>
                  <svg class="lv8-stone-svg-disc" width="48" height="48" viewBox="0 0 48 48">
                    <defs>
                      <radialGradient id="lv8-blk-stone" cx="34%" cy="28%" r="68%">
                        <stop offset="0%" stop-color="#6B625B"/>
                        <stop offset="24%" stop-color="#332B26"/>
                        <stop offset="68%" stop-color="#14100D"/>
                        <stop offset="100%" stop-color="#070504"/>
                      </radialGradient>
                      <linearGradient id="lv8-blk-rim" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#9A8878" stop-opacity="0.65"/>
                        <stop offset="50%" stop-color="#3E3227" stop-opacity="0.2"/>
                        <stop offset="100%" stop-color="#C89D66" stop-opacity="0.45"/>
                      </linearGradient>
                    </defs>
                    <circle cx="24" cy="25.5" r="20.5" fill="rgba(0,0,0,0.48)"/>
                    <circle cx="24" cy="24" r="20" fill="url(#lv8-blk-stone)" stroke="url(#lv8-blk-rim)" stroke-width="1"/>
                    <ellipse cx="17.5" cy="16.2" rx="6.5" ry="3.6" transform="rotate(-26 17.5 16.2)" fill="rgba(255,250,242,0.34)"/>
                    <circle cx="14.2" cy="14.5" r="1.6" fill="rgba(255,255,255,0.48)"/>
                  </svg>
                </span>
                <span class="lv8-stone-copy">
                  <strong class="lv8-stone-title">Chơi ngay</strong>
                  <small class="lv8-stone-sub">${state.searching ? `Đang tìm đối thủ (mô phỏng) — ${formatTime(state.searchElapsed)}` : `Chọn bàn và bắt đầu — ${state.rated ? 'Xếp hạng Elo' : 'Giao hữu'}`}</small>
                </span>
                <span class="lv8-stone-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4.5 10h11M11 5.2L15.8 10L11 14.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>

              <div class="lv8-rule-strip" role="group" aria-label="Cấu hình luật bàn hiện tại">
                <span class="lv8-rule-summary">
                  <span class="lv8-rule-prefix">Đang chọn:</span>
                  <strong class="lv8-cfg-current">${ruleSummaryText}</strong>
                </span>
                <button type="button" class="lv8-rule-btn" data-action="settings">
                  <span>Đổi luật</span>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="lv8-companion-card" aria-label="Mời bạn hoặc vào phòng bằng mã">
              <button type="button" class="lv8-host-btn" data-action="room-hub">
                <span class="lv8-white-stone" aria-hidden="true">
                  <svg width="32" height="32" viewBox="0 0 32 32">
                    <defs>
                      <radialGradient id="lv8-wht-stone" cx="32%" cy="28%" r="70%">
                        <stop offset="0%" stop-color="#FFFFFF"/>
                        <stop offset="52%" stop-color="#F7F1E7"/>
                        <stop offset="86%" stop-color="#E2D6C5"/>
                        <stop offset="100%" stop-color="#CBBBA6"/>
                      </radialGradient>
                    </defs>
                    <circle cx="16" cy="17.5" r="13" fill="rgba(78, 52, 26, 0.22)"/>
                    <circle cx="16" cy="15.5" r="13" fill="url(#lv8-wht-stone)" stroke="rgba(165, 138, 105, 0.45)" stroke-width="0.9"/>
                    <ellipse cx="12" cy="10.8" rx="4.2" ry="2.3" transform="rotate(-24 12 10.8)" fill="rgba(255,255,255,0.85)"/>
                  </svg>
                </span>
                <span class="lv8-host-copy">
                  <strong>Tạo phòng mời bạn</strong>
                  <small>Mở bàn riêng lấy mã</small>
                </span>
              </button>

              <form class="lv8-code-form" data-quick-code novalidate autocomplete="off">
                <label class="lv8-code-lbl" for="lv8-code-in">Mã bàn:</label>
                <div class="lv8-code-pill">
                  <span class="lv8-code-hash" aria-hidden="true">#</span>
                  <input id="lv8-code-in" name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
                  <button type="submit">Vào</button>
                </div>
              </form>
            </div>
          </div>`,
          roomHtml: `<button type="button" class="lv8-open-card" data-action="room-K7M">
            <span class="lv8-open-badge">#K7M</span>
            <span class="lv8-open-copy">
              <span class="lv8-open-headline"><strong>Phòng của ${room.host}</strong> <span>(${room.elo} Elo)</span></span>
              <span class="lv8-open-meta"><span>Đang chờ ghế Trắng — ${roomRuleText}, ${room.clock}</span> <em data-sample-badge="room">(mẫu)</em></span>
            </span>
            <span class="lv8-open-cta" aria-hidden="true">Vào bàn</span>
          </button>`,
        });
      },
    },

    // =========================================================================
    // HƯỚNG B — THE SOCIAL PLAYGROUND
    // =========================================================================
    {
      id: 'the-social-playground',
      code: 'B',
      label: 'Hướng B · The Social Playground',
      accent: '#E85D3F',
      hook: 'Không khí Quán Cờ Phố thân thiện với minh họa vẽ tay, thế cờ đố 1 nước tương tác và các bàn đang rủ chơi',
      render: ({ D, state, shortConfigLabel, formatTime }) => {
        const puzzleHint = state.socialSolved
          ? 'Tuyệt vời! Nước J8 nối liền 5 quân chiến thắng.'
          : (state.socialWrongHint || 'Đen đi trước: chạm ô đang nhấp nháy để thắng ngay!');

        return `<div class="sp-page">
          <header class="sp-top">
            <div class="sp-brand">
              <img src="assets/logo-mark.svg" alt="" width="28" height="28">
              <div>
                <strong>Play3CR</strong>
                <small>Quán Cờ Phố · ${D.STATS.online} người đang chơi</small>
              </div>
            </div>
            <nav class="sp-nav" aria-label="Điều hướng">
              <button type="button" class="sp-nav-btn" data-action="nav-rooms">Phòng (${state.rooms.length})</button>
              <button type="button" class="sp-nav-btn" data-action="nav-tournament">Giải 20:30</button>
              <button type="button" class="sp-nav-btn" data-action="challenge">Thách bạn</button>
              <button type="button" class="sp-menu-pill" data-action="menu">Menu · ${D.PLAYER.name}</button>
            </nav>
          </header>

          <main class="sp-layout">
            <section class="sp-welcome">
              <div class="sp-illus-row">
                ${D.renderClubIllustration()}
                <div class="sp-greeting">
                  <span class="sp-pill-live">● ${D.STATS.searching} người đang tìm bạn đấu</span>
                  <h1 class="sp-h1">Chiều nay đánh<br>một ván với ai?</h1>
                </div>
              </div>

              ${renderSearchingPill(state, formatTime)}

              <div class="sp-action-dock">
                <div class="sp-play-pair">
                  <button type="button" class="sp-btn-play" data-action="play">
                    <span>Chơi nhanh ngay</span>
                    <small>${shortConfigLabel()}</small>
                  </button>
                  <button type="button" class="sp-btn-cfg" data-action="settings">⚙ Tuỳ chỉnh</button>
                </div>

                <div class="sp-room-pair">
                  <button type="button" class="sp-btn-create" data-action="room-hub">+ Mở bàn rủ bạn</button>
                  <form class="sp-code-form" data-quick-code novalidate autocomplete="off">
                    <span aria-hidden="true">#</span>
                    <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng" autocomplete="off" autocapitalize="characters">
                    <button type="submit">Vào bàn</button>
                  </form>
                </div>
              </div>
            </section>

            <section class="sp-puzzle-stage" aria-label="Thế cờ cộng đồng hôm nay">
              <div class="sp-puzzle-head">
                <div>
                  <span class="sp-tag-puzzle">THẾ CỜ HÔM NAY · #402</span>
                  <strong>${state.socialSolved ? 'Đã giải xong thế cờ!' : 'Thử tìm 1 nước thắng ngay'}</strong>
                </div>
                <button type="button" class="sp-reset-btn" data-reset-board>${state.socialSolved ? 'Chơi lại' : 'Đặt lại'}</button>
              </div>
              <div class="sp-board-wrap">
                ${D.renderSocialBoard(state.socialPuzzleStones, { solved: state.socialSolved })}
              </div>
              <p class="sp-puzzle-msg ${state.socialSolved ? 'is-win' : ''}">${puzzleHint}</p>
            </section>
          </main>

          <section class="sp-tables" aria-label="Các bàn đang rủ chơi">
            <div class="sp-tables-head">
              <h2>Bàn đang đợi bạn ngồi đối diện</h2>
              <button type="button" class="sp-all-link" data-action="nav-rooms">Xem tất cả sảnh ↗</button>
            </div>
            <div class="sp-tables-row">
              ${state.rooms.slice(0, 3).map((r) => `
                <button type="button" class="sp-table-card" data-action="room-${r.code}">
                  <div class="sp-mini-board">
                    ${D.renderSocialBoard((r.previewMoves || D.INITIAL_ROOMS[0].previewMoves).map(([x, y], i) => [x, y, i % 2 === 0 ? 'B' : 'W']), { mini: true })}
                  </div>
                  <div class="sp-table-info">
                    <span class="sp-table-code">#${r.code} · ${r.clock}</span>
                    <strong>${r.name}</strong>
                    <small>${r.host} (${r.elo}) · ${r.rule}</small>
                    <span class="sp-table-cta">${r.open ? 'Ngồi đối diện →' : 'Vào xem ván →'}</span>
                  </div>
                </button>
              `).join('')}
            </div>
          </section>
        </div>`;
      },
    },

    // =========================================================================
    // HƯỚNG C — THE SIGNATURE EXPERIENCE
    // =========================================================================
    {
      id: 'the-signature-experience',
      code: 'C',
      label: 'Hướng C · Khoảnh Khắc Tứ-Tam & Cổng',
      accent: '#D93829',
      hook: 'Thế cờ 4 quân xuyên Cổng D7↔K11 & Ô khoá ngay tâm điểm, lật chất liệu Vở Ô Ly (✕ ○) ↔ Sơn Mài (● ○) tại chỗ',
      render: ({ D, state, shortConfigLabel, formatTime }) => {
        const isPaper = state.sigPaper;
        const portalWin = state.sigStones.some(([x, y, s]) => x === 12 && y === 2 && s === 'B');
        const statusPrompt = portalWin
          ? 'Nước M13 xuyên Cổng D7 ↔ K11 hoàn tất 5 quân chiến thắng!'
          : 'Đen đang có 4 quân nối qua Cổng. Chạm ô đỏ M13 để chốt hạ — hoặc đổi chất liệu bàn.';

        return `<div class="sg4-page ${isPaper ? 'is-paper' : 'is-lacquer'}">
          <div class="sg4-diagonal-glow" aria-hidden="true"></div>

          <header class="sg4-top">
            <div class="sg4-brand">
              <img src="assets/logo-mark.svg" alt="" width="28" height="28">
              <div>
                <strong>Play3CR</strong>
                <small>Caro Việt Nam · Ô khoá &amp; Cổng</small>
              </div>
            </div>

            <div class="sg4-top-controls">
              <div class="sg4-morph" role="group" aria-label="Chuyển chất liệu bàn cờ">
                <button type="button" class="${!isPaper ? 'is-on' : ''}" data-sig-material="lacquer">● Sơn mài</button>
                <button type="button" class="${isPaper ? 'is-on' : ''}" data-sig-material="paper">✕ Vở ô ly</button>
              </div>
              <button type="button" class="sg4-menu-btn" data-action="menu">Menu · ${D.PLAYER.name}</button>
            </div>
          </header>

          <main class="sg4-centerpiece">
            <div class="sg4-stage-grid">
              <aside class="sg4-aside-left" aria-label="Câu chuyện thế trận">
                <span class="sg4-eyebrow">ĐỘC BẢN PLAY3CR</span>
                <h1 class="sg4-h1">${portalWin ? '5 quân<br>xuyên cổng.' : 'Một nước<br>đổi cục diện.'}</h1>
                <p class="sg4-story">${statusPrompt}</p>
                <div class="sg4-legend">
                  <span><i class="sg4-ico-wall"></i> Ô khoá chặn giữa bàn</span>
                  <span><i class="sg4-ico-portal"></i> Cổng D7 ↔ K11 nối đường chéo</span>
                </div>
                <button type="button" class="sg4-reset-btn" data-reset-board>Đưa về thế 4 quân</button>
              </aside>

              <section class="sg4-board-hero" aria-label="Bàn cờ khoảnh khắc quyết định">
                ${D.renderSignatureBoard(state.sigStones, { paper: isPaper, portalWin, nextSide: state.sigTurn })}
              </section>

              <aside class="sg4-aside-right" aria-label="Nhịp sống sảnh đấu">
                <div class="sg4-pulse-block">
                  <strong>${D.STATS.online}</strong>
                  <span>kỳ thủ đang trên bàn</span>
                </div>
                <div class="sg4-rooms-mini">
                  <span class="sg4-mini-lbl">Vào xem hoặc đấu ngay</span>
                  ${state.rooms.slice(0, 2).map((r) => `
                    <button type="button" class="sg4-mini-room" data-action="room-${r.code}">
                      <code>#${r.code}</code>
                      <span>${r.name}</span>
                    </button>
                  `).join('')}
                </div>
              </aside>
            </div>

            ${renderSearchingPill(state, formatTime)}

            <section class="sg4-dock" aria-label="Thanh bắt đầu ván">
              <button type="button" class="sg4-play-btn" data-action="play">
                <span>Bắt đầu ván đấu ↗</span>
                <small>${shortConfigLabel()}</small>
              </button>

              <button type="button" class="sg4-cfg-btn" data-action="settings">⚙ Luật &amp; Giờ</button>
              <button type="button" class="sg4-sub-btn" data-action="room-hub">+ Tạo bàn</button>

              <form class="sg4-code-form" data-quick-code novalidate autocomplete="off">
                <span aria-hidden="true">#</span>
                <input name="code" type="text" maxlength="4" placeholder="K7M" aria-label="Mã phòng 3 ký tự" autocomplete="off" autocapitalize="characters">
                <button type="submit">Vào</button>
              </form>
            </section>
          </main>
        </div>`;
      },
    },
  ];

  window.Play3CR4Core.registerConcepts(CONCEPTS);
})();
