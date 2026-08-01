'use strict';

/**
 * room-ui.js — Room/lobby DOM rendering.
 *
 * Reads from: window.RoomState
 * Writes to:  DOM only
 *
 * Exports (on window):
 *   RoomUI.updateUI()
 *   RoomUI.renderSlot(slotNum, contentEl, cardEl)
 *   RoomUI.renderActionButtons()
 *   RoomUI.renderSettings()
 *   RoomUI.renderUsersList()
 *   RoomUI.renderScoreTable()
 *   RoomUI.renderStartModal() — Start-modal ready window (both seated, 30s countdown)
 *   RoomUI.showGameOverlay(result)
 *   window.sitDown(slot)     — onclick shim
 *   window.standUp()         — onclick shim
 *   window.confirmStart()    — onclick shim (Start modal)
 *   window.kickUser(userId)  — onclick shim
 *   window.updateSettings()  — onclick shim
 *   window.updateLocalSettings() — onclick shim
 */

(function(global) {
  'use strict';

  const S = () => global.RoomState;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const roomIdNav      = document.getElementById('room-id-nav');
  const slot1Content   = document.getElementById('slot-1-content');
  const slot2Content   = document.getElementById('slot-2-content');
  const slot1Card      = document.getElementById('slot-1');
  const slot2Card      = document.getElementById('slot-2');
  const actionButtons  = document.getElementById('action-buttons');
  const playersStrip   = document.getElementById('players-strip');
  const settingsPanel  = document.getElementById('settings-panel');
  const settingsBody   = document.getElementById('settings-body');
  const usersPanel     = document.getElementById('users-panel');
  const usersList      = document.getElementById('users-list');
  const scorePanel     = document.getElementById('score-panel');
  const scoreBody      = document.getElementById('score-body');
  const gameOverlay    = document.getElementById('game-overlay');
  const overlayResult  = document.getElementById('overlay-result');
  const overlayReason  = document.getElementById('overlay-reason');

  // ── Utilities ─────────────────────────────────────────────────────────────

  // Current UI mode — 'lite' | 'default' | 'pro' (see client/js/ui-mode.js)
  function uiMode() {
    return document.documentElement.getAttribute('data-ui-mode') || 'lite';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  // ── Main render entry ─────────────────────────────────────────────────────

  function updateUI() {
    const st = S();
    if (!st.roomData) return;

    // Nav shows the room name on desktop and the short room ID on mobile (CSS
    // swaps them) so a room identifier survives the icon-only mobile nav; the
    // title attribute carries the full name for tap/long-press either way.
    const roomName = st.roomData.roomName || st.roomData.roomId;
    roomIdNav.innerHTML = `
      <span class="topnav__room-name">${escapeHtml(roomName)}</span>
      <span class="topnav__room-code">${escapeHtml(st.roomData.roomId)}</span>
    `;
    roomIdNav.title = roomName === st.roomData.roomId
      ? roomName
      : `${roomName} (${st.roomData.roomId})`;
    document.title = `Play3CR — ${roomName}`;

    const me = st.roomData.users.find(u => u.userId === st.myUser.userId);
    st.myRole  = me ? me.role  : null;
    st.mySlot  = me ? me.slot  : null;
    st.isReady = me ? me.ready : false;

    renderSlot(1, slot1Content, slot1Card);
    renderSlot(2, slot2Content, slot2Card);
    renderPlayersStrip();
    renderActionButtons();
    renderSettings();
    renderUsersList();
    renderScoreTable();
    renderStartModal();

    if (!st.gameState) {
      GameUI.initBoard();
    }
  }

  // ── Slot rendering ────────────────────────────────────────────────────────

  function renderSlot(slotNum, contentEl, cardEl) {
    const st = S();
    const player = st.roomData.users.find(u => u.slot === slotNum);
    cardEl.classList.toggle('slot-card--active', !!player);

    if (!player) {
      const canSit = st.mySlot === null && st.roomData.state !== 'playing';
      contentEl.innerHTML = `
        <div class="slot-card__empty ${canSit ? 'slot-card__clickable' : ''}"
             ${canSit ? `onclick="sitDown(${slotNum})"` : ''}
             title="${canSit ? 'Nhấn để ngồi vào' : ''}">
          #${slotNum}
        </div>
      `;
      return;
    }

    const isMe = player.userId === st.myUser.userId;
    const roleBadge = player.role === 'host'
      ? '<span class="slot-card__role slot-card__role--host">Chủ phòng</span>'
      : '';
    const standBtn = (isMe && st.roomData.state !== 'playing')
      ? `<span class="slot-card__stand" onclick="event.stopPropagation(); standUp();" title="Rời vị trí">✕</span>`
      : '';

    contentEl.innerHTML = `
      <div class="slot-card__header">
        <div class="slot-card__name">${escapeHtml(player.displayName)}</div>
        ${standBtn}
      </div>
      <div class="slot-card__status">
        <span class="ready-dot ready-dot${player.ready ? '--ready' : ''}"></span>
        <span class="ready-text ready-text${player.ready ? '--ready' : ''}">
          ${player.ready ? t('room.ready') : t('room.not_ready')}
        </span>
        ${roleBadge}
      </div>
    `;
  }

  // ── Compact players strip (mobile, sits above the board) ──────────────────

  // On phones the right panel — including both slot cards — sits below a
  // viewport-tall board, so this one-line-per-player strip surfaces "who am I
  // playing, are they ready" without scrolling past the board. Hidden once a
  // game starts: the turn bar right above the board then carries both names.
  function renderPlayersStrip() {
    if (!playersStrip) return;
    const st = S();

    playersStrip.classList.toggle('players-strip--hidden', !!st.gameState);

    let html = '';
    for (const slotNum of [1, 2]) {
      const player = st.roomData.users.find(u => u.slot === slotNum);
      if (!player) {
        html += `
          <div class="players-strip__slot players-strip__slot--empty">
            <span class="players-strip__num">#${slotNum}</span>
            <span class="players-strip__name">${t('room.slot_empty')}</span>
          </div>
        `;
        continue;
      }
      html += `
        <div class="players-strip__slot">
          <span class="players-strip__num">#${slotNum}</span>
          <span class="players-strip__name">${escapeHtml(player.displayName)}</span>
          <span class="ready-dot ready-dot${player.ready ? '--ready' : ''}"></span>
          <span class="ready-text ready-text${player.ready ? '--ready' : ''}">
            ${player.ready ? t('room.ready') : t('room.not_ready')}
          </span>
        </div>
      `;
    }
    playersStrip.innerHTML = html;
  }

  // ── Action buttons ────────────────────────────────────────────────────────
  // Ready/Start used to live here as an inline toggle button. It's now the
  // Start modal (see renderStartModal) so this row is currently unused but
  // kept as a slot-actions extension point.

  function renderActionButtons() {
    actionButtons.innerHTML = '';
  }

  // ── Start modal (ready window) ──────────────────────────────────────────
  // Shown to both seated players once both slots are filled. The 30s
  // countdown is server-authoritative (st.roomData.readyDeadline, an epoch-ms
  // timestamp) — this just renders it locally; the server enforces it.

  let startModalCountdownHandle = null;

  function renderStartModal() {
    const st = S();
    const modal = document.getElementById('start-modal');
    if (!modal) return;

    const deadline = st.roomData ? st.roomData.readyDeadline : null;
    const visible = st.mySlot !== null && !!deadline && st.roomData.state !== 'playing';

    if (!visible) {
      modal.classList.remove('visible');
      if (startModalCountdownHandle) {
        clearInterval(startModalCountdownHandle);
        startModalCountdownHandle = null;
      }
      return;
    }

    modal.classList.add('visible');

    const btn        = document.getElementById('start-modal-btn');
    const waitingEl   = document.getElementById('start-modal-waiting');
    const countdownEl = document.getElementById('start-modal-countdown');

    if (btn)      btn.style.display      = st.isReady ? 'none'  : '';
    if (waitingEl) waitingEl.style.display = st.isReady ? ''     : 'none';

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (countdownEl) countdownEl.textContent = String(remaining);
    };
    tick();

    if (startModalCountdownHandle) clearInterval(startModalCountdownHandle);
    startModalCountdownHandle = setInterval(tick, 250);
  }

  // ── Settings rendering ────────────────────────────────────────────────────

  function getWinningRuleLabel(rule) {
    const key = rule || 'freestyle';
    return {
      freestyle: t('rule.freestyle'),
      standard:  t('rule.standard'),
      caro:      t('rule.caro'),
    }[key] || t('rule.freestyle');
  }

  function getTimerModeLabel(mode) {
    return {
      per_move: t('room.timer_per_move'),
      per_game: t('room.timer_per_game'),
      blitz:    t('room.timer_blitz'),
    }[mode] || t('room.timer_per_move');
  }

  function getTimerSettingsText(settings) {
    const base = `${settings.timerSeconds}s`;
    const inc  = settings.timerIncrementSeconds || 0;
    const mode = getTimerModeLabel(settings.timerMode);
    return settings.timerMode === 'blitz' ? `${base} + ${inc}s — ${mode}` : `${base} — ${mode}`;
  }

  // Lite guest view: the same board/rules/timer data as one plain sentence,
  // e.g. "17×17, luật Tiêu chuẩn, 60 giây mỗi nước".
  function buildSettingsSentence(settings, ruleText) {
    const inc = settings.timerIncrementSeconds || 0;
    const timerKey = {
      per_move: 'settings.timer_move_low',
      per_game: 'settings.timer_game_low',
      blitz:    'settings.timer_blitz_low',
    }[settings.timerMode] || 'settings.timer_move_low';

    return t('settings.summary', {
      board: `${settings.boardSize}×${settings.boardSize}`,
      rules: ruleText,
      timer: t(timerKey, { n: settings.timerSeconds, inc }),
    });
  }

  // Wraps a set of setting rows in a labelled section so the settings tab
  // separates room-wide game config from purely personal preferences.
  function settingsGroup(titleKey, hintKey, inner) {
    return `
      <section class="settings-group">
        <header class="settings-group__head">
          <h4 class="settings-group__title">${t(titleKey)}</h4>
          <span class="settings-group__hint">${t(hintKey)}</span>
        </header>
        <div class="settings-group__body">${inner}</div>
      </section>
    `;
  }

  // Placement mode (click-mode) now lives only in the global Settings panel
  // (see settings-panel.js) — it applies live to this room via the
  // 'clickmodechange' listener below, so it isn't duplicated here.
  function renderLocalSettingsControl() {
    const st = S();
    return `
      <div class="setting-row">
        <span class="setting-label">${t('settings.display')}</span>
        <div class="pill-group">
          <input type="radio" name="boardDisplayMode" id="bdm-paper" value="paper" ${st.boardDisplayMode === 'paper' ? 'checked' : ''} onchange="updateLocalSettings()" />
          <label for="bdm-paper">${t('settings.display_paper')}</label>
          <input type="radio" name="boardDisplayMode" id="bdm-stone" value="stone" ${st.boardDisplayMode === 'stone' ? 'checked' : ''} onchange="updateLocalSettings()" />
          <label for="bdm-stone">${t('settings.display_stone')}</label>
        </div>
      </div>
    `;
  }

  function renderSettings() {
    const st = S();
    const s = st.roomData.settings;

    if (st.myRole === 'host' && st.roomData.state !== 'playing') {
      const roomRows = `
        <div class="setting-row">
          <span class="setting-label">${t('modal.board_size')}</span>
          <div class="pill-group">
            <input type="radio" name="r-boardSize" id="r-bs-15" value="15" ${s.boardSize === 15 ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-bs-15">15×15</label>
            <input type="radio" name="r-boardSize" id="r-bs-17" value="17" ${s.boardSize === 17 ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-bs-17">17×17</label>
            <input type="radio" name="r-boardSize" id="r-bs-19" value="19" ${s.boardSize === 19 ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-bs-19">19×19</label>
            <input type="radio" name="r-boardSize" id="r-bs-20" value="20" ${s.boardSize === 20 ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-bs-20">20×20</label>
          </div>
        </div>
        <div class="setting-row">
          <div class="pill-group">
            <input type="radio" name="r-winRule" id="r-wr-freestyle" value="freestyle" ${s.winningRule === 'freestyle' || !s.winningRule ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-wr-freestyle">${t('rule.freestyle')}</label>
            <input type="radio" name="r-winRule" id="r-wr-standard" value="standard" ${s.winningRule === 'standard' ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-wr-standard">${t('rule.standard')}</label>
            <input type="radio" name="r-winRule" id="r-wr-caro" value="caro" ${s.winningRule === 'caro' ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-wr-caro">${t('rule.caro')}</label>
          </div>
        </div>
        <div class="setting-row">
          <div class="toggle-row" ${s.ruleSwap2 ? 'style="opacity:0.45"' : ''}>
            <span class="toggle-name">${t('modal.rule_wall')}</span>
            <label class="toggle-switch">
              <input type="checkbox" id="r-wall" ${s.ruleWall ? 'checked' : ''} ${s.ruleSwap2 ? 'disabled' : ''} onchange="updateSettings()" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row" ${s.ruleSwap2 ? 'style="opacity:0.45"' : ''}>
            <span class="toggle-name">${t('modal.rule_portal')}</span>
            <label class="toggle-switch">
              <input type="checkbox" id="r-portal" ${s.rulePortal ? 'checked' : ''} ${s.ruleSwap2 ? 'disabled' : ''} onchange="updateSettings()" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-row">
          <div class="pill-group">
            <input type="radio" name="r-openRule" id="r-or-none" value="none" ${!s.ruleSwap2 ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-or-none">${t('rule.none')}</label>
            <input type="radio" name="r-openRule" id="r-or-swap2" value="swap2" ${s.ruleSwap2 ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-or-swap2">Swap2</label>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">${t('modal.timer_mode')}</span>
          <div class="pill-group">
            <input type="radio" name="r-timerMode" id="r-tm-move" value="per_move" ${s.timerMode === 'per_move' ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-tm-move">${t('modal.per_move')}</label>
            <input type="radio" name="r-timerMode" id="r-tm-game" value="per_game" ${s.timerMode === 'per_game' ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-tm-game">${t('modal.per_game')}</label>
            <input type="radio" name="r-timerMode" id="r-tm-blitz" value="blitz" ${s.timerMode === 'blitz' ? 'checked' : ''} onchange="updateSettings()" />
            <label for="r-tm-blitz">${t('modal.blitz')}</label>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">${t('modal.time_label')}</span>
          <div class="timer-input">
            <input type="number" id="r-timer" value="${s.timerSeconds}" min="5" max="3600" step="5" onchange="updateSettings()" />
            <span class="unit">${t('modal.time_unit')}</span>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">${t('modal.time_plus')}</span>
          <div class="timer-input">
            <input type="number" id="r-timer-increment" value="${s.timerIncrementSeconds || 0}" min="0" max="600" step="1" onchange="updateSettings()" />
            <span class="unit">${t('modal.time_unit')}</span>
          </div>
        </div>
      `;

      settingsBody.innerHTML =
        settingsGroup('settings.group_room', 'settings.group_room_hint_host', roomRows) +
        settingsGroup('settings.group_personal', 'settings.group_personal_hint', renderLocalSettingsControl());
      settingsBody.classList.add('open');
    } else {
      const ruleNames = [];
      ruleNames.push(getWinningRuleLabel(s.winningRule));
      if (s.ruleWall)  ruleNames.push(t('room.rule_wall'));
      if (s.rulePortal) ruleNames.push(t('room.rule_portal'));
      if (s.ruleSwap2) ruleNames.push('Swap2');
      const ruleText  = ruleNames.length > 0 ? ruleNames.join(', ') : t('room.rule_basic');
      const timerText = getTimerSettingsText(s);

      // Lite: collapse the three label/value rows into one plain sentence built
      // from exactly the same data.
      const roomRows = uiMode() === 'lite'
        ? `<p class="settings-summary">${escapeHtml(buildSettingsSentence(s, ruleText))}</p>`
        : `
        <div class="settings-info">
          <div class="settings-info__row">
            <span class="settings-info__label">${t('settings.board_size')}</span>
            <span class="settings-info__value">${s.boardSize}×${s.boardSize}</span>
          </div>
          <div class="settings-info__row">
            <span class="settings-info__label">${t('settings.rules')}</span>
            <span class="settings-info__value">${ruleText}</span>
          </div>
          <div class="settings-info__row">
            <span class="settings-info__label">${t('settings.timer')}</span>
            <span class="settings-info__value">${timerText}</span>
          </div>
        </div>
      `;

      settingsBody.innerHTML =
        settingsGroup('settings.group_room', 'settings.group_room_hint_guest', roomRows) +
        settingsGroup('settings.group_personal', 'settings.group_personal_hint', renderLocalSettingsControl());
      settingsBody.classList.add('open');
    }
  }

  // ── Users / spectators list ───────────────────────────────────────────────

  function renderUsersList() {
    const st = S();
    const guests = st.roomData.users.filter(u => u.slot === null);

    // Lite hides the whole "Khán giả" tab until a spectator actually joins —
    // same empty-check that already governed the panel body, extended to the
    // tab button. Default/Pro leave the tab permanently visible.
    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-users"]');
    if (tabBtn) {
      const hideTab = uiMode() === 'lite' && guests.length === 0;
      tabBtn.style.display = hideTab ? 'none' : '';
      // Don't strand the user on a tab that just disappeared.
      if (hideTab && tabBtn.classList.contains('tab-btn--active')) {
        const chatBtn = document.querySelector('.tab-btn[data-tab="tab-chat"]');
        if (chatBtn) chatBtn.click();
      }
    }

    if (guests.length === 0) {
      usersPanel.style.display = 'none';
      return;
    }
    usersPanel.style.display = '';

    let html = '';
    for (const g of guests) {
      const kickBtn = (st.myRole === 'host' && g.userId !== st.myUser.userId && st.roomData.state !== 'playing')
        ? `<button class="btn-kick" onclick="kickUser('${escapeAttr(g.userId)}')">Mời ra</button>`
        : '';
      const hostBadge = g.role === 'host'
        ? ' <span class="slot-card__role slot-card__role--host">CP</span>'
        : '';
      html += `
        <li>
          <span class="user-name">${escapeHtml(g.displayName)}${hostBadge}</span>
          ${kickBtn}
        </li>
      `;
    }
    usersList.innerHTML = html;
  }

  // ── Score table ───────────────────────────────────────────────────────────

  function renderScoreTable() {
    const st = S();
    const rawSt = st.roomData.scoreTable || {};
    const seatedPlayers = st.roomData.users.filter(u => u.slot === 1 || u.slot === 2);

    if (seatedPlayers.length === 0 && Object.keys(rawSt).length === 0) {
      scorePanel.style.display = 'none';
      return;
    }

    // Lite waits for a result to exist — an all-zero scoreboard tells a casual
    // player nothing. Default/Pro keep the existing "visible once seated" rule.
    if (uiMode() === 'lite') {
      const hasResult = Object.values(rawSt).some(
        e => (e.win || 0) + (e.loss || 0) + (e.draw || 0) > 0
      );
      if (!hasResult) {
        scorePanel.style.display = 'none';
        return;
      }
    }

    scorePanel.style.display = '';

    const combined = { ...rawSt };
    for (const p of seatedPlayers) {
      if (!combined[p.userId]) {
        combined[p.userId] = { name: p.displayName, win: 0, loss: 0, draw: 0 };
      }
    }

    let html = '';
    for (const [, entry] of Object.entries(combined)) {
      html += `
        <tr>
          <td>${escapeHtml(entry.name || '—')}</td>
          <td>${entry.win  || 0}</td>
          <td>${entry.loss || 0}</td>
          <td>${entry.draw || 0}</td>
        </tr>
      `;
    }
    scoreBody.innerHTML = html;
  }

  // ── Game end overlay ──────────────────────────────────────────────────────

  function showGameOverlay(result) {
    const st = S();
    if (!result) return;
    if (st.mySlot === null) return; // Spectators don't see personal overlay

    const overlayIcon = document.getElementById('overlay-icon');
    let resultText, resultClass, reasonText, icon;

    if (result.winner === 'draw') {
      icon = '🤝';
      resultText  = t('overlay.draw');
      resultClass = 'game-overlay__result--draw';
      reasonText  = result.reason === 'agreement' ? t('overlay.reason_draw_agree') : t('overlay.reason_draw_full');
    } else if (result.winner === st.myUser.userId) {
      if (window.audioManager) window.audioManager.playWinSound();
      icon = '🎉';
      resultText  = t('overlay.win');
      resultClass = 'game-overlay__result--win';
      reasonText  = _getReasonText(result.reason, true);
    } else {
      if (window.audioManager) window.audioManager.playLoseSound();
      icon = '👊';
      resultText  = t('overlay.lose');
      resultClass = 'game-overlay__result--lose';
      reasonText  = _getReasonText(result.reason, false);
    }

    if (overlayIcon) overlayIcon.textContent = icon;
    overlayResult.textContent = resultText;
    overlayResult.className = 'game-overlay__result ' + resultClass;
    overlayReason.textContent = reasonText;
    gameOverlay.classList.add('visible');

    setTimeout(() => {
      if (!st.gameState && st.roomData) GameUI.initBoard();
    }, 500);
  }

  function _getReasonText(reason, isWinner) {
    switch (reason) {
      case 'win':     return t('overlay.reason_win');
      case 'resign':  return isWinner ? t('overlay.reason_resign_w')  : t('overlay.reason_resign_l');
      case 'timeout': return isWinner ? t('overlay.reason_timeout_w') : t('overlay.reason_timeout_l');
      default:        return '';
    }
  }

  // ── Lang change listener ──────────────────────────────────────────────────
  window.addEventListener('langchange', () => {
    const st = S();
    if (st.roomData) renderSettings();
  });

  // ── UI mode change listener ───────────────────────────────────────────────
  // Score table, spectators tab and the guest settings summary are all mode-
  // gated, so re-run the full panel render rather than just renderSettings().
  window.addEventListener('uimodechange', () => {
    const st = S();
    if (st.roomData) updateUI();
  });

  // ── Click-mode change listener ─────────────────────────────────────────────
  // Placement mode is set from the global Settings panel now (settings-panel.js);
  // apply it to the live board immediately, mirroring what the old in-room
  // control used to do directly in updateLocalSettings().
  window.addEventListener('clickmodechange', (e) => {
    const st = S();
    st.clickMode = e.detail.mode;
    if (st.boardRenderer) st.boardRenderer.clickMode = st.clickMode;
  });

  // ── Global onclick shims ──────────────────────────────────────────────────

  global.sitDown = function(slot) {
    global.RoomClient.emit('room:sit', { slot });
  };

  global.standUp = function() {
    S().standRequested = true; // suppress the "kicked from seat" toast for a voluntary stand
    global.RoomClient.emit('room:stand');
  };

  global.confirmStart = function() {
    global.RoomClient.emit('room:ready');
  };

  global.kickUser = function(userId) {
    global.RoomClient.emit('room:kick', { userId });
  };

  global.updateSettings = function() {
    const boardSizeEl = document.querySelector('input[name="r-boardSize"]:checked');
    const timerModeEl = document.querySelector('input[name="r-timerMode"]:checked');
    const timerEl          = document.getElementById('r-timer');
    const timerIncrementEl = document.getElementById('r-timer-increment');
    const wallEl           = document.getElementById('r-wall');
    const portalEl         = document.getElementById('r-portal');

    if (!boardSizeEl || !timerModeEl) return;

    global.RoomClient.emit('room:settings', {
      settings: {
        boardSize:             parseInt(boardSizeEl.value, 10),
        winningRule:           (document.querySelector('input[name="r-winRule"]:checked') || {}).value || 'freestyle',
        ruleWall:              wallEl   ? wallEl.checked   : false,
        rulePortal:            portalEl ? portalEl.checked : false,
        ruleSwap2:             (document.querySelector('input[name="r-openRule"]:checked') || {}).value === 'swap2',
        timerMode:             timerModeEl.value,
        timerSeconds:          timerEl          ? (parseInt(timerEl.value, 10) || 60)          : 60,
        timerIncrementSeconds: timerIncrementEl ? (parseInt(timerIncrementEl.value, 10) || 0)  : 0,
      },
    });
  };

  global.updateLocalSettings = function() {
    const st = S();
    const modeEl = document.querySelector('input[name="boardDisplayMode"]:checked');
    const mode   = modeEl ? modeEl.value : 'paper';
    st.boardDisplayMode = ['paper', 'stone'].includes(mode) ? mode : 'paper';
    localStorage.setItem('play3cr_board_display', st.boardDisplayMode);

    if (st.boardRenderer) {
      st.boardRenderer.setState({
        displayMode:  st.boardDisplayMode,
        moveHistory:  st.gameState ? (st.gameState.moveHistory || []) : [],
        lastMove:     st.gameState ? st.gameState.lastMove : null,
      });
    }
  };

  // ── Public API ────────────────────────────────────────────────────────────
  global.RoomUI = {
    updateUI,
    renderSlot,
    renderActionButtons,
    renderSettings,
    renderUsersList,
    renderScoreTable,
    renderStartModal,
    showGameOverlay,
  };

})(window);
