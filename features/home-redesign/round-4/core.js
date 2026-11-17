'use strict';

/**
 * Play3CR Round 4 — Shared Interactive Core:
 * - Clean configuration popover/modal (Luật, Ô khoá, Cổng, Đồng hồ, Chế độ)
 * - Quick Match simulation with live timer
 * - Create Room / Challenge Friend / Enter Room Code (#K7M, #N4X, #V8Q or created)
 * - Interactive board turns & puzzle solve state per concept
 * - Full Navigation Menu modal (prevents clipped horizontal scrolling on 390px mobile!)
 */
(() => {
  const D = window.Play3CR4Data;
  const REGISTRY = [];

  const state = {
    rule: 'freestyle',
    wall: true,
    portal: false,
    clock: 'auto',
    rated: true,
    searching: false,
    searchElapsed: 0,
    searchTimer: null,
    authMode: 'member',
    accountMenuOpen: false,
    soundOn: true,
    rooms: D.INITIAL_ROOMS.map((r) => ({ ...r })),
    // Per-concept interactive board states
    livingStones: D.LIVING_SEED.map((s) => [...s]),
    livingTurn: 'B',
    livingLastCoord: '',
    socialPuzzleStones: D.SOCIAL_PUZZLE_STONES.map((s) => [...s]),
    socialSolved: false,
    socialWrongHint: '',
    sigStones: D.SIGNATURE_SEED.map((s) => [...s]),
    sigTurn: 'B',
    sigPaper: false,
  };

  function isLivingConcept(id = REGISTRY.length > 0 ? currentDesign().id : '') {
    return Boolean(id && (id === 'the-living-board' || id.startsWith('living-')));
  }
  function getRule(id = state.rule) {
    return D.RULES.find((r) => r.id === id) || D.RULES[0];
  }
  function getClock(id = state.clock) {
    return D.CLOCKS.find((c) => c.id === id) || D.CLOCKS[0];
  }
  function shortConfigLabel() {
    const parts = [getRule().short];
    if (state.wall) parts.push('Ô khoá');
    if (state.portal) parts.push('Cổng');
    parts.push(getClock().short);
    return parts.join(' · ');
  }
  function fullConfigLabel() {
    return `${shortConfigLabel()} · ${state.rated ? 'Xếp hạng' : 'Giao hữu'}`;
  }
  function formatTime(sec) {
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  /** Synthesize warm wooden stone placement sound based on client/js/audio-manager.js. */
  function playStoneSound(isOpponent = false, isWin = false) {
    if (!state.soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!playStoneSound._ctx) playStoneSound._ctx = new Ctx();
      const ctx = playStoneSound._ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.32, now);
      master.connect(ctx.destination);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const baseFreq = isOpponent ? 420 : 480;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.3, now + 0.08);
      oscGain.gain.setValueAtTime(0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(oscGain);
      oscGain.connect(master);
      osc.start(now);
      osc.stop(now + 0.085);

      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.015));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1200, now);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(master);
      noise.start(now);

      if (isWin) {
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const wOsc = ctx.createOscillator();
          const wGain = ctx.createGain();
          const t0 = now + 0.06 + idx * 0.08;
          wOsc.type = 'triangle';
          wOsc.frequency.setValueAtTime(freq, t0);
          wGain.gain.setValueAtTime(0.001, t0);
          wGain.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
          wGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
          wOsc.connect(wGain);
          wGain.connect(ctx.destination);
          wOsc.start(t0);
          wOsc.stop(t0 + 0.34);
        });
      }
    } catch { /* ignore headless audio restrictions */ }
  }

  function showToast(msg) {
    let el = document.querySelector('.r4-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'r4-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 2800);
  }

  const modal = () => document.getElementById('r4-modal');
  function openModal(title, html) {
    const dlg = modal();
    if (!dlg) return;
    document.getElementById('r4-modal-title').textContent = title;
    document.getElementById('r4-modal-body').innerHTML = html;
    if (!dlg.open) dlg.showModal();
  }
  function closeModal() {
    const dlg = modal();
    if (dlg && dlg.open) dlg.close();
  }

  function openSettingsModal() {
    openModal('Tuỳ chỉnh ván đấu', `
      <div class="r4m-group">
        <span class="r4m-lbl">Luật chơi (Ghép trận hỗ trợ Luật 1 &amp; Luật 2)</span>
        <div class="r4m-pills">
          ${D.RULES.map((r) => `<button type="button" class="r4m-pill ${state.rule === r.id ? 'is-on' : ''}" data-cfg-rule="${r.id}">${r.label}</button>`).join('')}
        </div>
      </div>
      <div class="r4m-group">
        <span class="r4m-lbl">Cơ chế đặc trưng Play3CR</span>
        <div class="r4m-pills">
          <button type="button" class="r4m-pill ${state.wall ? 'is-on' : ''}" data-cfg-wall>Ô khoá (Wall) ${state.wall ? '✓' : ''}</button>
          <button type="button" class="r4m-pill ${state.portal ? 'is-on' : ''}" data-cfg-portal>Cổng dịch chuyển ${state.portal ? '✓' : ''}</button>
        </div>
      </div>
      <div class="r4m-group">
        <span class="r4m-lbl">Thời gian</span>
        <div class="r4m-pills">
          ${D.CLOCKS.map((c) => `<button type="button" class="r4m-pill ${state.clock === c.id ? 'is-on' : ''}" data-cfg-clock="${c.id}">${c.label}</button>`).join('')}
        </div>
      </div>
      <div class="r4m-group">
        <span class="r4m-lbl">Chế độ</span>
        <div class="r4m-pills">
          <button type="button" class="r4m-pill ${state.rated ? 'is-on' : ''}" data-cfg-rated="true">Đấu xếp hạng Elo</button>
          <button type="button" class="r4m-pill ${!state.rated ? 'is-on' : ''}" data-cfg-rated="false">Giao hữu tự do</button>
        </div>
      </div>
      <div class="r4m-actions">
        <button type="button" class="r4m-btn" data-modal-play>Áp dụng &amp; Chơi ngay</button>
        <button type="button" class="r4m-btn r4m-btn--ghost" data-modal-close>Xong</button>
      </div>
    `);
  }

  function openMenuModal() {
    openModal('Điều hướng Play3CR', `
      <p class="r4m-note">Danh mục điều hướng chính trong sảnh Play3CR (dữ liệu hiển thị là dữ liệu mẫu mockup).</p>
      <div class="r4m-nav-grid">
        ${D.NAV_ITEMS.map((item) => `
          <button type="button" class="r4m-nav-card" data-nav-section="${item.id}">
            <strong>${item.label}</strong>
            <small>${item.desc}</small>
          </button>
        `).join('')}
      </div>
    `);
  }

  function openProfileModal() {
    openModal(`Hồ sơ kỳ thủ · ${D.PLAYER.name}`, `
      <div class="r4m-row">
        <div>
          <strong>${D.PLAYER.name} · Caro VN ${D.PLAYER.elo} Elo</strong>
          <small>Hạng #${D.PLAYER.rank} · Chuỗi ${D.PLAYER.streak} thắng (Dữ liệu mẫu mockup)</small>
        </div>
        <span class="r4m-code">#${D.PLAYER.rank}</span>
      </div>
      <div class="r4m-list">
        <div class="r4m-row"><div><strong>Luật 1 (5+ quân liên tiếp)</strong><small>1455 Elo · 28 ván (mẫu)</small></div><span>Ổn định</span></div>
        <div class="r4m-row"><div><strong>Luật 2 (Caro VN · chặn 2 đầu)</strong><small>${D.PLAYER.elo} Elo · 64 ván (mẫu)</small></div><span>Sở trường</span></div>
        <div class="r4m-row"><div><strong>Tiêu chuẩn (Đúng 5 · Tạo phòng)</strong><small>1430 Elo · 19 ván (mẫu)</small></div><span>Ổn định</span></div>
      </div>
      <div class="r4m-actions">
        <button type="button" class="r4m-btn" data-modal-close>Đóng</button>
      </div>
    `);
  }

  function openNavDetail(section) {
    if (section === 'rooms') {
      openModal('Phòng chơi đang mở', `
        <div class="r4m-list">
          ${state.rooms.map((r) => `
            <button type="button" class="r4m-row" data-modal-room="${r.code}">
              <div><strong>${r.name}</strong><small>${r.host} (${r.elo}) · ${r.rule} · ${r.clock}</small></div>
              <span class="r4m-code">#${r.code}</span>
            </button>
          `).join('')}
        </div>
        <div class="r4m-actions">
          <button type="button" class="r4m-btn" data-modal-create>+ Tạo phòng mới</button>
          <button type="button" class="r4m-btn r4m-btn--ghost" data-modal-close>Đóng</button>
        </div>
      `);
      return;
    }
    const item = D.NAV_ITEMS.find((i) => i.id === section);
    openModal(item ? item.label : 'Play3CR', `
      <p class="r4m-note">${item ? item.desc : ''} (Dữ liệu mô phỏng cho phiên bản thử nghiệm Home Round 4.)</p>
      <div class="r4m-actions">
        <button type="button" class="r4m-btn" data-modal-close>Quay lại Trang chủ</button>
      </div>
    `);
  }

  function openRoomDialog(rawCode) {
    const clean = String(rawCode || '').trim().replace(/^#/, '').toUpperCase();
    const room = state.rooms.find((r) => r.code === clean);
    if (!room) {
      openModal(`Vào phòng #${clean}`, `
        <p class="r4m-note">Chưa thấy phòng <strong>#${clean}</strong> trong danh sách mẫu. Bạn có thể mở thử <strong>#K7M</strong>, <strong>#N4X</strong>, <strong>#V8Q</strong> hoặc tạo phòng mới.</p>
        <div class="r4m-actions">
          <button type="button" class="r4m-btn" data-modal-room="K7M">Mở phòng #K7M</button>
          <button type="button" class="r4m-btn r4m-btn--ghost" data-modal-create>+ Tạo phòng mới</button>
        </div>
      `);
      return;
    }
    openModal(`${room.name} · #${room.code}`, `
      <div class="r4m-row">
        <div>
          <strong>Chủ bàn: ${room.host} (${room.elo} Elo)</strong>
          <small>${room.rule} · ${room.clock} · ${room.mode}</small>
        </div>
        <span class="r4m-code">#${room.code}</span>
      </div>
      <p class="r4m-note">${room.note}</p>
      <div class="r4m-actions">
        <button type="button" class="r4m-btn" data-toast-msg="Đã bước vào bàn #${room.code} (mô phỏng).">${room.open ? 'Ngồi vào bàn chơi' : 'Vào xem trực tiếp'}</button>
        <button type="button" class="r4m-btn r4m-btn--ghost" data-modal-close>Đóng</button>
      </div>
    `);
  }

  function openCreateOrJoinModal() {
    openModal('Tạo phòng hoặc Vào bằng mã', `
      <form class="r4m-group" id="r4-join-modal-form" novalidate>
        <span class="r4m-lbl">Đã có mã từ bạn bè?</span>
        <div style="display:flex;gap:8px;">
          <input name="code" type="text" maxlength="4" placeholder="VD: K7M" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:0;min-height:44px;padding:8px 12px;border:1px solid #D2CBBF;border-radius:10px;font-family:ui-monospace,monospace;font-weight:800;letter-spacing:0.12em;">
          <button type="submit" class="r4m-btn">Vào bàn</button>
        </div>
      </form>
      <hr style="border:0;border-top:1px solid #EAE4D9;margin:4px 0;">
      <form class="r4m-group" id="r4-create-form">
        <span class="r4m-lbl">Hoặc mở bàn mới mời bạn</span>
        <div class="r4m-field">
          <label for="r4-room-name">Tên bàn</label>
          <input id="r4-room-name" name="name" type="text" value="Bàn của ${D.PLAYER.name}" maxlength="36" required>
        </div>
        <p class="r4m-note">Áp dụng cấu hình đang chọn: <strong>${fullConfigLabel()}</strong>. <button type="button" data-open-settings style="border:0;background:transparent;text-decoration:underline;font-weight:800;padding:0;">Đổi luật</button></p>
        <div class="r4m-actions">
          <button type="submit" class="r4m-btn">Tạo phòng &amp; Lấy mã</button>
          <button type="button" class="r4m-btn r4m-btn--ghost" data-open-challenge>Thách đấu trực tiếp</button>
        </div>
      </form>
    `);
  }

  function openChallengeModal() {
    openModal('Thách đấu kỳ thủ', `
      <p class="r4m-note">Luật áp dụng: <strong>${fullConfigLabel()}</strong></p>
      <div class="r4m-list">
        ${D.FRIENDS.map((f) => `
          <div class="r4m-row">
            <div><strong>${f.name} · ${f.elo} Elo</strong><small>${f.status}</small></div>
            <button type="button" class="r4m-btn" data-toast-msg="Đã gửi lời mời tới ${f.name} (mô phỏng).">Mời đấu</button>
          </div>
        `).join('')}
      </div>
    `);
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
  }

  function cancelSearch() {
    state.searching = false;
    clearInterval(state.searchTimer);
    state.searchTimer = null;
    renderCurrent();
    showToast('Đã huỷ tìm đối thủ.');
  }

  function simulateMatchFound() {
    state.searching = false;
    clearInterval(state.searchTimer);
    state.searchTimer = null;
    renderCurrent();
    openModal('Đã ghép được đối thủ!', `
      <div class="r4m-row">
        <div>
          <strong>${D.PLAYER.name} (${D.PLAYER.elo}) vs Minh Anh (1620)</strong>
          <small>${fullConfigLabel()} · Phòng #M8K</small>
        </div>
        <span class="r4m-code">#M8K</span>
      </div>
      <div class="r4m-actions">
        <button type="button" class="r4m-btn" data-toast-msg="Sẵn sàng đặt quân đầu tiên (mô phỏng).">Vào bàn đấu ngay</button>
        <button type="button" class="r4m-btn r4m-btn--ghost" data-modal-close>Đóng</button>
      </div>
    `);
  }

  function currentDesign() {
    const hash = location.hash;
    return REGISTRY.find((d) => '#' + d.id === hash) || REGISTRY[0];
  }

  function renderCurrent() {
    const home = document.getElementById('home');
    if (!home || !REGISTRY.length) return;
    const d = currentDesign();
    const scrollY = window.scrollY;
    document.body.dataset.concept = d.id;
    document.title = `${d.label} · Play3CR Round 4`;
    home.innerHTML = d.render({
      D,
      state,
      shortConfigLabel,
      fullConfigLabel,
      formatTime,
    });
    if (renderCurrent._last !== d.id) {
      renderCurrent._last = d.id;
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, scrollY);
    }
  }

  function registerConcepts(list) {
    REGISTRY.push(...list);
  }
  function getConcepts() {
    return REGISTRY;
  }

  function init() {
    const home = document.getElementById('home');
    if (!home) return;

    home.addEventListener('click', (event) => {
      // Board cell interactions
      const cell = event.target.closest('[data-cell]');
      if (cell) {
        const [x, y] = cell.dataset.cell.split(',').map(Number);
        const cid = currentDesign().id;
        if (isLivingConcept(cid)) {
          if (D.findFive(state.livingStones)) return;
          const placedByWhite = state.livingTurn === 'W';
          state.livingStones.push([x, y, state.livingTurn]);
          state.livingLastCoord = D.formatCoord(x, y);
          state.livingTurn = placedByWhite ? 'B' : 'W';
          const win = D.findFive(state.livingStones);
          renderCurrent();
          playStoneSound(placedByWhite, Boolean(win));
          if (win) showToast('Bàn thử đã khoá sau nước thắng — chọn Xếp lại bàn hoặc Chơi ngay.');
          else showToast(`Đặt thử tại ${state.livingLastCoord} (chỉ trên bàn thử Home)`);
          return;
        }
        if (cid === 'the-social-playground') {
          if (x === 9 && y === 7 && !state.socialSolved) {
            state.socialPuzzleStones.push([9, 7, 'B']);
            state.socialSolved = true;
            state.socialWrongHint = '';
            renderCurrent();
            showToast('Chính xác! Nước J8 thắng 5 quân!');
          } else if (!state.socialSolved) {
            state.socialWrongHint = `Ô ${D.formatCoord(x, y)} chưa đủ 5 — thử ô J8 đang nhấp nháy!`;
            renderCurrent();
          }
          return;
        }
        if (cid === 'the-signature-experience') {
          const isWinMove = x === 12 && y === 2 && state.sigTurn === 'B';
          state.sigStones.push([x, y, state.sigTurn]);
          state.sigTurn = state.sigTurn === 'B' ? 'W' : 'B';
          renderCurrent();
          if (isWinMove) showToast('M13 chốt hạ 5 quân xuyên qua Cổng D6 ↔ K11!');
          else showToast(`Đặt nước tại ${D.formatCoord(x, y)}`);
          return;
        }
      }

      if (event.target.closest('[data-reset-board]')) {
        const cid = currentDesign().id;
        if (isLivingConcept(cid)) {
          state.livingStones = D.LIVING_SEED.map((s) => [...s]);
          state.livingTurn = 'B';
          state.livingLastCoord = '';
        } else if (cid === 'the-social-playground') {
          state.socialPuzzleStones = D.SOCIAL_PUZZLE_STONES.map((s) => [...s]);
          state.socialSolved = false;
          state.socialWrongHint = '';
        } else {
          state.sigStones = D.SIGNATURE_SEED.map((s) => [...s]);
          state.sigTurn = 'B';
        }
        renderCurrent();
        return;
      }

      const sigMode = event.target.closest('[data-sig-material]');
      if (sigMode) {
        state.sigPaper = sigMode.dataset.sigMaterial === 'paper';
        renderCurrent();
        return;
      }

      const actEl = event.target.closest('[data-action]');
      if (actEl) {
        const act = actEl.dataset.action;
        if (act !== 'acct-toggle' && state.accountMenuOpen) state.accountMenuOpen = false;
        if (act === 'acct-toggle') {
          state.accountMenuOpen = !state.accountMenuOpen;
          renderCurrent();
          return;
        }
        if (act === 'acct-profile') { renderCurrent(); openProfileModal(); return; }
        if (act === 'acct-social') { renderCurrent(); openChallengeModal(); return; }
        if (act === 'acct-sound') {
          state.soundOn = !state.soundOn;
          renderCurrent();
          showToast(state.soundOn ? 'Đã bật âm thanh đặt quân.' : 'Đã tắt âm thanh đặt quân.');
          return;
        }
        if (act === 'acct-logout') {
          state.authMode = 'guest';
          renderCurrent();
          showToast('Đã đăng xuất sang chế độ Khách (mô phỏng).');
          return;
        }
        if (act === 'acct-login') {
          state.authMode = 'member';
          renderCurrent();
          showToast(`Đã đăng nhập tài khoản ${D.PLAYER.name} (mô phỏng).`);
          return;
        }
        if (act === 'play') startSearch();
        else if (act === 'cancel-search') cancelSearch();
        else if (act === 'simulate-found') simulateMatchFound();
        else if (act === 'settings') openSettingsModal();
        else if (act === 'room-hub') openCreateOrJoinModal();
        else if (act === 'create-room') openCreateOrJoinModal();
        else if (act === 'challenge') openChallengeModal();
        else if (act === 'menu') openMenuModal();
        else if (act.startsWith('room-')) openRoomDialog(act.slice(5));
        else if (act.startsWith('nav-')) openNavDetail(act.slice(4));
      }
    });

    home.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-quick-code]');
      if (!form) return;
      event.preventDefault();
      const input = form.querySelector('input[name="code"]');
      const clean = (input?.value || '').trim().replace(/^#/, '').toUpperCase();
      if (!/^[A-Z0-9]{3}$/.test(clean)) {
        showToast('Nhập mã 3 ký tự, ví dụ K7M hoặc N4X.');
        input?.focus();
        return;
      }
      openRoomDialog(clean);
    });

    const dlg = modal();
    if (dlg) {
      dlg.addEventListener('click', (event) => {
        if (event.target.closest('[data-modal-close]')) { closeModal(); return; }
        const rBtn = event.target.closest('[data-cfg-rule]');
        if (rBtn) { state.rule = rBtn.dataset.cfgRule; renderCurrent(); openSettingsModal(); return; }
        if (event.target.closest('[data-cfg-wall]')) {
          state.wall = !state.wall;
          renderCurrent();
          openSettingsModal();
          return;
        }
        if (event.target.closest('[data-cfg-portal]')) { state.portal = !state.portal; renderCurrent(); openSettingsModal(); return; }
        const cBtn = event.target.closest('[data-cfg-clock]');
        if (cBtn) { state.clock = cBtn.dataset.cfgClock; renderCurrent(); openSettingsModal(); return; }
        const mBtn = event.target.closest('[data-cfg-rated]');
        if (mBtn) { state.rated = mBtn.dataset.cfgRated === 'true'; renderCurrent(); openSettingsModal(); return; }
        if (event.target.closest('[data-modal-play]')) { closeModal(); startSearch(); return; }
        if (event.target.closest('[data-open-settings]')) { openSettingsModal(); return; }
        if (event.target.closest('[data-open-challenge]')) { openChallengeModal(); return; }
        if (event.target.closest('[data-modal-create]')) { openCreateOrJoinModal(); return; }
        const navBtn = event.target.closest('[data-nav-section]');
        if (navBtn) { openNavDetail(navBtn.dataset.navSection); return; }
        const roomBtn = event.target.closest('[data-modal-room]');
        if (roomBtn) { openRoomDialog(roomBtn.dataset.modalRoom); return; }
        const toastBtn = event.target.closest('[data-toast-msg]');
        if (toastBtn) { closeModal(); showToast(toastBtn.dataset.toastMsg); }
      });

      dlg.addEventListener('submit', (event) => {
        if (event.target.id === 'r4-join-modal-form') {
          event.preventDefault();
          const code = String(new FormData(event.target).get('code') || '').trim().replace(/^#/, '').toUpperCase();
          if (!/^[A-Z0-9]{3}$/.test(code)) {
            showToast('Mã phòng cần đúng 3 ký tự chữ/số (VD: K7M).');
            return;
          }
          openRoomDialog(code);
          return;
        }
        if (event.target.id === 'r4-create-form') {
          event.preventDefault();
          const name = String(new FormData(event.target).get('name') || 'Bàn mới').trim();
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          const code = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
          state.rooms.unshift({
            code,
            name,
            host: D.PLAYER.name,
            elo: D.PLAYER.elo,
            rule: getRule().short + (state.wall ? ' · Ô khoá' : ''),
            clock: getClock().short,
            mode: state.rated ? 'Xếp hạng' : 'Giao hữu',
            open: true,
            note: 'Phòng bạn vừa mở — chờ bạn bè nhập mã',
          });
          renderCurrent();
          openRoomDialog(code);
        }
      });
    }

    document.addEventListener('click', (event) => {
      if (state.accountMenuOpen && !event.target.closest('.lv6-acct-wrap')) {
        state.accountMenuOpen = false;
        const m = document.getElementById('lv6-acct-menu');
        const b = document.querySelector('[data-action="acct-toggle"]');
        if (m) m.hidden = true;
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.accountMenuOpen) {
        state.accountMenuOpen = false;
        renderCurrent();
        document.querySelector('[data-action="acct-toggle"]')?.focus();
      }
    });

    window.addEventListener('hashchange', () => {
      state.accountMenuOpen = false;
      closeModal();
      renderCurrent();
    });
    renderCurrent();
  }

  window.Play3CR4Core = {
    state,
    registerConcepts,
    getConcepts,
    init,
  };
})();
