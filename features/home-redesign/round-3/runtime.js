'use strict';

/**
 * Play3CR Round 3 — Shared interactive runtime & state controller.
 */
(() => {
  const D = window.Play3CRData;
  const DESIGN_REGISTRY = [];

  const state = {
    rule: 'freestyle',
    wall: true,
    portal: false,
    clock: 'auto',
    rated: true,
    searching: false,
    searchElapsed: 0,
    searchTimer: null,
    activeMatchId: 'V8Q',
    userPickedMatch: false,
    moveStep: D.MATCHES.V8Q.moves.length,
    customStones: [[7, 7, 'B'], [7, 8, 'W'], [8, 6, 'B'], [6, 8, 'W'], [6, 6, 'B']],
    sigCustomStones: [],
    nextSide: 'W',
    signatureMode: 'stone', // 'stone' | 'paper'
    signatureRule: 'portal', // 'portal' | 'classic'
    signatureTab: 'rooms',   // 'rooms' | 'live' | 'puzzle' | 'tournament'
    rooms: D.INITIAL_ROOMS.map((r) => ({ ...r })),
    lastCreatedCode: '',
  };

  function getRuleObj(id = state.rule) {
    return D.RULES.find((r) => r.id === id) || D.RULES[0];
  }

  function getClockObj(id = state.clock) {
    return D.CLOCKS.find((c) => c.id === id) || D.CLOCKS[0];
  }

  function ruleSummary() {
    const parts = [getRuleObj().short];
    if (state.wall) parts.push('Ô khoá');
    if (state.portal) parts.push('Cổng');
    return parts.join(' + ');
  }

  function fullPickSummary() {
    return `${ruleSummary()} · ${getClockObj().short} · ${state.rated ? 'Xếp hạng' : 'Giao hữu'}`;
  }

  function formatMMSS(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function showToast(msg) {
    let toast = document.querySelector('.p3-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'p3-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function renderSearchingBanner() {
    if (!state.searching) return '';
    return `<div class="p3-searching-bar" role="status" aria-live="polite">
      <div class="p3-searching-meta">
        <i class="p3-pulse-dot" aria-hidden="true"></i>
        <span>Đang tìm đối thủ · ${fullPickSummary()} · <strong>${formatMMSS(state.searchElapsed)}</strong></span>
      </div>
      <div class="p3-searching-actions">
        <button type="button" class="p3-mini-btn" data-action="simulate-found">Giả lập gặp trận</button>
        <button type="button" class="p3-mini-btn" data-action="cancel-search">Huỷ tìm</button>
      </div>
    </div>`;
  }

  function renderCodeForm({ split = false, label = 'Vào phòng bằng mã', btnLabel = 'Vào', cls = '' } = {}) {
    if (split) {
      return `<form class="p3-code-form p3-code-form--split ${cls}" data-room-form novalidate autocomplete="off">
        <label class="p3-code-lbl">${label}</label>
        <div class="p3-code-row">
          <span class="p3-code-hash" aria-hidden="true">#</span>
          <input class="p3-code-box" data-code-box maxlength="1" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K" aria-label="Ký tự 1 mã phòng">
          <input class="p3-code-box" data-code-box maxlength="1" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="7" aria-label="Ký tự 2 mã phòng">
          <input class="p3-code-box" data-code-box maxlength="1" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="M" aria-label="Ký tự 3 mã phòng">
          <button type="submit" class="p3-code-submit">${btnLabel}</button>
        </div>
        <p class="p3-code-err" role="alert" hidden></p>
      </form>`;
    }
    return `<form class="p3-code-form ${cls}" data-room-form novalidate autocomplete="off">
      <label class="p3-code-lbl">${label}</label>
      <div class="p3-code-row">
        <input class="p3-code-input" name="code" type="text" maxlength="4" placeholder="#K7M" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Mã phòng 3 ký tự">
        <button type="submit" class="p3-code-submit">${btnLabel}</button>
      </div>
      <p class="p3-code-err" role="alert" hidden></p>
    </form>`;
  }

  function registerDesigns(list) {
    DESIGN_REGISTRY.push(...list);
  }

  function getDesigns() {
    return DESIGN_REGISTRY;
  }

  // ── Modal Engine ──
  const modal = () => document.getElementById('p3-modal');
  const modalTitle = () => document.getElementById('p3-modal-title');
  const modalBody = () => document.getElementById('p3-modal-body');

  function openModal(title, htmlOrNodes) {
    const dlg = modal();
    if (!dlg) return;
    modalTitle().textContent = title;
    const body = modalBody();
    if (typeof htmlOrNodes === 'string') {
      body.innerHTML = htmlOrNodes;
    } else {
      body.replaceChildren(...htmlOrNodes);
    }
    if (!dlg.open) dlg.showModal();
  }

  function closeModal() {
    const dlg = modal();
    if (dlg && dlg.open) dlg.close();
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 3; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function openRoomPreview(code) {
    const clean = String(code || '').trim().replace(/^#/, '').toUpperCase();
    const room = state.rooms.find((r) => r.code === clean);
    const match = D.MATCHES[clean] || D.MATCHES.V8Q;
    if (!room) {
      openModal(`Phòng #${clean}`, `
        <p class="p3m-note">Không tìm thấy phòng mẫu <strong>#${clean}</strong> trong phiên demo. Hãy thử <strong>#K7M</strong>, <strong>#V8Q</strong>, <strong>#N4X</strong> hoặc dùng nút "Tạo phòng" để tạo mã thật trong danh sách mẫu.</p>
        <div class="p3m-actions">
          <button type="button" class="p3m-btn" data-modal-room="K7M">Thử phòng #K7M</button>
          <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
        </div>
      `);
      return;
    }
    openModal(`${room.name} · #${room.code}`, `
      <div class="p3m-item">
        <div>
          <strong>Chủ bàn: ${room.host} (${room.elo} Elo)</strong>
          <small>${room.rule} · ${room.clock} · ${room.mode}</small>
        </div>
        <span class="p3m-code-badge">#${room.code}</span>
      </div>
      <div class="p3m-board-wrap">${D.renderBoardSVG({ theme: 'signature', matchId: match.id, showCoords: true, showThreat: true })}</div>
      <p class="p3m-note">${room.open ? 'Bàn đang mở ghế Trắng — sẵn sàng vào chơi ngay.' : `Đang thi đấu (${room.viewers || 12} người đang xem).`}</p>
      <div class="p3m-actions">
        <button type="button" class="p3m-btn" data-modal-join="${room.code}">${room.open ? 'Ngồi vào bàn chơi' : 'Vào xem trực tiếp'}</button>
        <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
      </div>
    `);
  }

  function openCreateRoomModal() {
    openModal('Tạo phòng chơi mới', `
      <form class="p3m-grid" id="p3-create-form">
        <div class="p3m-field">
          <label for="cr-name">Tên phòng</label>
          <input id="cr-name" name="name" type="text" value="Bàn của ${D.PLAYER.name}" maxlength="40" required>
        </div>
        <div class="p3m-field">
          <label for="cr-rule">Luật chơi</label>
          <select id="cr-rule" name="rule">
            ${D.RULES.map((r) => `<option value="${r.id}" ${r.id === state.rule ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
        <div class="p3m-field">
          <label for="cr-clock">Thời gian</label>
          <select id="cr-clock" name="clock">
            ${D.CLOCKS.map((c) => `<option value="${c.id}" ${c.id === state.clock ? 'selected' : ''}>${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="p3m-checks">
          <label class="p3m-check"><input type="checkbox" name="wall" ${state.wall ? 'checked' : ''}> Ô khoá (Wall)</label>
          <label class="p3m-check"><input type="checkbox" name="portal" ${state.portal ? 'checked' : ''}> Cổng (Portal)</label>
          <label class="p3m-check"><input type="checkbox" name="rated" ${state.rated ? 'checked' : ''}> Tính điểm Elo</label>
        </div>
        <div class="p3m-actions">
          <button type="submit" class="p3m-btn">Tạo phòng &amp; Lấy mã</button>
          <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Huỷ</button>
        </div>
      </form>
    `);
  }

  function openChallengeModal() {
    openModal('Thách đấu kỳ thủ', `
      <p class="p3m-note">Luật áp dụng: <strong>${fullPickSummary()}</strong>. Lời mời giữ hiệu lực 2 phút.</p>
      <div class="p3m-list">
        ${D.FRIENDS.map((f) => `
          <div class="p3m-item">
            <div>
              <strong>${f.name} · ${f.elo} Elo</strong>
              <small>${f.status}</small>
            </div>
            <button type="button" class="p3m-btn" data-send-challenge="${f.name}">Thách đấu</button>
          </div>
        `).join('')}
      </div>
      <div class="p3m-actions">
        <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-create>Hoặc tạo phòng riêng lấy mã</button>
      </div>
    `);
  }

  function openNavModal(id) {
    if (id === 'nav-rooms') {
      openModal('Danh sách phòng đang mở', `
        <div class="p3m-list">
          ${state.rooms.map((r) => `
            <div class="p3m-item">
              <div>
                <strong>#${r.code} · ${r.name}</strong>
                <small>${r.host} · ${r.rule} · ${r.clock} · ${r.state}</small>
              </div>
              <button type="button" class="p3m-btn" data-modal-room="${r.code}">${r.open ? 'Vào bàn' : 'Xem'}</button>
            </div>
          `).join('')}
        </div>
        <div class="p3m-actions">
          <button type="button" class="p3m-btn" data-modal-create>+ Tạo phòng mới</button>
          <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
        </div>
      `);
      return;
    }
    if (id === 'ranking') {
      openModal('Bảng xếp hạng Glicko-2', `
        <div class="p3m-list">
          ${D.RANKINGS.map((r) => `
            <div class="p3m-item">
              <div>
                <strong>#${r.rank} · ${r.name}</strong>
                <small>${r.wins} thắng · Chuỗi ${r.streak} · ${r.badge}</small>
              </div>
              <span class="p3m-code-badge">${r.elo}</span>
            </div>
          `).join('')}
        </div>
      `);
      return;
    }
    if (id === 'tournament') {
      const t = D.EXTRA_DATA.tournament;
      openModal('Giải đấu Play3CR', `
        <div class="p3m-item">
          <div>
            <strong>${t.name}</strong>
            <small>${t.time} · ${t.players}</small>
          </div>
          <span class="p3m-code-badge">20:30</span>
        </div>
        <p class="p3m-note">${t.format}. Phần thưởng: ${t.prize}.</p>
        <div class="p3m-actions">
          <button type="button" class="p3m-btn" data-toast-msg="Đã đăng ký giữ chỗ giải Cúp Cuối Tuần (mô phỏng).">Đăng ký tham gia</button>
          <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
        </div>
      `);
      return;
    }
    if (id === 'learn') {
      const p = D.EXTRA_DATA.puzzle;
      openModal(`Học & Giải đố · ${p.id}`, `
        <div class="p3m-item">
          <div>
            <strong>${p.title}</strong>
            <small>${p.level} · Tác giả: ${p.author} · ${p.solved} người đã giải</small>
          </div>
        </div>
        <div class="p3m-board-wrap">${D.renderBoardSVG({ theme: 'editorial', matchId: 'K7M', showCoords: true, showMoveNums: true })}</div>
        <div class="p3m-actions">
          <button type="button" class="p3m-btn" data-toast-msg="Đã mở bài tập #402 trên trang Học (mô phỏng).">Giải ngay bài #402</button>
          <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
        </div>
      `);
      return;
    }
    if (id === 'club') {
      const c = D.EXTRA_DATA.club;
      openModal('Hội nhóm kỳ thủ', `
        <div class="p3m-item">
          <div>
            <strong>${c.name}</strong>
            <small>${c.members} thành viên · Elo TB ${c.avgElo} · ${c.weeklyGames} ván/tuần</small>
          </div>
        </div>
        <p class="p3m-note">${c.note}</p>
        <div class="p3m-actions">
          <button type="button" class="p3m-btn" data-toast-msg="Đã gửi yêu cầu tham gia Câu lạc bộ Bàn Tre (mô phỏng).">Tham gia nhóm</button>
          <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
        </div>
      `);
      return;
    }
    if (id === 'forum') {
      openModal('Diễn đàn chiến thuật', `
        <div class="p3m-list">
          ${D.EXTRA_DATA.forum.map((post) => `
            <div class="p3m-item">
              <div>
                <strong>[${post.tag}] ${post.title}</strong>
                <small>Đăng bởi ${post.author} · ${post.replies} phản hồi</small>
              </div>
            </div>
          `).join('')}
        </div>
      `);
      return;
    }
    if (id === 'profile') {
      const p = D.PLAYER;
      openModal(`Hồ sơ kỳ thủ · ${p.name}`, `
        <div class="p3m-item">
          <div>
            <strong>${p.name} (${p.handle})</strong>
            <small>Hạng #${p.rank} · ${p.games} ván · Tỉ lệ thắng ${p.winRate} · Chuỗi ${p.streak}</small>
          </div>
          <span class="p3m-code-badge">${p.elo}</span>
        </div>
        <p class="p3m-note">Mùa giải 4 đang mở. Thêm 20 điểm Elo để lọt Top 30 toàn máy chủ.</p>
      `);
    }
  }

  function startSearch() {
    if (state.searching) return;
    state.searching = true;
    state.searchElapsed = 0;
    clearInterval(state.searchTimer);
    state.searchTimer = setInterval(() => {
      state.searchElapsed += 1;
      renderCurrent();
    }, 1000);
    renderCurrent();
    showToast(`Bắt đầu tìm trận: ${fullPickSummary()}`);
  }

  function cancelSearch() {
    state.searching = false;
    clearInterval(state.searchTimer);
    state.searchTimer = null;
    renderCurrent();
    showToast('Đã huỷ tìm trận.');
  }

  function simulateFound() {
    state.searching = false;
    clearInterval(state.searchTimer);
    state.searchTimer = null;
    renderCurrent();
    openModal('Đã tìm thấy đối thủ!', `
      <div class="p3m-item">
        <div>
          <strong>${D.PLAYER.name} (${D.PLAYER.elo}) vs Minh Anh (1620)</strong>
          <small>${fullPickSummary()} · Phòng ghép tự động #M8K</small>
        </div>
        <span class="p3m-code-badge">#M8K</span>
      </div>
      <div class="p3m-board-wrap">${D.renderBoardSVG({ theme: 'signature', matchId: 'V8Q', moveLimit: 4, showCoords: true })}</div>
      <div class="p3m-actions">
        <button type="button" class="p3m-btn" data-toast-msg="Sẵn sàng đặt nước đầu tiên (mô phỏng).">Bắt đầu ván đấu</button>
        <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
      </div>
    `);
  }

  function currentDesign() {
    const hash = location.hash;
    return DESIGN_REGISTRY.find((d) => '#' + d.id === hash) || DESIGN_REGISTRY[0];
  }

  function renderCurrent() {
    const home = document.getElementById('home');
    if (!home || !DESIGN_REGISTRY.length) return;
    const design = currentDesign();
    const scrollY = window.scrollY;
    document.body.dataset.style = design.id;
    document.title = `${design.num} · ${design.name} — Play3CR`;
    home.innerHTML = design.render({
      D,
      state,
      ruleSummary,
      fullPickSummary,
      renderSearchingBanner,
      renderCodeForm,
      getRuleObj,
      getClockObj,
    });
    if (renderCurrent._lastId !== design.id) {
      renderCurrent._lastId = design.id;
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, scrollY);
    }
  }

  function init() {
    const home = document.getElementById('home');
    if (!home) return;

    // Global delegated clicks inside #home
    home.addEventListener('click', (event) => {
      const ruleBtn = event.target.closest('[data-set-rule]');
      if (ruleBtn) {
        state.rule = ruleBtn.dataset.setRule;
        renderCurrent();
        return;
      }

      const clockBtn = event.target.closest('[data-set-clock]');
      if (clockBtn) {
        state.clock = clockBtn.dataset.setClock;
        renderCurrent();
        return;
      }

      const ratedBtn = event.target.closest('[data-set-rated]');
      if (ratedBtn) {
        state.rated = ratedBtn.dataset.setRated === 'true';
        renderCurrent();
        return;
      }

      if (event.target.closest('[data-toggle-wall]')) {
        state.wall = !state.wall;
        renderCurrent();
        return;
      }

      if (event.target.closest('[data-toggle-portal]')) {
        state.portal = !state.portal;
        renderCurrent();
        return;
      }

      const presetBtn = event.target.closest('[data-preset]');
      if (presetBtn) {
        const p = presetBtn.dataset.preset;
        if (p === 'fast') { state.rule = 'freestyle'; state.wall = true; state.portal = false; state.clock = 'm45'; state.rated = true; }
        if (p === 'blitz') { state.rule = 'caro'; state.wall = false; state.portal = false; state.clock = '1+1'; state.rated = true; }
        if (p === 'portal') { state.rule = 'freestyle'; state.wall = true; state.portal = true; state.clock = 'm30'; state.rated = false; }
        if (p === 'casual') { state.rule = 'freestyle'; state.wall = false; state.portal = false; state.clock = 'auto'; state.rated = false; }
        renderCurrent();
        return;
      }

      const matchSwitch = event.target.closest('[data-match-switch]');
      if (matchSwitch) {
        const id = matchSwitch.dataset.matchSwitch;
        if (D.MATCHES[id]) {
          state.activeMatchId = id;
          state.userPickedMatch = true;
          state.moveStep = D.MATCHES[id].moves.length;
          renderCurrent();
        }
        return;
      }

      const stepBtn = event.target.closest('[data-board-step]');
      if (stepBtn) {
        const m = D.MATCHES[state.activeMatchId] || D.MATCHES.V8Q;
        const op = stepBtn.dataset.boardStep;
        if (op === 'prev') state.moveStep = Math.max(1, state.moveStep - 1);
        if (op === 'next') state.moveStep = Math.min(m.moves.length, state.moveStep + 1);
        if (op === 'live') state.moveStep = m.moves.length;
        if (op === 'reset') {
          if (currentDesign().id === 'signature-portal') state.sigCustomStones = [];
          else state.customStones = [];
          state.nextSide = 'B';
        }
        if (op === 'sample5') {
          state.customStones = [[7, 7, 'B'], [7, 8, 'W'], [8, 6, 'B'], [6, 8, 'W'], [9, 5, 'B'], [5, 9, 'W'], [10, 4, 'B']];
          state.nextSide = 'W';
        }
        renderCurrent();
        return;
      }

      const sigMode = event.target.closest('[data-sig-mode]');
      if (sigMode) {
        state.signatureMode = sigMode.dataset.sigMode;
        renderCurrent();
        return;
      }

      const sigRule = event.target.closest('[data-sig-rule]');
      if (sigRule) {
        state.signatureRule = sigRule.dataset.sigRule;
        renderCurrent();
        return;
      }

      const sigTab = event.target.closest('[data-sig-tab]');
      if (sigTab) {
        state.signatureTab = sigTab.dataset.sigTab;
        renderCurrent();
        return;
      }

      const cell = event.target.closest('[data-cell]');
      if (cell) {
        const [x, y] = cell.dataset.cell.split(',').map(Number);
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          const arr = currentDesign().id === 'signature-portal' ? state.sigCustomStones : state.customStones;
          arr.push([x, y, state.nextSide]);
          state.nextSide = state.nextSide === 'B' ? 'W' : 'B';
          renderCurrent();
          showToast(`Đặt quân tại ${D.formatCoord(x, y)} (${state.nextSide === 'W' ? 'Đen' : 'Trắng'})`);
        }
        return;
      }

      const actionBtn = event.target.closest('[data-action]');
      if (actionBtn) {
        const act = actionBtn.dataset.action;
        if (act === 'play') startSearch();
        else if (act === 'cancel-search') cancelSearch();
        else if (act === 'simulate-found') simulateFound();
        else if (act === 'create-room') openCreateRoomModal();
        else if (act === 'challenge') openChallengeModal();
        else if (act.startsWith('room-')) openRoomPreview(act.slice(5));
        else if (act === 'home') showToast('Đang ở Trang chủ Play3CR.');
        else openNavModal(act);
      }
    });

    // Split room code box navigation & paste
    home.addEventListener('input', (event) => {
      const t = event.target;
      if (t.matches('[data-code-box]')) {
        const form = t.closest('form');
        const err = form.querySelector('.p3-code-err');
        if (err) err.hidden = true;
        const boxes = [...form.querySelectorAll('[data-code-box]')];
        const idx = boxes.indexOf(t);
        const clean = t.value.replace(/[^a-z0-9]/gi, '').toUpperCase();
        if (clean.length > 1) {
          let p = idx;
          for (const ch of clean) {
            if (p < boxes.length) boxes[p++].value = ch;
          }
          boxes[Math.min(p, boxes.length - 1)].focus();
        } else {
          t.value = clean;
          if (clean && idx < boxes.length - 1) boxes[idx + 1].focus();
        }
      }
      if (t.matches('.p3-code-input')) {
        const form = t.closest('form');
        const err = form.querySelector('.p3-code-err');
        if (err) err.hidden = true;
      }
    });

    home.addEventListener('keydown', (event) => {
      const t = event.target;
      if (!t.matches('[data-code-box]')) return;
      const form = t.closest('form');
      const boxes = [...form.querySelectorAll('[data-code-box]')];
      const idx = boxes.indexOf(t);
      if (event.key === 'Backspace' && !t.value && idx > 0) {
        event.preventDefault();
        boxes[idx - 1].value = '';
        boxes[idx - 1].focus();
      } else if (event.key === 'ArrowLeft' && idx > 0) {
        event.preventDefault();
        boxes[idx - 1].focus();
      } else if (event.key === 'ArrowRight' && idx < boxes.length - 1) {
        event.preventDefault();
        boxes[idx + 1].focus();
      }
    });

    home.addEventListener('paste', (event) => {
      const t = event.target;
      if (!t.matches('[data-code-box]')) return;
      const text = (event.clipboardData ? event.clipboardData.getData('text') : '').replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (!text) return;
      event.preventDefault();
      const form = t.closest('form');
      const boxes = [...form.querySelectorAll('[data-code-box]')];
      let idx = boxes.indexOf(t);
      for (const ch of text) {
        if (idx < boxes.length) boxes[idx++].value = ch;
      }
      boxes[Math.min(idx, boxes.length - 1)].focus();
    });

    home.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-room-form]');
      if (!form) return;
      event.preventDefault();
      const boxes = [...form.querySelectorAll('[data-code-box]')];
      const raw = boxes.length
        ? boxes.map((b) => b.value).join('')
        : (form.querySelector('.p3-code-input')?.value || '');
      const clean = raw.trim().replace(/^#/, '').toUpperCase();
      const err = form.querySelector('.p3-code-err');
      if (!/^[A-Z0-9]{3}$/.test(clean)) {
        if (err) {
          err.textContent = 'Nhập mã gồm 3 chữ cái hoặc chữ số (VD: K7M).';
          err.hidden = false;
        }
        (boxes.find((b) => !b.value) || boxes[0] || form.querySelector('.p3-code-input'))?.focus();
        return;
      }
      if (err) err.hidden = true;
      openRoomPreview(clean);
    });

    // Modal internal events
    const dlg = modal();
    if (dlg) {
      dlg.addEventListener('click', (event) => {
        if (event.target.closest('[data-modal-close]')) { closeModal(); return; }
        const r = event.target.closest('[data-modal-room]');
        if (r) { openRoomPreview(r.dataset.modalRoom); return; }
        const j = event.target.closest('[data-modal-join]');
        if (j) { closeModal(); showToast(`Đã vào phòng mẫu #${j.dataset.modalJoin}!`); return; }
        if (event.target.closest('[data-modal-create]')) { openCreateRoomModal(); return; }
        const ch = event.target.closest('[data-send-challenge]');
        if (ch) { closeModal(); showToast(`Đã gửi lời thách đấu tới ${ch.dataset.sendChallenge}!`); return; }
        const tm = event.target.closest('[data-toast-msg]');
        if (tm) { closeModal(); showToast(tm.dataset.toastMsg); }
      });

      dlg.addEventListener('submit', (event) => {
        if (event.target.id === 'p3-create-form') {
          event.preventDefault();
          const fd = new FormData(event.target);
          const code = generateRoomCode();
          const rObj = getRuleObj(fd.get('rule'));
          const cObj = getClockObj(fd.get('clock'));
          const mods = [];
          if (fd.get('wall')) mods.push('Ô khoá');
          if (fd.get('portal')) mods.push('Cổng');
          const room = {
            code,
            name: String(fd.get('name') || 'Bàn mới').trim(),
            host: D.PLAYER.name,
            elo: D.PLAYER.elo,
            rule: mods.length ? `${rObj.short} · ${mods.join(' + ')}` : rObj.short,
            clock: cObj.short,
            mode: fd.get('rated') ? 'Xếp hạng' : 'Giao hữu',
            state: 'Chờ đối thủ',
            open: true,
            seats: '1/2',
            viewers: 1,
          };
          state.rooms.unshift(room);
          state.lastCreatedCode = code;
          renderCurrent();
          openModal('Phòng đã sẵn sàng!', `
            <div class="p3m-item">
              <div>
                <strong>${room.name}</strong>
                <small>${room.rule} · ${room.clock} · ${room.mode}</small>
              </div>
              <span class="p3m-code-badge">#${code}</span>
            </div>
            <p class="p3m-note">Phòng mới đã được thêm vào danh sách trên Trang chủ. Chia sẻ mã <strong>#${code}</strong> cho bạn bè để vào bàn.</p>
            <div class="p3m-actions">
              <button type="button" class="p3m-btn" data-modal-join="${code}">Vào bàn #${code}</button>
              <button type="button" class="p3m-btn p3m-btn--ghost" data-modal-close>Đóng</button>
            </div>
          `);
        }
      });
    }

    window.addEventListener('hashchange', () => {
      closeModal();
      renderCurrent();
    });

    renderCurrent();
  }

  window.Play3CRRuntime = {
    state,
    registerDesigns,
    getDesigns,
    renderCurrent,
    init,
  };
})();
