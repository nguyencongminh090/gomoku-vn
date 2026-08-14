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
  // Optimistic: the credential is an HttpOnly cookie now (TODO.md #68), so
  // this cannot verify it — it only rules out "definitely signed out". The
  // socket handshake is the real check.
  window.GvnSession.requireAuth();
})();

// ---------------------------------------------------------------------------
// Initialize Socket.io client
// ---------------------------------------------------------------------------
// Exported so tournaments.js can reuse this exact connection instead of
// opening a second socket.io connection from the same page (which would
// also self-evict via the server's single-device-per-token enforcement).
export const client = new SocketClient();

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const statusBanner  = document.getElementById('status-banner');
const navUser       = document.getElementById('nav-user');
const navBadge      = document.getElementById('nav-badge');
const roomListEl    = document.getElementById('room-list');
const heroEyebrow   = document.getElementById('hero-eyebrow');
const heroTitle     = document.getElementById('hero-title');
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
// Live view of the session identity (TODO.md #68).
//
// Deliberately an object of getters rather than a snapshot: identity now
// arrives from the server as `session:me` shortly AFTER this module runs, so
// a value captured here would be null on the first load following the
// migration and would never update. Every `userInfo.userId` / `.displayName`
// read below therefore stays live, with no re-assignment plumbing. Use
// `userInfo.signedIn` where the old code tested the snapshot for truthiness —
// this object itself is always truthy.
const userInfo = {
  get signedIn()    { return !!window.GvnSession.getUser(); },
  get userId()      { const u = window.GvnSession.getUser(); return u ? u.userId : null; },
  get displayName() { const u = window.GvnSession.getUser(); return u ? u.displayName : ''; },
  get isGuest()     { const u = window.GvnSession.getUser(); return !!(u && u.isGuest); },
};
if (userInfo.signedIn) {
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

// Local room map, keyed by roomId — the base that `lobby:patch` applies to.
// A Map keeps insertion order and, importantly, keeps an updated entry in its
// existing position rather than moving it to the end, so a room does not jump
// around the list every time someone sits down in it.
let roomMap = new Map();

function renderFromMap() {
  currentRooms = Array.from(roomMap.values());
  renderRoomList(currentRooms);
  renderHero();
}

// ---------------------------------------------------------------------------
// Hero line
// ---------------------------------------------------------------------------
// One sentence above the tabs, stating what is actually on the screen — it
// replaced the old "Danh sách phòng (N)" header plus its count pills. Which
// sentence depends on the active tab, so tournaments.js drives it through the
// two exports below rather than owning a hero of its own.

let heroTab = 'tables';          // 'tables' | 'tournaments'
let heroTournamentCount = 0;

function renderHero() {
  if (!heroTitle) return;
  const tournaments = heroTab === 'tournaments';
  const n = tournaments ? heroTournamentCount : currentRooms.length;

  heroEyebrow.textContent = t(tournaments ? 'lobby.eyebrow_tournaments' : 'lobby.eyebrow_tables');

  if (n === 0) {
    heroTitle.textContent = t(tournaments ? 'lobby.hero_tournaments_empty' : 'lobby.hero_rooms_empty');
    return;
  }
  // Both templates carry a single `{n}`, which is filled with a bolded count.
  // The template is a translator-authored constant and `n` is a number, so no
  // user-controlled text ever reaches this innerHTML.
  const key = tournaments ? 'lobby.hero_tournaments' : 'lobby.hero_rooms';
  heroTitle.innerHTML = t(key, { n: `<b>${n}</b>` });
}

/** Called by tournaments.js on tab switch, so the hero follows the tab. */
export function setHeroTab(tab) {
  heroTab = tab;
  renderHero();
}

/** Called by tournaments.js whenever its list changes. */
export function setHeroTournamentCount(count) {
  heroTournamentCount = count;
  if (heroTab === 'tournaments') renderHero();
}

// Paint the empty-state sentence immediately rather than leaving the hero
// blank until the first lobby:update lands.
renderHero();

// Full snapshot — sent once on subscribe, and again on every reconnect, since
// the client re-subscribes. Replaces the local map wholesale.
client.on('lobby:update', (data) => {
  roomMap = new Map((data.rooms || []).map(r => [r.roomId, r]));
  renderFromMap();
});

// Delta — only the rooms that actually changed, plus the ids of rooms that are
// gone. Removals are applied before upserts so a room destroyed and recreated
// with the same id inside one debounce window ends up present, not missing.
// Both operations are idempotent: re-applying an entry already held, or
// removing an id never held, changes nothing.
//
// Applied incrementally to the existing DOM (B117) instead of going through
// renderFromMap()/renderRoomList(): a busy lobby fires many small patches, and
// rebuilding every row's innerHTML — plus replaying every row's entrance
// animation — on each one scales with the *total* room count instead of the
// (usually 1-2) rooms that actually changed.
client.on('lobby:patch', (data) => {
  applyLobbyPatch(data);
});

// ── Online Users ────────────────────────────────────────────────────────────
// The sticky sidebar panel is gone (Zen Minimal single column): who is here is
// now the count in the top bar plus one line of prose under the room list.
const onlineCountEl     = document.getElementById('online-count');
const onlineLineEl      = document.getElementById('online-line');
const onlineLineCountEl = document.getElementById('online-line-count');
const onlineLineNamesEl = document.getElementById('online-line-names');

// How many names the line spells out before it summarises the rest. Lite keeps
// the line short; Pro names everyone rather than trailing off.
function onlineNameLimit() {
  const mode = uiMode();
  if (mode === 'pro') return Infinity;
  return mode === 'lite' ? 6 : 12;
}

let currentOnlineUsers = [];

function renderOnlineLine() {
  if (!onlineLineEl) return;
  const users = currentOnlineUsers;
  const count = users.length;

  if (onlineCountEl) onlineCountEl.textContent = t('lobby.online_count_nav', { n: count });
  if (onlineLineCountEl) onlineLineCountEl.textContent = count;

  onlineLineEl.hidden = false;
  if (count === 0) {
    onlineLineNamesEl.textContent = t('lobby.no_one_online');
    return;
  }

  const limit  = onlineNameLimit();
  const shown  = users.slice(0, limit);
  const hidden = count - shown.length;
  // Own name set in ink so you can find yourself in the line at a glance.
  const parts = shown.map((name) => (
    name === userInfo.displayName ? `<b>${escapeHtml(name)}</b>` : escapeHtml(name)
  ));
  let html = parts.join(', ');
  html += hidden > 0 ? ` ${t('lobby.online_more', { n: hidden })}` : '.';
  onlineLineNamesEl.innerHTML = html;
}

client.on('lobby:online_users', (users) => {
  currentOnlineUsers = users;
  renderOnlineLine();
});

client.on('room:error', (data) => {
  // `code` is language-neutral; `message` is Vietnamese-only fallback for
  // servers/events that haven't been given a code yet (TODO #45).
  alert(data.code ? t('err.' + data.code.toLowerCase()) : data.message);
});

// Auto-redirect if server detects we are already in a room
client.on('room:joined', (data) => {
  window.location.replace(`room.html?id=${encodeURIComponent(data.roomId)}`);
});

// ---------------------------------------------------------------------------
// Room List Rendering
// ---------------------------------------------------------------------------

// Zen Minimal renders a room as a *row*, not a card: a state bullet, the room
// name, one meta line reading "host · 1/2 · rules", and a text action. The
// state that used to be spelled out in a badge is carried by the bullet; the
// full label stays available as the row's title attribute.
// Builds one row's markup. `animate` staggers the entrance animation by
// `delayIndex` (used for a full render); a row created for a single new
// arrival via a patch passes delayIndex 0. An in-place update (existing room,
// changed fields) never calls this — see updateRoomRowNode — so it never
// replays the entrance animation.
function buildRoomRowHtml(room, { animate = false, delayIndex = 0 } = {}) {
  const stateLabel  = getStateLabel(room.state, room.playerCount);
  const bulletClass = getBulletClass(room.state, room.playerCount);
  const animClass = animate ? ' animate-fade-up' : '';
  const animStyle = animate ? ` style="animation-delay: ${(delayIndex * 0.04).toFixed(2)}s"` : '';

  return `
    <div class="room-row${animClass}" data-room-id="${escapeAttr(room.roomId)}"${animStyle}>
      <span class="room-row__bullet ${bulletClass}" title="${escapeAttr(stateLabel)}"></span>
      <div class="room-row__body">
        <div class="room-row__name">${escapeHtml(room.roomName || room.roomId)}</div>
        <div class="room-row__meta">${buildRoomMeta(room)}</div>
      </div>
      <button class="room-row__action" data-action="joinRoom" data-arg="${escapeAttr(room.roomId)}" type="button">
        ${t('lobby.btn_join')}
      </button>
    </div>
  `;
}

// Full rebuild — used for the initial/reconnect snapshot (lobby:update) and
// for langchange/uimodechange, where every row's text genuinely needs to be
// redone. NOT used for lobby:patch — see applyLobbyPatch below.
function renderRoomList(rooms) {
  if (rooms.length === 0) {
    roomListEl.innerHTML = `
      <div class="room-list__empty">
        <span class="room-list__empty-text">${t('lobby.no_rooms')}</span>
        <span class="room-list__empty-sub">${t('lobby.no_rooms_sub')}</span>
      </div>
    `;
    return;
  }

  let html = '';
  let i = 0;
  for (const room of rooms) {
    html += buildRoomRowHtml(room, { animate: true, delayIndex: i });
    i++;
  }

  roomListEl.innerHTML = html;
}

// Update an existing row's content in place — no DOM node replacement, no
// entrance-animation replay.
function updateRoomRowNode(node, room) {
  const stateLabel  = getStateLabel(room.state, room.playerCount);
  const bulletClass = getBulletClass(room.state, room.playerCount);

  const bullet = node.querySelector('.room-row__bullet');
  bullet.className = `room-row__bullet ${bulletClass}`;
  bullet.title = stateLabel;

  node.querySelector('.room-row__name').textContent = room.roomName || room.roomId;
  node.querySelector('.room-row__meta').innerHTML = buildRoomMeta(room);

  const action = node.querySelector('.room-row__action');
  if (action) action.dataset.arg = room.roomId;
}

// Apply a `lobby:patch` ({ upserts, removed }) to `roomMap` and the DOM
// incrementally: only the rows that actually changed are touched, instead of
// rebuilding the whole list (B117 — a busy lobby was re-rendering every room
// on every patch, scaling with total room count instead of changed-room
// count). Crossing the empty <-> non-empty boundary changes the DOM's overall
// shape (empty-state markup vs. row list), so that one edge still falls back
// to a full render — it happens at most once per transition, not per patch.
function applyLobbyPatch(patch) {
  const removed = patch.removed || [];
  const upserts = patch.upserts || [];

  const wasEmpty = currentRooms.length === 0;

  for (const roomId of removed) roomMap.delete(roomId);
  for (const room of upserts) roomMap.set(room.roomId, room);
  currentRooms = Array.from(roomMap.values());

  if (wasEmpty || currentRooms.length === 0) {
    renderRoomList(currentRooms);
    renderHero();
    return;
  }

  const nodesByRoomId = new Map();
  for (const node of roomListEl.children) {
    if (node.dataset && node.dataset.roomId) nodesByRoomId.set(node.dataset.roomId, node);
  }

  for (const roomId of removed) {
    const node = nodesByRoomId.get(roomId);
    if (node) node.remove();
  }

  for (const room of upserts) {
    const existing = nodesByRoomId.get(room.roomId);
    if (existing) {
      updateRoomRowNode(existing, room);
    } else {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildRoomRowHtml(room, { animate: true });
      roomListEl.appendChild(wrapper.firstElementChild);
    }
  }

  renderHero();
}

function getStateLabel(state, playerCount) {
  if (state === 'playing') return t('lobby.state_playing');
  if (state === 'interrupted') return t('lobby.state_interrupted');
  if (playerCount >= 2) return t('lobby.state_ready');
  return t('lobby.state_waiting');
}

function getBulletClass(state, playerCount) {
  if (state === 'playing') return 'room-row__bullet--playing';
  if (playerCount >= 2) return 'room-row__bullet--ready';
  return 'room-row__bullet--waiting';
}

// The single meta line under the room name: middot-joined segments, escaped
// individually so a room/host name can never inject markup through the join.
function buildRoomMeta(room) {
  const parts = [
    escapeHtml(room.hostName),
    `${room.playerCount}/2`,
  ];
  if (uiMode() === 'pro') parts.push(escapeHtml(room.roomId));
  parts.push(buildRuleSummary(room));
  return parts.join(' · ');
}

// Lite/Default: one plain-language summary instead of the jargon cluster
// (Wall / Portal / Swap2 / Caro).
// Pro: the full breakdown, restoring the detail Default collapses.
function buildRuleSummary(room) {
  const size = `${room.boardSize}×${room.boardSize}`;
  if (uiMode() !== 'pro') {
    const isCustom = !!(room.ruleWall || room.rulePortal || room.ruleSwap2)
      || (room.winningRule || 'freestyle') !== 'freestyle';
    return `${isCustom ? t('lobby.rules_custom') : t('lobby.rules_standard')} · ${size}`;
  }

  const tags = [size];
  if (room.ruleWall)   tags.push(t('modal.rule_wall'));
  if (room.rulePortal) tags.push(t('modal.rule_portal'));
  if (room.ruleSwap2)  tags.push('Swap2');
  const win = room.winningRule || 'freestyle';
  if (win === 'standard')  tags.push(t('rule.standard'));
  if (win === 'caro')      tags.push(t('rule.caro'));
  if (win === 'freestyle') tags.push(t('rule.freestyle'));
  return tags.join(' · ');
}

window.addEventListener('langchange', () => {
  renderRoomList(currentRooms);
  renderHero();
  renderOnlineLine();
});

window.addEventListener('uimodechange', () => {
  // Both the room meta line and how many names the online line spells out are
  // mode-dependent (see buildRuleSummary/onlineNameLimit).
  renderRoomList(currentRooms);
  renderOnlineLine();
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
  // Increment only takes effect in blitz mode (TimerManager.applyMove) — zero
  // it out otherwise so the stored/submitted setting doesn't imply it's active.
  const timerIncrementSeconds = timerMode === 'blitz'
    ? (parseInt(document.getElementById('timer-increment').value, 10) || 0)
    : 0;
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
  // Re-run the Swap2 ⇄ board-setup interlock and the Blitz ⇄ increment interlock
  document.querySelectorAll('input[name="openRule"]').forEach(r => r.dispatchEvent(new Event('change')));
  document.querySelectorAll('input[name="timerMode"]').forEach(r => r.dispatchEvent(new Event('change')));
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

// Timer increment ("Cộng thêm") only takes effect in Blitz mode server-side
// (TimerManager.applyMove) — disable & gray it out for the other modes so it
// doesn't look active when it silently has no effect.
(function () {
  const sync = () => {
    const blitz = document.getElementById('tm-blitz');
    const active = !!(blitz && blitz.checked);
    const el = document.getElementById('timer-increment');
    if (!el) return;
    if (!active) el.value = 0;
    el.disabled = !active;
    const row = document.getElementById('timer-increment-row');
    if (row) row.style.opacity = active ? '' : '0.45';
  };
  document.querySelectorAll('input[name="timerMode"]').forEach(r => r.addEventListener('change', sync));
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

// Escaping lives in escape-utils.js (a pure, Node-testable module imported by
// index-entry.js before this file). These are thin aliases so the call sites
// below read the same as before.
const escapeAttr = (str) => globalThis.EscapeUtils.escapeAttr(str);
