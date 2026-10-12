'use strict';

/**
 * room-ui.js — Room/lobby DOM rendering.
 *
 * Reads from: window.RoomState
 * Writes to:  DOM only
 *
 * Exports (on window):
 *   RoomUI.updateUI()
 *   RoomUI.renderPlayerCards() — the two player cards (opponent top, you bottom;
 *     #216) incl. their clocks; replaces the old slot cards + mobile strip
 *   RoomUI.updateCardClocks() — per-second clock/turn repaint of those cards;
 *     called from GameUI.renderTimers(), not on its own timer
 *   RoomUI.renderModeBadge() — "Giao hữu" / "Xếp hạng" in the nav
 *   RoomUI.renderSettings()
 *   RoomUI.renderUsersList()
 *   RoomUI.renderScoreTable()
 *   RoomUI.renderStartModal() — Start-modal ready window (both seated; 15s
 *     countdown only once one player clicks Start — see instruction.md §B36)
 *   window.sitDown(slot)     — onclick shim
 *   window.standUp()         — onclick shim
 *   window.confirmStart()    — onclick shim (Start modal)
 *   window.kickUser(userId)  — onclick shim
 *   window.updateSettings()  — onclick shim
 */

(function(global) {
  'use strict';

  const S = () => global.RoomState;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const roomIdNav      = document.getElementById('room-id-nav');
  const siteLinks      = document.getElementById('room-site-links');
  const cardTop        = document.getElementById('pcard-top');
  const cardBottom     = document.getElementById('pcard-bottom');
  const modeBadge      = document.getElementById('room-mode-badge');
  const settingsPanel  = document.getElementById('settings-panel');
  const settingsBody   = document.getElementById('settings-body');
  const usersPanel     = document.getElementById('users-panel');
  const usersList      = document.getElementById('users-list');
  const scoreBody      = document.getElementById('score-body');

  // ── Utilities ─────────────────────────────────────────────────────────────

  // Best estimate of the server's clock. room-socket.js owns the offset (it
  // updates on every timer:sync AND every room:joined/room:updated, so it is
  // populated during the ready phase too — TODO.md #170). Falls back to the
  // local clock when room-socket.js has not finished loading, which is exactly
  // the pre-#170 behaviour.
  function serverNow() {
    const rs = global.RoomSocket;
    return (rs && typeof rs.serverNow === 'function') ? rs.serverNow() : Date.now();
  }

  // Current UI mode — 'lite' | 'default'. Delegates to ui-mode.js so the
  // 'pro' → 'default' normalisation lives in exactly one place.
  function uiMode() {
    return (global.getUiMode && global.getUiMode()) || 'lite';
  }

  // Bounce the user back to the Chat tab when the tab they are on disappears.
  // window.RoomTabs is published by room.js, which room-entry.js loads before
  // this file; the click fallback only matters if that order ever changes.
  function activateChatTab() {
    if (window.RoomTabs && typeof window.RoomTabs.activate === 'function') {
      window.RoomTabs.activate('tab-chat');
      return;
    }
    const chatBtn = document.querySelector('.tab-btn[data-tab="tab-chat"]');
    if (chatBtn) chatBtn.click();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Escaping lives in escape-utils.js (a pure, Node-testable module imported by
  // room-entry.js before this file). These are thin aliases so the call sites
  // below read the same as before.
  const escapeAttr = (str) => global.EscapeUtils.escapeAttr(str);

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

    // Site links leave the room, so a seated player loses them mid-game (same
    // condition as the Rời phòng confirm in room.js) — #191 item 6.
    if (siteLinks) siteLinks.hidden = !!(st.gameState && st.gameState.status === 'ongoing' && st.mySlot !== null);

    renderPlayerCards();
    renderModeBadge();
    renderSettings();
    renderUsersList();
    renderScoreTable();
    renderStartModal();

    if (!st.gameState) {
      GameUI.initBoard();
    }
  }

  // ── Slot status (name + a single 4-state dot) ───────────────────────────────

  // Active/Inactive reflect whether THIS PLAYER's game has actually started
  // (room.state === 'playing'), not the pre-game `ready` checkbox — `ready`
  // resets to false the instant a game starts (see GameHandler.js's
  // startGame()), so using it here made the dot fall back to "not ready" the
  // moment play began (TODO.md #114). `ready` still exists and is read
  // elsewhere (the Start-modal ready window) — it's just not a status-dot
  // signal any more.
  // Red ('disconnected') and amber ('away') are presence states reported by
  // the server (see RoomManager.setPresence / DisconnectHandler.js) —
  // 'disconnected' (socket actually dropped, grace period running) always
  // wins over 'away' (tab still open, just not the active/visible one) which
  // always wins over the Active/Inactive pair, since a player who isn't even
  // present can't meaningfully be "playing".
  function playerStatusInfo(player) {
    if (player.presence === 'disconnected') {
      return { modifier: '--disconnected', label: t('room.status_disconnected') };
    }
    if (player.presence === 'away') {
      return { modifier: '--away', label: t('room.status_away') };
    }
    if (S().roomData.state === 'playing') {
      return { modifier: '--active', label: t('room.status_active') };
    }
    return { modifier: '', label: t('room.status_waiting') };
  }

  // Symbol only, no visible text — a colored dot is the whole status display
  // (space/noise tradeoff the user asked for explicitly). The label still
  // exists for hover (title) and screen readers (aria-label), just not as
  // rendered text.
  function renderStatusDot(player) {
    const status = playerStatusInfo(player);
    return `<span class="ready-dot ready-dot${status.modifier}" role="img" aria-label="${escapeAttr(status.label)}" title="${escapeAttr(status.label)}"></span>`;
  }

  // ── Player cards (#216) ───────────────────────────────────────────────────
  //
  // Two cards frame the board: the opponent on top, you at the bottom, each with
  // its own clock — the clock sits next to the player it belongs to, so a glance
  // at the bottom card answers "how much time do I have". A spectator sees seat
  // #2 on top and seat #1 at the bottom. One renderer for desktop and phone (the
  // old slot cards + mobile players strip + desktop turn bar were three).

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    const a = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
    return a.toUpperCase();
  }

  function seatOrder() {
    const st = S();
    const bottom = st.mySlot === 2 ? 2 : 1;
    return { top: bottom === 1 ? 2 : 1, bottom };
  }

  // Which of the two server clocks ('black'/'white') is this player's, and which
  // piece to draw for them. During a Swap2 opening the clocks are already keyed by
  // firstPlayerId/secondPlayerId (instruction.md §B37) while the colour is not
  // decided yet — the piece stays neutral instead of guessing.
  function playerClock(player) {
    const gs = S().gameState;
    if (!gs) return { key: null, stone: 'none' };
    const gp = gs.players.find(p => p.userId === player.userId);
    if (gp && gp.color) {
      const key = gp.color === 'BLACK' ? 'black' : 'white';
      return { key, stone: key };
    }
    const swap2 = gs.swap2;
    if (swap2 && swap2.enabled && !swap2.colorsAssigned) {
      if (player.userId === swap2.firstPlayerId)  return { key: 'black', stone: 'none' };
      if (player.userId === swap2.secondPlayerId) return { key: 'white', stone: 'none' };
    }
    return { key: null, stone: 'none' };
  }

  function renderCard(el, slotNum) {
    const st = S();
    const player = st.roomData.users.find(u => u.slot === slotNum);
    el.dataset.slot = String(slotNum);
    el.classList.remove('pcard--turn', 'pcard--low');
    if (!player) {
      const canSit = st.mySlot === null && st.roomData.state !== 'playing';
      el.classList.add('pcard--empty');
      delete el.dataset.clock;
      el.innerHTML = canSit
        ? `<button class="pcard__sit" type="button" data-action="sitDown" data-arg="${slotNum}" data-arg-type="number">${t('room.sit')} · #${slotNum}</button>`
        : `<span class="pcard__seat">#${slotNum}</span><span class="pcard__empty">${t('room.slot_empty')}</span>`;
      return;
    }
    el.classList.remove('pcard--empty');
    const isMe = player.userId === st.myUser.userId;
    const clock = playerClock(player);
    const live = !!st.gameState && clock.key !== null;
    if (live) el.dataset.clock = clock.key; else delete el.dataset.clock;
    const piece = clock.stone !== 'none' && typeof global.boardPieceSvg === 'function'
      ? global.boardPieceSvg(clock.stone === 'black' ? 1 : 2, 'pcard__piece')
      : '';
    const standBtn = (isMe && st.roomData.state !== 'playing')
      ? `<button class="pcard__stand" type="button" data-action="standUp" title="${escapeAttr(t('room.stand_up'))}" aria-label="${escapeAttr(t('room.stand_up'))}"><svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=338#ph-regular-x"></use></svg></button>`
      : '';
    el.innerHTML = `
      <div class="pcard__av${isMe ? ' pcard__av--me' : ''}" aria-hidden="true">${avatarInner(player)}${piece}</div>
      <div class="pcard__id">
        <div class="pcard__name">${escapeHtml(player.displayName)}</div>
        <div class="pcard__meta">${renderStatusDot(player)}</div>
      </div>
      ${standBtn}
      ${live ? `<div class="pcard__clock" data-clock-text></div>` : ''}
    `;
    // CSP forbids inline onerror — fall back to initials from here.
    const img = el.querySelector('.pcard__img');
    if (img) img.addEventListener('error', () => img.replaceWith(document.createTextNode(img.dataset.ini)), { once: true });
  }

  // Uploaded avatar when the member has one; initials otherwise (and if the image fails to load).
  function avatarInner(player) {
    const ini = escapeHtml(initials(player.displayName));
    const url = player.avatarUrl;
    if (!url || !/^\/api\/profile\/avatar\/[\w-]+\.webp\?v=\d+$/.test(url)) return ini;
    return `<img class="pcard__img" src="${escapeAttr(url)}" alt="" data-ini="${ini}">`;
  }

  function renderPlayerCards() {
    if (!cardTop || !cardBottom) return;
    const { top, bottom } = seatOrder();
    renderCard(cardTop, top);
    renderCard(cardBottom, bottom);
    updateCardClocks();
  }

  // #155/#165/#166 — the clock numbers and whose-turn marker come from
  // GameUI.effectiveTimerValues/effectiveTurnColor (predicted turn + transit
  // shave), so every surface shows the same numbers. Degrades to raw state if
  // game-ui.js is not loaded yet.
  function cardTimerValues() {
    if (global.GameUI && typeof global.GameUI.effectiveTimerValues === 'function') {
      return global.GameUI.effectiveTimerValues();
    }
    return S().timerValues || { black: 0, white: 0 };
  }
  function cardTurnColor() {
    if (global.GameUI && typeof global.GameUI.effectiveTurnColor === 'function') {
      return global.GameUI.effectiveTurnColor();
    }
    return null;
  }

  // Always 'M:SS' in tabular digits: a string that shrinks from "1:00" to "53"
  // would resize the clock box every minute boundary.
  function formatClock(seconds) {
    if (!(seconds > 0)) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Per-second repaint: mutates text/classes only (no rebuild), called from the
  // single tick path (room-socket.js tickLocal → GameUI.renderTimers).
  function updateCardClocks() {
    const st = S();
    if (!st.gameState) return;
    const vals = cardTimerValues();
    const turnColor = cardTurnColor();
    for (const el of [cardTop, cardBottom]) {
      if (!el) continue;
      const key = el.dataset.clock;
      if (!key) continue;
      const remaining = Number(vals[key]) || 0;
      const textEl = el.querySelector('[data-clock-text]');
      if (textEl) textEl.textContent = formatClock(remaining);
      const isTurn = !!turnColor && turnColor === key.toUpperCase();
      el.classList.toggle('pcard--turn', isTurn);
      el.classList.toggle('pcard--low', remaining <= 10 && st.gameState.status === 'ongoing');
    }
  }

  // "Giao hữu" (friendly: undo + extra time allowed) or "Xếp hạng" (rated) —
  // the effective rule the server enforces (RatingService.isRatedSetup): a
  // ranked room with a guest seated is friendly. Live games carry `rated`.
  function isRatedNow() {
    const st = S();
    if (st.gameState && typeof st.gameState.rated === 'boolean') return st.gameState.rated;
    const s = st.roomData.settings || {};
    const seated = st.roomData.users.filter(u => u.slot === 1 || u.slot === 2);
    return s.ranked !== false && !seated.some(u => u.isGuest);
  }

  function renderModeBadge() {
    if (!modeBadge) return;
    const rated = isRatedNow();
    modeBadge.hidden = false;
    modeBadge.className = 'mode-badge ' + (rated ? 'mode-badge--rated' : 'mode-badge--friendly');
    modeBadge.innerHTML = `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=338#ph-regular-${rated ? 'trophy' : 'handshake'}"></use></svg><span>${t(rated ? 'room.mode_rated' : 'room.mode_friendly')}</span>`;
  }

  // ── Start modal (ready window) ──────────────────────────────────────────
  // Shown to both seated players once both slots are filled — this is a
  // waiting state, not a countdown yet: no timer runs until one of the two
  // clicks Start. Only then does the server open a 15s countdown for the
  // other seat (st.roomData.readyDeadline, an epoch-ms timestamp, null while
  // waiting). See instruction.md §B36. The modal itself never blocks clicks
  // on the board/seats/chat underneath — see .start-modal in game.css.

  let startModalCountdownHandle = null;

  function renderStartModal() {
    const st = S();
    const modal = document.getElementById('start-modal');
    if (!modal) return;

    const bothSeated = st.roomData.users.some(u => u.slot === 1)
      && st.roomData.users.some(u => u.slot === 2);
    const visible = st.mySlot !== null && bothSeated && st.roomData.state !== 'playing';

    // Quick-match rooms play exactly one game: no Start modal, each page readies itself.
    if (st.roomData.matchmade) {
      if (st.roomData.state === 'playing') st.matchGameSeen = true;
      // room:updated can render several times before the server acks; one emit per 3s (a missed ready
      // window clears isReady and is retried after that).
      if (visible && !st.isReady && !st.matchGameSeen && Date.now() - (st.matchReadyAt || 0) > 3000) {
        st.matchReadyAt = Date.now();
        global.confirmStart();
      }
      modal.classList.remove('visible');
      // One game done: make the leave button the obvious next step.
      const leave = document.getElementById('btn-leave');
      if (leave) leave.classList.toggle('is-cta', !!st.matchGameSeen && st.roomData.state !== 'playing');
      return;
    }

    const countdownWrap = document.getElementById('start-modal-countdown-wrap');

    if (!visible) {
      modal.classList.remove('visible');
      if (startModalCountdownHandle) {
        clearInterval(startModalCountdownHandle);
        startModalCountdownHandle = null;
      }
      return;
    }

    modal.classList.add('visible');

    const btn         = document.getElementById('start-modal-btn');
    const waitingEl    = document.getElementById('start-modal-waiting');
    const countdownEl  = document.getElementById('start-modal-countdown');

    if (btn)      btn.style.display      = st.isReady ? 'none'  : '';
    if (waitingEl) waitingEl.style.display = st.isReady ? ''     : 'none';

    const deadline = st.roomData.readyDeadline;

    // Nobody has clicked Start yet — no countdown to show.
    if (!deadline) {
      if (countdownWrap) countdownWrap.style.display = 'none';
      if (startModalCountdownHandle) {
        clearInterval(startModalCountdownHandle);
        startModalCountdownHandle = null;
      }
      return;
    }

    if (countdownWrap) countdownWrap.style.display = '';

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
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

  // The board look (style, colours, coordinates) is edited only in Settings ›
  // Giao diện › Bàn cờ and shared by every board (#216); this tab links there.
  function renderLocalSettingsControl() {
    const preview = typeof global.boardPreviewSvg === 'function' && global.BoardPrefs
      ? (() => { const p = global.BoardPrefs.get(); return global.boardPreviewSvg(p.theme, p[p.theme]); })()
      : '';
    return `
      <a class="board-look-link" href="/settings.html?return=${encodeURIComponent(location.pathname + location.search)}#look">
        <span class="board-look-link__pv">${preview}</span>
        <span class="board-look-link__t"><b>${t('room.board_look')}</b><small>${t('room.board_look_hint')}</small></span>
        <svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=338#ph-regular-caret-right"></use></svg>
      </a>
    `;
  }

  function renderSettings() {
    const st = S();
    const s = st.roomData.settings;

    if (st.myRole === 'host' && st.roomData.state !== 'playing') {
      // A seated guest can't be rated (server no-ops), so the toggle is shown
      // disabled with its stored value rather than hidden (TODO.md #182).
      const rankedBlocked = st.roomData.users.some(u => u.slot !== null && u.isGuest);
      const roomRows = `
        <div class="setting-row">
          <span class="setting-label">${t('modal.board_size')}</span>
          <div class="pill-group">
            <input type="radio" name="r-boardSize" id="r-bs-15" value="15" ${s.boardSize === 15 ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-bs-15">15×15</label>
            <input type="radio" name="r-boardSize" id="r-bs-17" value="17" ${s.boardSize === 17 ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-bs-17">17×17</label>
            <input type="radio" name="r-boardSize" id="r-bs-19" value="19" ${s.boardSize === 19 ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-bs-19">19×19</label>
            <input type="radio" name="r-boardSize" id="r-bs-20" value="20" ${s.boardSize === 20 ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-bs-20">20×20</label>
          </div>
        </div>
        <div class="setting-row">
          <div class="pill-group">
            <input type="radio" name="r-winRule" id="r-wr-freestyle" value="freestyle" ${s.winningRule === 'freestyle' || !s.winningRule ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-wr-freestyle">${t('rule.freestyle')}</label>
            <input type="radio" name="r-winRule" id="r-wr-standard" value="standard" ${s.winningRule === 'standard' ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-wr-standard">${t('rule.standard')}</label>
            <input type="radio" name="r-winRule" id="r-wr-caro" value="caro" ${s.winningRule === 'caro' ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-wr-caro">${t('rule.caro')}</label>
          </div>
        </div>
        <div class="setting-row">
          <div class="toggle-row" ${s.ruleSwap2 ? 'style="opacity:0.45"' : ''}>
            <span class="toggle-name">${t('modal.rule_wall')}</span>
            <label class="toggle-switch">
              <input type="checkbox" id="r-wall" aria-label="${t('modal.rule_wall')}" ${s.ruleWall ? 'checked' : ''} ${s.ruleSwap2 ? 'disabled' : ''} data-change-action="updateSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="toggle-row" ${s.ruleSwap2 ? 'style="opacity:0.45"' : ''}>
            <span class="toggle-name">${t('modal.rule_portal')}</span>
            <label class="toggle-switch">
              <input type="checkbox" id="r-portal" aria-label="${t('modal.rule_portal')}" ${s.rulePortal ? 'checked' : ''} ${s.ruleSwap2 ? 'disabled' : ''} data-change-action="updateSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-row">
          <div class="pill-group">
            <input type="radio" name="r-openRule" id="r-or-none" value="none" ${!s.ruleSwap2 ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-or-none">${t('rule.none')}</label>
            <input type="radio" name="r-openRule" id="r-or-swap2" value="swap2" ${s.ruleSwap2 ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-or-swap2">Swap2</label>
          </div>
        </div>
        <div class="setting-row">
          <div class="toggle-row" ${rankedBlocked ? 'style="opacity:0.45"' : ''}>
            <span class="toggle-name">${t('room.ranked')}${rankedBlocked ? ` <small>(${t('room.ranked_guest_hint')})</small>` : ''}</span>
            <label class="toggle-switch">
              <input type="checkbox" id="r-ranked" aria-label="${t('room.ranked')}" ${s.ranked !== false ? 'checked' : ''} ${rankedBlocked ? 'disabled' : ''} data-change-action="updateSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">${t('modal.timer_mode')}</span>
          <div class="pill-group">
            <input type="radio" name="r-timerMode" id="r-tm-move" value="per_move" ${s.timerMode === 'per_move' ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-tm-move">${t('modal.per_move')}</label>
            <input type="radio" name="r-timerMode" id="r-tm-game" value="per_game" ${s.timerMode === 'per_game' ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-tm-game">${t('modal.per_game')}</label>
            <input type="radio" name="r-timerMode" id="r-tm-blitz" value="blitz" ${s.timerMode === 'blitz' ? 'checked' : ''} data-change-action="updateSettings" />
            <label for="r-tm-blitz">${t('modal.blitz')}</label>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">${t('modal.time_label')}</span>
          <div class="timer-input">
            <input type="number" id="r-timer" value="${s.timerSeconds}" min="5" max="3600" step="5" data-change-action="updateSettings" />
            <span class="unit">${t('modal.time_unit')}</span>
          </div>
        </div>
        <div class="setting-row" style="${s.timerMode === 'blitz' ? '' : 'opacity:0.45;'}">
          <span class="setting-label">${t('modal.time_plus')}</span>
          <div class="timer-input">
            <input type="number" id="r-timer-increment" value="${s.timerIncrementSeconds || 0}" min="0" max="600" step="1" ${s.timerMode === 'blitz' ? '' : 'disabled'} data-change-action="updateSettings" />
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
      const scorePanel = document.getElementById('score-panel');
      const hideTab = uiMode() === 'lite' && guests.length === 0 && !(scorePanel && !scorePanel.hidden);
      tabBtn.style.display = hideTab ? 'none' : '';
      // Don't strand the user on a tab that just disappeared. Say "show the
      // chat tab", not "pretend the user clicked the chat button": the click
      // handler in room.js also owns the zen drawer's collapse toggle, and a
      // synthetic click walked straight into it (TODO.md #136).
      if (hideTab && tabBtn.classList.contains('tab-btn--active')) {
        activateChatTab();
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
        ? `<button class="btn-kick" data-action="kickUser" data-arg="${escapeAttr(g.userId)}">Mời ra</button>`
        : '';
      const hostBadge = g.role === 'host'
        ? ' <span class="slot-card__role slot-card__role--host">CP</span>'
        : '';
      // Only render a dot for the non-default presence states — a normally
      // connected guest stays unmarked (same noise tradeoff as renderStatusDot
      // above). Without this, a viewer whose socket dropped (no reconnect
      // timeout for viewers — TODO.md #115) looked identical to one actually
      // present, since the server-side `presence` field wasn't read here at all.
      const statusDot = (g.presence === 'disconnected' || g.presence === 'away')
        ? renderStatusDot(g)
        : '';
      html += `
        <li>
          <span class="user-name-group">
            <span class="user-name">${escapeHtml(g.displayName)}${hostBadge}</span>
            ${statusDot}
          </span>
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

    // Score panel lives in its own tab (not fixed above the tabs — B116);
    // same "hide the tab button until there's something to show, and bounce
    // off it if it was active when it disappears" rule already used for
    // tab-users above.
    let hasData = !(seatedPlayers.length === 0 && Object.keys(rawSt).length === 0);

    // Lite waits for a result to exist — an all-zero scoreboard tells a casual
    // player nothing. Default/Pro keep the existing "visible once seated" rule.
    if (hasData && uiMode() === 'lite') {
      const hasResult = Object.values(rawSt).some(
        e => (e.win || 0) + (e.loss || 0) + (e.draw || 0) > 0
      );
      hasData = hasResult;
    }

    // Lives at the top of the Khán giả tab since #216 (no tab of its own).
    const panel = document.getElementById('score-panel');
    if (panel) panel.hidden = !hasData;

    if (!hasData) return;

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

  // ── Board look changed (Settings, another tab) — the board redraws itself;
  // the cards' piece icons and the settings-tab preview follow here. ──
  window.addEventListener('boardprefschange', () => {
    const st = S();
    if (!st.roomData) return;
    renderPlayerCards();
    renderSettings();
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
    const rankedEl         = document.getElementById('r-ranked');

    if (!boardSizeEl || !timerModeEl) return;

    const timerMode = timerModeEl.value;

    global.RoomClient.emit('room:settings', {
      settings: {
        boardSize:             parseInt(boardSizeEl.value, 10),
        winningRule:           (document.querySelector('input[name="r-winRule"]:checked') || {}).value || 'freestyle',
        ruleWall:              wallEl   ? wallEl.checked   : false,
        rulePortal:            portalEl ? portalEl.checked : false,
        ruleSwap2:             (document.querySelector('input[name="r-openRule"]:checked') || {}).value === 'swap2',
        ranked:                rankedEl ? rankedEl.checked : true,
        timerMode,
        timerSeconds:          timerEl          ? (parseInt(timerEl.value, 10) || 60)          : 60,
        // Increment only takes effect in blitz mode (TimerManager.applyMove) —
        // zero it out otherwise so the stored setting doesn't imply it's active.
        timerIncrementSeconds: (timerMode === 'blitz' && timerIncrementEl) ? (parseInt(timerIncrementEl.value, 10) || 0) : 0,
      },
    });
  };

  // Touch devices: tapping anywhere that isn't a text field (or the send button,
  // so chatting keeps the keyboard up) blurs the focused field and closes the keyboard.
  function installOutsideTapBlur(doc) {
    doc.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const a = doc.activeElement;
      if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
      if (e.target.closest && e.target.closest('input, textarea, select, #btn-send')) return;
      a.blur();
    }, { passive: true });
  }

  // Mobile sticky stack needs the board's rendered height (CSS can't read a sibling's size).
  function trackBoardHeight(doc) {
    const shell = doc.getElementById('board-area-shell');
    if (!shell || typeof global.ResizeObserver !== 'function') return;
    const set = () => {
      const h = shell.getBoundingClientRect().height;
      if (h > 0) doc.documentElement.style.setProperty('--board-h', h + 'px');
    };
    new global.ResizeObserver(set).observe(shell);
    set();
  }

  if (global.document && !global.__outsideTapBlurInstalled) {
    trackBoardHeight(global.document);
    global.__outsideTapBlurInstalled = true;
    installOutsideTapBlur(global.document);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.RoomUI = {
    installOutsideTapBlur,
    trackBoardHeight,
    updateUI,
    renderPlayerCards,
    updateCardClocks,
    renderModeBadge,
    renderSettings,
    renderUsersList,
    renderScoreTable,
    renderStartModal,
  };

})(window);
