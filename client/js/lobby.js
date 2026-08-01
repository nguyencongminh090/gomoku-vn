'use strict';

/**
 * lobby.js — Lobby UI controller.
 *
 * Responsibilities:
 *   - Render live room list from server
 *   - Create room modal (collect settings → emit room:create)
 *   - Join room (emit room:join → redirect to room page)
 *   - Display user info in the nav
 *
 * Logout now lives in the global Settings panel (see settings-panel.js).
 *
 * Manual test checklist:
 *   [ ] No token → redirect to login
 *   [ ] Room list renders on lobby:update
 *   [ ] Empty state shows "Chưa có phòng nào"
 *   [ ] Create room modal opens/closes
 *   [ ] room:create emits correct settings payload
 *   [ ] room:joined → stores roomId → redirects to room.html
 *   [ ] room:error shows alert
 */

// ---------------------------------------------------------------------------
// Auth guard: redirect if no token
// ---------------------------------------------------------------------------
(function authGuard() {
  const token = localStorage.getItem('gvn_token');
  if (!token) {
    window.location.replace('login.html');
    return;
  }
})();

// ---------------------------------------------------------------------------
// Initialize Socket.io client
// ---------------------------------------------------------------------------
const client = new SocketClient();

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const statusBanner  = document.getElementById('status-banner');
const navUser       = document.getElementById('nav-user');
const navBadge      = document.getElementById('nav-badge');
const roomCount     = document.getElementById('room-count');
const roomListEl    = document.getElementById('room-list');
const btnCreate     = document.getElementById('btn-create');
const modalOverlay  = document.getElementById('modal-create');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
const btnQuickMatch = document.getElementById('btn-quick-match');
const btnUseLast    = document.getElementById('btn-use-last');
const modalAdvancedToggle = document.getElementById('modal-advanced-toggle');
let currentRooms = [];

// Current UI mode — 'lite' | 'default' | 'pro' (see client/js/ui-mode.js)
function uiMode() {
  return document.documentElement.getAttribute('data-ui-mode') || 'lite';
}

// ---------------------------------------------------------------------------
// Display user info in nav
// ---------------------------------------------------------------------------
const userInfo = client.getUserInfo();
if (userInfo) {
  navUser.textContent = userInfo.displayName;
  navBadge.textContent = userInfo.isGuest ? t('nav.guest_badge') : '';
  navBadge.style.display = userInfo.isGuest ? '' : 'none';
}

// Bind status banner
client.bindStatusBanner(statusBanner);

// ---------------------------------------------------------------------------
// Subscribe to lobby updates
// ---------------------------------------------------------------------------
client.emit('lobby:subscribe');

client.on('lobby:update', (data) => {
  currentRooms = data.rooms || [];
  renderRoomList(currentRooms);
});

// ── Online Users Panel ──────────────────────────────────────────────────────
const onlineCountEl     = document.getElementById('online-count');
const onlinePanelCount  = document.getElementById('online-panel-count');
const onlinePanelToggle = document.getElementById('online-panel-toggle');
const onlinePanelBody   = document.getElementById('online-panel-body');
const onlineUserList    = document.getElementById('online-user-list');

// Toggle panel open/close — suppressed in Lite, which shows the count only.
if (onlinePanelToggle) {
  onlinePanelToggle.addEventListener('click', () => {
    if (uiMode() === 'lite') return;
    onlinePanelToggle.classList.toggle('open');
    onlinePanelBody.classList.toggle('open');
  });
}

// Lite collapses the online panel to a bare "N online" count: no expandable
// list, no click-to-expand affordance. The `online-panel--lite` class drops the
// chevron and the pointer/hover affordances via CSS.
function applyOnlinePanelMode() {
  const panel = document.getElementById('online-panel');
  if (!panel) return;
  const lite = uiMode() === 'lite';
  panel.classList.toggle('online-panel--lite', lite);
  if (lite) {
    onlinePanelToggle.classList.remove('open');
    onlinePanelBody.classList.remove('open');
  }
}
applyOnlinePanelMode();

client.on('lobby:online_users', (users) => {
  const count = users.length;

  // Update header badge
  if (onlineCountEl) {
    onlineCountEl.textContent = `— ${count} online`;
  }
  if (onlinePanelCount) {
    onlinePanelCount.textContent = count;
  }

  // Render user list
  if (onlineUserList) {
    if (count === 0) {
      onlineUserList.innerHTML = '<li style="color:var(--c-ink-3);font-style:italic;">Không có ai online</li>';
    } else {
      onlineUserList.innerHTML = users.map((name, i) => {
        const animDelay = (i * 0.05).toFixed(2);
        return `<li class="animate-fade-up" style="animation-delay: ${animDelay}s">${escapeHtml(name)}</li>`;
      }).join('');
    }
  }
});

client.on('room:error', (data) => {
  alert(data.message);
});

// Auto-redirect if server detects we are already in a room
client.on('room:joined', (data) => {
  window.location.replace(`room.html?id=${encodeURIComponent(data.roomId)}`);
});

// ---------------------------------------------------------------------------
// Room List Rendering
// ---------------------------------------------------------------------------

function renderRoomList(rooms) {
  roomCount.textContent = rooms.length > 0 ? `(${rooms.length})` : '';

  if (rooms.length === 0) {
    roomListEl.innerHTML = `
      <div class="room-list__empty">
        <div class="room-list__empty-icon">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="56" height="56" rx="14" fill="var(--c-surface-2)"/>
            <line x1="14" y1="14" x2="14" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="22" y1="14" x2="22" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="30" y1="14" x2="30" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="38" y1="14" x2="38" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="14" x2="42" y2="14" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="22" x2="42" y2="22" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="30" x2="42" y2="30" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="38" x2="42" y2="38" stroke="var(--c-border)" stroke-width="1.5"/>
            <circle cx="22" cy="22" r="5.5" fill="var(--c-ink-2)"/>
            <circle cx="30" cy="30" r="5.5" fill="var(--c-surface)" stroke="var(--c-border)" stroke-width="1.5"/>
            <circle cx="38" cy="22" r="5.5" fill="var(--c-brand)" opacity="0.7"/>
          </svg>
        </div>
        <span class="room-list__empty-text">${t('lobby.no_rooms')}</span>
        <span class="room-list__empty-sub">${t('lobby.no_rooms_sub')}</span>
      </div>
    `;
    return;
  }

  let html = '<div class="room-cards">';

  let i = 0;
  for (const room of rooms) {
    const stateLabel = getStateLabel(room.state, room.playerCount);
    const stateClass = getStateClass(room.state, room.playerCount);
    const ruleChip   = buildRuleChip(room);

    const animDelay = (i * 0.05).toFixed(2);
    html += `
      <div class="room-card animate-fade-up" data-room-id="${escapeAttr(room.roomId)}" style="animation-delay: ${animDelay}s">
        <div class="room-card__body">
          <div class="room-card__title">${escapeHtml(room.roomName || room.roomId)}</div>
          <div class="room-card__meta">
            <span class="room-card__host">${escapeHtml(room.hostName)}</span>
            <span class="room-card__dot" aria-hidden="true">·</span>
            <span class="player-count ${room.playerCount >= 2 ? 'player-count--full' : 'player-count--open'}">${room.playerCount}/2</span>
            <span class="room-card__dot" aria-hidden="true">·</span>
            <span class="room-card__id">${escapeHtml(room.roomId)}</span>
          </div>
          <div class="room-card__chips">
            <span class="state-badge ${stateClass}">${stateLabel}</span>
            ${ruleChip}
          </div>
        </div>
        <button class="btn-join" onclick="joinRoom('${escapeAttr(room.roomId)}')" type="button">
          ${t('lobby.btn_join')}
        </button>
      </div>
    `;
    i++;
  }

  html += '</div>';
  roomListEl.innerHTML = html;
}

function getStateLabel(state, playerCount) {
  if (state === 'playing') return t('lobby.state_playing');
  if (state === 'interrupted') return t('lobby.state_interrupted');
  if (playerCount >= 2) return t('lobby.state_ready');
  return t('lobby.state_waiting');
}

function getStateClass(state, playerCount) {
  if (state === 'playing') return 'state-badge--playing';
  if (playerCount >= 2) return 'state-badge--waiting';
  return 'state-badge--idle';
}

// Lite/Default: one plain-language summary chip instead of the jargon tag
// cluster (Wall / Portal / Swap2 / Caro).
// Pro: the full tag breakdown, restoring the detail Default collapses.
function buildRuleChip(room) {
  if (uiMode() === 'pro') return buildRuleTags(room);

  const isCustom = !!(room.ruleWall || room.rulePortal || room.ruleSwap2)
    || (room.winningRule || 'freestyle') !== 'freestyle';
  const label = isCustom ? t('lobby.rules_custom') : t('lobby.rules_standard');
  const cls   = isCustom ? 'rule-chip rule-chip--custom' : 'rule-chip';
  return `<span class="${cls}">${label} · ${room.boardSize}×${room.boardSize}</span>`;
}

// Pro-mode tag breakdown. Rendered as individual `.rule-tag`s inside the same
// `.room-card` chip row — the row wraps, so this never reintroduces the
// table-cell wrapping bug the card layout was built to fix.
function buildRuleTags(room) {
  let tags = `<span class="rule-tag rule-tag--size">${room.boardSize}×${room.boardSize}</span>`;
  if (room.ruleWall)   tags += `<span class="rule-tag rule-tag--wall">${t('modal.rule_wall')}</span>`;
  if (room.rulePortal) tags += `<span class="rule-tag rule-tag--portal">${t('modal.rule_portal')}</span>`;
  if (room.ruleSwap2)  tags += '<span class="rule-tag rule-tag--swap2">Swap2</span>';
  const win = room.winningRule || 'freestyle';
  if (win === 'standard') tags += `<span class="rule-tag rule-tag--win">${t('rule.standard')}</span>`;
  if (win === 'caro')     tags += `<span class="rule-tag rule-tag--win">${t('rule.caro')}</span>`;
  if (win === 'freestyle') tags += `<span class="rule-tag">${t('rule.freestyle')}</span>`;
  return tags;
}

window.addEventListener('langchange', () => {
  renderRoomList(currentRooms);
});

window.addEventListener('uimodechange', () => {
  renderRoomList(currentRooms);
  applyOnlinePanelMode();
  applyModalMode();
});

// ---------------------------------------------------------------------------
// Join Room
// ---------------------------------------------------------------------------
// Exposed globally for onclick
window.joinRoom = function(roomId) {
  // Store intent and navigate — room.js will handle the actual join
  sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'join', roomId }));
  window.location.href = `room.html?id=${encodeURIComponent(roomId)}`;
};

// ---------------------------------------------------------------------------
// Create Room Modal
// ---------------------------------------------------------------------------

function openModal() {
  if (uiMode() === 'lite') {
    // Lite is a one-click, low-decision path — always start from the fixed
    // Lite preset rather than recalling last-used settings (that recall is
    // a Pro-only affordance via "Use last settings"). The user can still
    // open Advanced and tweak before hitting Quick Match/Confirm.
    applySettingsToForm(LITE_DEFAULT_SETTINGS);
  } else {
    const last = loadLastSettings();
    if (last) applySettingsToForm(last); // so Quick match/Confirm reflect the real form state
  }
  applyModalMode(); // re-checks last-used settings, which may have appeared since
  modalOverlay.classList.add('visible');
}

function closeModal() {
  modalOverlay.classList.remove('visible');
}

btnCreate.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);

// Close modal on overlay click (but not on modal body click)
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('visible')) {
    closeModal();
  }
});

// ── Create-room settings: read / defaults / last-used ───────────────────────

const LAST_SETTINGS_KEY = 'gvn_room_last_settings';

// The form's own hardcoded defaults, used when nothing has been remembered yet.
const DEFAULT_ROOM_SETTINGS = {
  boardSize: 17, winningRule: 'freestyle',
  ruleWall: false, rulePortal: false, ruleSwap2: false,
  timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0,
};

// Lite mode's fixed preset — Board 17x17 + WALL — applied on every modal
// open in Lite, regardless of any previously recalled settings.
const LITE_DEFAULT_SETTINGS = { ...DEFAULT_ROOM_SETTINGS, ruleWall: true };

function readFormSettings() {
  const boardSize = parseInt(
    document.querySelector('input[name="boardSize"]:checked').value, 10
  );
  const timerMode = document.querySelector('input[name="timerMode"]:checked').value;
  const timerSeconds = parseInt(document.getElementById('timer-seconds').value, 10) || 60;
  const timerIncrementSeconds = parseInt(document.getElementById('timer-increment').value, 10) || 0;
  const winningRule = (document.querySelector('input[name="winRule"]:checked') || {}).value || 'freestyle';
  const ruleSwap2   = (document.querySelector('input[name="openRule"]:checked') || {}).value === 'swap2';
  let   ruleWall    = document.getElementById('rule-wall').checked;
  let   rulePortal  = document.getElementById('rule-portal').checked;
  if (ruleSwap2) { ruleWall = false; rulePortal = false; } // Swap2 plays on a plain board
  return { boardSize, winningRule, ruleWall, rulePortal, ruleSwap2, timerMode, timerSeconds, timerIncrementSeconds };
}

function loadLastSettings() {
  try {
    const raw = localStorage.getItem(LAST_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_ROOM_SETTINGS, ...parsed } : null;
  } catch (e) {
    return null;
  }
}

function saveLastSettings(settings) {
  try {
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { /* private mode — remembering is best-effort */ }
}

// Push a settings object back into the form controls (Pro "use last settings").
function applySettingsToForm(s) {
  const check = (sel) => { const el = document.querySelector(sel); if (el) el.checked = true; };
  check(`input[name="boardSize"][value="${s.boardSize}"]`);
  check(`input[name="winRule"][value="${s.winningRule}"]`);
  check(`input[name="openRule"][value="${s.ruleSwap2 ? 'swap2' : 'none'}"]`);
  check(`input[name="timerMode"][value="${s.timerMode}"]`);
  const wall = document.getElementById('rule-wall');
  const portal = document.getElementById('rule-portal');
  if (wall) wall.checked = !!s.ruleWall;
  if (portal) portal.checked = !!s.rulePortal;
  document.getElementById('timer-seconds').value = s.timerSeconds;
  document.getElementById('timer-increment').value = s.timerIncrementSeconds;
  // Re-run the Swap2 ⇄ board-setup interlock
  document.querySelectorAll('input[name="openRule"]').forEach(r => r.dispatchEvent(new Event('change')));
}

function submitCreate(settings) {
  const roomName = document.getElementById('room-name').value.trim();
  saveLastSettings(settings);

  // Store intent and navigate — room.js will handle the actual create
  sessionStorage.setItem('gvn_room_intent', JSON.stringify({
    action: 'create',
    settings: { roomName, ...settings },
  }));

  closeModal();
  window.location.href = 'room.html'; // Create room ID is assigned by server later
}

// Confirm → create room
modalConfirm.addEventListener('click', () => submitCreate(readFormSettings()));

// Lite: "Quick match" — the form, which is already pre-filled with last-used
// settings (or defaults) on open, plus whatever the user tweaked in Advanced.
btnQuickMatch.addEventListener('click', () => {
  submitCreate(readFormSettings());
});

// Pro: "Use last settings" — refill the form, leaving the user free to tweak.
btnUseLast.addEventListener('click', () => {
  const last = loadLastSettings();
  if (last) applySettingsToForm(last);
});

// ── Modal mode gating ───────────────────────────────────────────────────────

// Lite  → Quick match primary, everything else behind a closed "Advanced".
// Default → unchanged flat form.
// Pro   → flat form plus a "Use last settings" affordance (only once something
//         has actually been remembered).
function applyModalMode() {
  const mode = uiMode();
  const advanced = document.getElementById('modal-advanced');
  const toggle   = document.getElementById('modal-advanced-toggle');
  if (!advanced || !toggle) return;

  const lite = mode === 'lite';
  modalOverlay.classList.toggle('modal--lite', lite);
  modalOverlay.classList.toggle('modal--pro', mode === 'pro');

  // Advanced disclosure exists only in Lite; other modes show the form flat.
  if (lite) {
    advanced.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  btnUseLast.style.display = (mode === 'pro' && loadLastSettings()) ? '' : 'none';
}

modalAdvancedToggle.addEventListener('click', () => {
  const advanced = document.getElementById('modal-advanced');
  const open = advanced.classList.toggle('open');
  modalAdvancedToggle.setAttribute('aria-expanded', String(open));
});

applyModalMode();

// Swap2 (opening rule) is played on a plain board → disable & clear board setup.
(function () {
  const sync = () => {
    const swap2 = document.getElementById('or-swap2');
    const disabled = !!(swap2 && swap2.checked);
    ['rule-wall', 'rule-portal'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (disabled) el.checked = false;
      el.disabled = disabled;
      const trow = el.closest('.toggle-row');
      if (trow) trow.style.opacity = disabled ? '0.45' : '';
    });
  };
  document.querySelectorAll('input[name="openRule"]').forEach(r => r.addEventListener('change', sync));
  sync();
})();

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
