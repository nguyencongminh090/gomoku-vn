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
//
// `shared()` rather than `new` since #145: index.html now creates this client
// in <head> (socket-early.js) so the handshake overlaps HTML parsing instead
// of queueing behind the whole module graph. By the time this line runs the
// socket is normally already connecting, and `shared()` hands back that same
// client. `new` here would open a second connection and kick the player.
export const client = SocketClient.shared();

// #440: the Phòng screen controller (classic script → window.RoomsH; jsdom suites eval it directly).
import './rooms-h.js?v=bf30992d';

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const statusBanner  = document.getElementById('status-banner');
const navUser       = document.getElementById('nav-user');
const navBadge      = document.getElementById('nav-badge');
const heroEyebrow   = document.getElementById('hero-eyebrow');
const heroSub       = document.getElementById('hero-sub');
const heroTitle     = document.getElementById('hero-title');
const modalOverlay  = document.getElementById('modal-create');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
const btnQuickMatch = document.getElementById('btn-quick-match');
const modalAdvancedToggle = document.getElementById('modal-advanced-toggle');

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
// Site-wide Arena header (B193); it owns the user chip the old topnav showed.
if (window.PlatformShell) window.PlatformShell.build('lobby');
if (userInfo.signedIn && navUser && navBadge) {
  navUser.textContent = userInfo.displayName;
  navBadge.textContent = userInfo.isGuest ? t('nav.guest_badge') : '';
  navBadge.style.display = userInfo.isGuest ? '' : 'none';
}

// Bind status banner
client.bindStatusBanner(statusBanner);

// ---------------------------------------------------------------------------
// Subscribe to lobby updates
// ---------------------------------------------------------------------------
// B229: lobby:subscribe / unsubscribe (and the B228 reconnect re-subscribe) live in lobby-home.js —
// the lobby room is joined only while the rooms screen is showing.

// #440: the Phòng screen (stats bar, online rail, rule tabs, filters, table cards) is rooms-h.js; it
// registers its own lobby:update / lobby:patch handlers. Created below, once the modal it opens exists.
let roomsH = null;

/** The rule tab the rooms screen shows: lobby-home.js subscribes to that rule's channel (#439). */
export function roomsRule() { return roomsH ? roomsH.rule() : null; }

// ---------------------------------------------------------------------------
// Hero line
// ---------------------------------------------------------------------------
// A fixed screen title (H1, as in the Arena mockup) plus one live sentence under it, stating
// what is actually on the screen — it replaced the old "Danh sách phòng (N)" header plus its
// count pills. (The sentence used to BE the H1, so an empty lobby read "Chưa có bàn chơi nào
// đang mở." as the page title, #209/B210.) Which
// sentence depends on the active tab, so tournaments.js drives it through the
// two exports below rather than owning a hero of its own.

let heroTab = 'tables';          // 'home' | 'tables' | 'tournaments'
let heroTournamentCount = 0;

/** Home greeting, "Chào <b>name</b>, …": the name is user text, so it goes in as a text node. */
function renderGreeting() {
  heroEyebrow.textContent = t('home.eyebrow');
  if (heroSub) heroSub.hidden = true;
  const name = userInfo.signedIn ? userInfo.displayName : '';
  if (!name) { heroTitle.textContent = t('home.greeting_anon'); return; }
  const [before, after = ''] = t('home.greeting', { name: '\u0000' }).split('\u0000');
  const b = document.createElement('b');
  b.textContent = name;
  heroTitle.replaceChildren(before, b, after);
}

function renderHero() {
  if (!heroTitle) return;
  if (heroTab === 'home') { renderGreeting(); return; }
  const tournaments = heroTab === 'tournaments';
  const n = heroTournamentCount;

  heroEyebrow.textContent = t(tournaments ? 'lobby.eyebrow_tournaments' : 'lobby.eyebrow_tables');

  heroTitle.textContent = t(tournaments ? 'lobby.title_tournaments' : 'lobby.title_rooms');
  if (!heroSub) return;
  if (!tournaments) { heroSub.hidden = true; return; } // Arena rooms screen: title only, the list is the count
  heroSub.hidden = false;
  if (n === 0) {
    heroSub.textContent = t(tournaments ? 'lobby.hero_tournaments_empty' : 'lobby.hero_rooms_empty');
    return;
  }
  // Both templates carry a single `{n}`, which is filled with a bolded count.
  // The template is a translator-authored constant and `n` is a number, so no
  // user-controlled text ever reaches this innerHTML.
  const key = tournaments ? 'lobby.hero_tournaments' : 'lobby.hero_rooms';
  heroSub.innerHTML = t(key, { n: `<b>${n}</b>` });
}

/** Called by lobby-home.js on screen switch, so the hero follows the screen. */
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

// ── Online Users ────────────────────────────────────────────────────────────
// The sticky sidebar panel is gone (Zen Minimal single column): who is here is
// now the count in the top bar plus one line of prose under the room list.
const onlineCountEl     = document.getElementById('online-count');

let currentOnlineUsers = [];
// #381: the server sends only the first page of the list; this is the real count when there are more.
let currentOnlineTotal = 0;

function renderOnlineCount() {
  const count = Math.max(currentOnlineTotal, currentOnlineUsers.length);
  if (onlineCountEl) onlineCountEl.textContent = t('lobby.online_count_nav', { n: count });
  if (roomsH) roomsH.setOnline(count); // #440: stats bar + roster rail (re-queried in rank order there)
}

// Apply a `lobby:online_patch` ({ joined, left }) to an online list (#230).
// Idempotent: a `joined` entry already held is replaced, a `left` id never
// held is ignored — a snapshot taken between flushes may already include it.
function applyOnlineUsersPatch(users, patch) {
  const byId = new Map(users.map((u) => [u.userId, u]));
  for (const userId of (patch && patch.left) || []) byId.delete(userId);
  for (const u of (patch && patch.joined) || []) byId.set(u.userId, u);
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function setOnlineUsers(users, total) {
  currentOnlineUsers = users;
  currentOnlineTotal = typeof total === 'number' && total > users.length ? total : users.length;
  renderOnlineCount();
  // Feed the private-chat module (#159) — it owns the online-users modal and
  // per-window presence. Safe if it hasn't finished init yet: it also reads
  // GvnSession directly and this event re-fires on every presence change.
  if (window.PrivateChat) window.PrivateChat.updateOnlineUsers(users, currentOnlineTotal);
}

// Full list once per lobby:subscribe (incl. after reconnect, #228), then deltas.
client.on('lobby:online_users', (users) => setOnlineUsers(Array.isArray(users) ? users : []));
// `total` rides on a patch only while the list is truncated (#381); without it the list is complete.
client.on('lobby:online_patch', (patch) => setOnlineUsers(applyOnlineUsersPatch(currentOnlineUsers, patch), patch && patch.total));

client.on('room:error', (data) => {
  // `code` is language-neutral; `message` is Vietnamese-only fallback for
  // servers/events that haven't been given a code yet (TODO #45).
  alert(data.code ? t('err.' + data.code.toLowerCase()) : data.message);
});

// Auto-redirect if server detects we are already in a room
client.on('room:joined', (data) => {
  window.location.replace(roomHref(data.roomId));
});

// room.html URL; entering from the Phòng tab adds ?from=rooms so leaving returns there (#365).
function roomHref(roomId) {
  const q = new URLSearchParams();
  if (roomId) q.set('id', roomId);
  if (window.location.hash === '#rooms') q.set('from', 'rooms');
  const qs = q.toString();
  return 'room.html' + (qs ? '?' + qs : '');
}

// "Mở bàn" in the stats bar (#btn-create, the id e2e specs click) and the empty tab's "Mở bàn <luật>".
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('[data-create-room]')) openModal();
});

window.addEventListener('langchange', () => {
  renderHero();
  renderOnlineCount();
});

// ---------------------------------------------------------------------------
// Join Room
// ---------------------------------------------------------------------------
// Exposed globally for onclick
window.joinRoom = function(roomId) {
  // Store intent and navigate — room.js will handle the actual join
  sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'join', roomId }));
  window.location.href = roomHref(roomId);
};

// ---------------------------------------------------------------------------
// Create Room Modal
// ---------------------------------------------------------------------------

function openModal({ rule = null } = {}) {
  modalRule = rule; // #440: "Mở bàn <luật>" on an empty rule tab preselects that rule
  // F402: start from what the player used for their previous room (members: stored server-side,
  // guests: this browser), else the fixed preset. Advanced stays collapsed; the summary line
  // above "Tạo nhanh" says what a one-tap create will use.
  // Guests can only play friendly, so it is forced for them (re-evaluated on every open).
  modalTouched = false;
  applySettingsToForm(rememberedSettings());
  applyModalMode();
  modalOverlay.classList.add('visible');
  refreshRoomDefaults();
}

// ── Remembered settings (F402) ──────────────────────────────────────────────
let serverRoomDefaults = null;   // members: GET /api/profile/prefs → roomDefaults (null = never created one)
let modalTouched = false;        // the player changed a control since this open — don't overwrite their pick
let modalRule = null;            // #440: rule forced by the opener (empty rule tab), over the remembered one

function readLocalSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_SETTINGS_KEY) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch (e) { return null; }
}

function rememberedSettings() {
  const s = userInfo.isGuest
    ? { ...LITE_DEFAULT_SETTINGS, ...(readLocalSettings() || {}), ranked: false }
    : { ...LITE_DEFAULT_SETTINGS, ...(serverRoomDefaults || {}) };
  if (modalRule && modalRule !== s.winningRule) {
    s.winningRule = modalRule;
    if (modalRule === 'renju') s.boardSize = 15; // as picking Renju in the select does (#425)
  }
  return s;
}

// Members: pick up the server copy (another device may have created a room since). Applied only
// when it differs from what is shown and the player has not started editing.
function refreshRoomDefaults() {
  if (!userInfo.signedIn || userInfo.isGuest) return;
  fetch('/api/profile/prefs', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      serverRoomDefaults = j.roomDefaults || null;
      if (!modalTouched && modalOverlay.classList.contains('visible')) applySettingsToForm(rememberedSettings());
    })
    .catch(() => { /* offline — the cached/default values stay */ });
}

function closeModal() {
  modalOverlay.classList.remove('visible');
}

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
  boardSize: 19, winningRule: 'freestyle', ranked: true,
  ruleWall: false, rulePortal: false, ruleSwap2: false, openingRule: null,
  timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0,
};

// Lite mode's fixed preset — Board 19x19 + WALL — applied on every modal
// open in Lite, regardless of any previously recalled settings.
const LITE_DEFAULT_SETTINGS = { ...DEFAULT_ROOM_SETTINGS, ruleWall: true };

// The create-room form's choices are native <select>s (F402), looked up by name.
const pick = (name) => (document.querySelector(`select[name="${name}"]`) || {}).value;

const RENJU_OPENINGS = ['taraguchi10', 'yamaguchi'];

function readFormSettings() {
  const boardSize = parseInt(pick('boardSize'), 10);
  const timerMode = pick('timerMode');
  const timerSeconds = parseInt(document.getElementById('timer-seconds').value, 10) || 60;
  // Increment only takes effect in blitz mode (TimerManager.applyMove) — zero
  // it out otherwise so the stored/submitted setting doesn't imply it's active.
  const timerIncrementSeconds = timerMode === 'blitz'
    ? (parseInt(document.getElementById('timer-increment').value, 10) || 0)
    : 0;
  const winningRule = pick('winRule') || 'freestyle';
  const ruleSwap2   = pick('openRule') === 'swap2';
  // Renju Taraguchi-10 / Yamaguchi (#427): only with Renju on 15x15 (the server drops it otherwise).
  const openingRule = RENJU_OPENINGS.includes(pick('openRule')) && winningRule === 'renju' && boardSize === 15 ? pick('openRule') : null;
  let   ruleWall    = document.getElementById('rule-wall').checked;
  let   rulePortal  = document.getElementById('rule-portal').checked;
  if (ruleSwap2 || openingRule) { ruleWall = false; rulePortal = false; } // the opening plays on a plain board
  const ranked = pick('roomMode') !== 'friendly';
  return { boardSize, winningRule, ranked, ruleWall, rulePortal, ruleSwap2, openingRule, timerMode, timerSeconds, timerIncrementSeconds };
}

function saveLastSettings(settings) {
  try {
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { /* private mode — remembering is best-effort */ }
}

// Push a settings object back into the form controls.
function applySettingsToForm(s) {
  // An unknown value (stale / hand-edited storage) leaves the select on its current option.
  const choose = (name, value) => {
    const el = document.querySelector(`select[name="${name}"]`);
    if (el && [...el.options].some((o) => o.value === String(value))) el.value = String(value);
  };
  choose('boardSize', s.boardSize);
  choose('winRule', s.winningRule);
  choose('roomMode', s.ranked === false ? 'friendly' : 'rated');
  choose('openRule', s.openingRule || (s.ruleSwap2 ? 'swap2' : 'none'));
  choose('timerMode', s.timerMode);
  const wall = document.getElementById('rule-wall');
  const portal = document.getElementById('rule-portal');
  if (wall) wall.checked = !!s.ruleWall;
  if (portal) portal.checked = !!s.rulePortal;
  document.getElementById('timer-seconds').value = s.timerSeconds;
  document.getElementById('timer-increment').value = s.timerIncrementSeconds;
  // Re-run the Swap2 ⇄ board-setup interlock and the Blitz ⇄ increment interlock
  document.querySelectorAll('select[name="roomMode"], select[name="openRule"], select[name="timerMode"]')
    .forEach(r => r.dispatchEvent(new Event('change')));
  updateModeHint(); // the synthetic change above does not bubble to the modal's listener
  updateModalSummary();
}

// One line saying what "Tạo nhanh" will create with the current form (selected option texts —
// no extra i18n keys, and it follows a language change on the next open/edit).
function updateModalSummary() {
  const out = document.getElementById('modal-summary');
  if (!out) return;
  const text = (name) => {
    const el = document.querySelector(`select[name="${name}"]`);
    return el && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
  };
  const s = readFormSettings();
  const parts = [text('roomMode'), text('boardSize'), text('winRule')];
  if (s.ruleSwap2 || s.openingRule) parts.push(text('openRule'));
  if (s.ruleWall) parts.push(t('modal.rule_wall').replace(/\s*\(.*\)/, ''));
  if (s.rulePortal) parts.push(t('modal.rule_portal').replace(/\s*\(.*\)/, ''));
  // The clock is one setting → one chip ("Blitz 180s +2s").
  parts.push(`${text('timerMode')} ${s.timerSeconds}s${s.timerMode === 'blitz' && s.timerIncrementSeconds ? ' +' + s.timerIncrementSeconds + 's' : ''}`);
  // One chip per setting (ticket-rows rule: meta as separate spans, never "a · b · c").
  out.replaceChildren(...parts.map((txt) => {
    const chip = document.createElement('span');
    chip.className = 'modal__chip';
    chip.textContent = txt;
    return chip;
  }));
}

// Rated / friendly: the description under the select follows the choice.
function updateModeHint() {
  const hint = document.getElementById('rm-hint');
  if (!hint) return;
  const key = pick('roomMode') === 'friendly' ? 'modal.mode_friendly_desc' : 'modal.mode_rated_desc';
  hint.setAttribute('data-i18n', key);
  hint.textContent = t(key);
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
  window.location.href = roomHref(null); // Create room ID is assigned by server later
}

// Confirm → create room
modalConfirm.addEventListener('click', () => submitCreate(readFormSettings()));

// Lite: "Quick match" — the form, which is already pre-filled with last-used
// settings (or defaults) on open, plus whatever the user tweaked in Advanced.
btnQuickMatch.addEventListener('click', () => {
  submitCreate(readFormSettings());
});

// ── Modal mode gating ───────────────────────────────────────────────────────

// Quick match primary, everything else behind a closed "Advanced".
function applyModalMode() {
  const advanced = document.getElementById('modal-advanced');
  const toggle   = document.getElementById('modal-advanced-toggle');
  if (!advanced || !toggle) return;

  modalOverlay.classList.add('modal--lite');
  advanced.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
}

modalAdvancedToggle.addEventListener('click', () => {
  const advanced = document.getElementById('modal-advanced');
  const open = advanced.classList.toggle('open');
  modalAdvancedToggle.setAttribute('aria-expanded', String(open));
});

applyModalMode();

// Renju's standard board is 15x15: picking Renju moves the size select to 15 (#425). A user change only — the size stays free to edit after.
document.querySelectorAll('select[name="winRule"]').forEach((sel) => sel.addEventListener('change', () => {
  const size = document.querySelector('select[name="boardSize"]');
  if (sel.value === 'renju' && size && [...size.options].some((o) => o.value === '15')) size.value = '15';
}));

// Swap2 / Taraguchi-10 / Yamaguchi (opening rules) are played on a plain board → disable & clear board setup.
// The Renju openings need Renju on 15x15: their options are disabled otherwise (falls back to "none") (#427).
(function () {
  const sync = () => {
    const open = document.querySelector('select[name="openRule"]');
    const renju15 = pick('winRule') === 'renju' && pick('boardSize') === '15';
    if (open) {
      [...open.options].forEach((o) => { if (RENJU_OPENINGS.includes(o.value)) o.disabled = !renju15; });
      if (!renju15 && RENJU_OPENINGS.includes(open.value)) open.value = 'none';
    }
    const hint = document.getElementById('or-renju-hint');
    if (hint) hint.hidden = renju15 || pick('winRule') !== 'renju'; // only explain to someone already on Renju
    const disabled = pick('openRule') === 'swap2' || RENJU_OPENINGS.includes(pick('openRule'));
    ['rule-wall', 'rule-portal'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (disabled) el.checked = false;
      el.disabled = disabled;
      const trow = el.closest('.toggle-row');
      if (trow) trow.style.opacity = disabled ? '0.45' : '';
    });
  };
  document.querySelectorAll('select[name="openRule"], select[name="winRule"], select[name="boardSize"]').forEach(r => r.addEventListener('change', sync));
  sync();
})();

// Timer increment ("Cộng thêm") only takes effect in Blitz mode server-side
// (TimerManager.applyMove) — disable & gray it out for the other modes so it
// doesn't look active when it silently has no effect.
(function () {
  const sync = () => {
    const active = pick('timerMode') === 'blitz';
    const el = document.getElementById('timer-increment');
    if (!el) return;
    if (!active) el.value = 0;
    el.disabled = !active;
    const row = document.getElementById('timer-increment-row');
    if (row) row.style.opacity = active ? '' : '0.45';
  };
  document.querySelectorAll('select[name="timerMode"]').forEach(r => r.addEventListener('change', sync));
  sync();
})();

// Any edit inside the form: stop a late server copy overwriting it; refresh hint + summary.
modalOverlay.addEventListener('change', () => { modalTouched = true; updateModeHint(); updateModalSummary(); });
modalOverlay.addEventListener('input', () => { modalTouched = true; updateModalSummary(); });
window.addEventListener('langchange', () => { updateModeHint(); updateModalSummary(); });

// ---------------------------------------------------------------------------
// Phòng screen (#440)
// ---------------------------------------------------------------------------
if (window.RoomsH && document.getElementById('panel-tables')) {
  const shell = window.PlatformShell;
  roomsH = window.RoomsH.create({
    root: document.getElementById('panel-tables'),
    client,
    t: (k, v) => t(k, v),
    avatar: (url, name, cls) => (shell ? shell.avatar(url, name, cls).outerHTML : ''),
    icon: (name) => (shell ? shell.icon(name).outerHTML : ''),
    me: () => ({ userId: userInfo.userId, isGuest: userInfo.isGuest }),
    openCreate: (rule) => openModal({ rule }),
  });
  renderOnlineCount();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
