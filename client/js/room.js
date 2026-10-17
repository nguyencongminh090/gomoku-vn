'use strict';

/**
 * room.js — Room page bootstrap entry point.
 *
 * This file is now intentionally minimal (~150 lines).
 * It is responsible for:
 *   1. Auth guard
 *   2. Declaring and initializing window.RoomState (the shared state singleton)
 *   3. Exposing window.RoomClient (the SocketClient wrapper)
 *   4. Setting up stable DOM event listeners (tabs, leave, chat input, overlay)
 *
 * All domain logic has been extracted to:
 *   chat-ui.js    — appendChatMessage, showFloatMessage, showToast
 *   room-ui.js    — renderSlot, updateUI, renderSettings, renderScoreTable, …
 *   game-ui.js    — initBoard, updateBoardState, renderTimers, renderSwap2, …
 *   room-socket.js — all client.on(…) socket event bindings
 *
 * Load order in room.html:
 *   room.js → chat-ui.js → room-ui.js → game-ui.js → room-socket.js
 *
 * Manual test checklist:
 *   [ ] Redirect to login.html if not authenticated
 *   [ ] Room data populates after room:joined
 *   [ ] Sit / stand / leave / kick work
 *   [ ] Start modal appears (no countdown) once both slots are filled
 *   [ ] Clicking Start opens a 15s countdown for the other seat; that seat's
 *       own view shows "waiting for opponent" once they click
 *   [ ] Not confirming within 15s for the 3rd time vacates that seat (toast
 *       shown to that player); misses 1-2 just reset both to not-ready
 *   [ ] Settings change emitted correctly (host only)
 *   [ ] Chat send on Enter and button click
 *   [ ] Start modal reappears (no separate rematch flow) once a game ends
 */

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
(function authGuard() {
  // See lobby.js — optimistic only; the socket handshake is the real check.
  window.GvnSession.requireAuth();
})();

// ---------------------------------------------------------------------------
// Socket client — exposed globally so modules can emit without circular deps
// ---------------------------------------------------------------------------
window.RoomClient = new SocketClient();

// ---------------------------------------------------------------------------
// Shared state singleton (read/written by all modules)
// ---------------------------------------------------------------------------
window.RoomState = {
  // Socket / user.
  //
  // A live getter, not a value captured at load (TODO.md #68). Identity now
  // arrives from the server via `session:me` shortly AFTER this object is
  // built, so a snapshot taken here would be null on the first load after
  // migration and stay null forever — every `st.myUser.userId` read in
  // game-ui/room-ui/room-socket would then throw. Reading through to the
  // session cache means those call sites see the identity as soon as it
  // lands, with no re-assignment plumbing.
  get myUser() { return window.GvnSession.getUser(); },

  // Room
  roomData:          null,   // latest room:joined / room:updated payload
  myRole:            null,   // 'host' | 'player' | 'guest'
  mySlot:            null,   // 1 | 2 | null
  isReady:           false,
  standRequested:    false,  // set true just before an intentional room:stand emit

  // Game
  gameState:         null,   // from game:init / room:joined.gameState
  timerValues:       { black: 0, white: 0 },

  // Half of the last measured move round-trip, in ms (TODO.md #165). The
  // server stamps `timer:sync` with its clock reading, but that packet then
  // spends ~d ms in flight before we read it, so our clock offset ends up d
  // ms short and the displayed clock runs d ms behind — invisible at d≈20ms,
  // a visible 1–3s over-count on a lossy/VPN link. We subtract this estimate
  // of d from the *displayed* remaining only (never activeDeadline/serverNow,
  // so the desync watchdog is untouched). Measured from game:move acks — a
  // real round trip on the exact path that matters, no extra packets.
  halfRttMs:         0,
  drawOfferPending:  null,   // { from, fromName } | null
  timeRequestPending:null,   // { from, fromName, bonus } | null

  // Predicted turn-switch overlay (TODO.md #155 — Full CSP). Render-only,
  // symmetric to boardRenderer.optimisticStone: sendMove() sets it so the
  // turn-bar/timer flip to the opponent with 0ms perceived latency, but it
  // never writes gameState.currentTurn/timerValues — those stay the real,
  // server-confirmed values, so a rollback is just active:false, never a
  // hand-written "restore".
  predictedTurn: { active: false, forColor: null, snapshotTimerValues: null, switchedAtLocalTs: null },

  // Board preferences (persisted to localStorage). The look itself (paper/stone,
  // colours, coordinates) is window.BoardPrefs since #216; this mirror is kept
  // for older readers.
  boardDisplayMode: (() => {
    const v = localStorage.getItem('play3cr_board_display') || 'paper';
    return ['paper', 'stone'].includes(v) ? v : 'paper';
  })(),
  clickMode: (() => {
    const v = localStorage.getItem('gomoku_click_mode') || 'double';
    return ['single', 'double'].includes(v) ? v : 'double';
  })(),

  // Board renderer instance (created by game-ui.js)
  boardRenderer: null,
};

// ---------------------------------------------------------------------------
// Status banner
// ---------------------------------------------------------------------------
const statusBanner = document.getElementById('status-banner');
window.RoomClient.bindStatusBanner(statusBanner);

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------
const tabBtns     = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const chatMessages = document.getElementById('chat-messages');

// Shows one rail tab. room-ui.js calls it (via RoomTabs) to move the user off
// a tab whose button just disappeared. The zen drawer that tab clicks used to
// collapse/expand is gone with the #216 layout.
function activateTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const content = document.getElementById(tabId);
  if (!btn || !content) return;

  tabBtns.forEach(b => b.classList.remove('tab-btn--active'));
  tabContents.forEach(c => c.classList.remove('tab-content--active'));
  btn.classList.add('tab-btn--active');
  content.classList.add('tab-content--active');

  if (tabId === 'tab-chat' && chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// room-ui.js's renderUsersList()/renderScoreTable() call this when the tab the
// user is standing on is about to be hidden.
window.RoomTabs = { activate: activateTab };

// Binding guard: a stale `?v=` cross-import can re-run this module's top level
// (the cache-busting hazard in CLAUDE.md); bind the tab clicks once per document.
if (!document.body.dataset.roomTabsBound) {
  document.body.dataset.roomTabsBound = '1';
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.getAttribute('data-tab')));
  });
}

const chatInput = document.getElementById('chat-input');

// #218: on phones the document never scrolls (.room is the scroller), so when the keyboard shrinks the viewport
// nothing brings the chat field back into view on its own in browsers that resize the layout. Do it on every
// viewport resize while the field is focused (also pans the visual viewport in browsers that only resize that).
if (chatInput && !document.body.dataset.roomKeyboardBound) {
  document.body.dataset.roomKeyboardBound = '1';
  const keepChatInView = () => {
    if (document.activeElement !== chatInput) return;
    const bar = chatInput.closest('.chat-input') || chatInput;
    if (typeof bar.scrollIntoView === 'function') bar.scrollIntoView({ block: 'end', inline: 'nearest' });
  };
  (window.visualViewport || window).addEventListener('resize', keepChatInView);
}

// ---------------------------------------------------------------------------
// Phone panel: minimized (quick chat bar) <-> expanded (tabs + messages). #217
// The toggle is display:none above 768px, so the class is harmless on desktop.
// ---------------------------------------------------------------------------
const PANEL_MIN_KEY = 'gvn_room_panel_min';
const PANEL_ANIM_MS = 240;
// Animate the panel height between the two states (FLIP: measure, switch, measure, play old → new). The panel
// is a flex item (flex-basis 0 + min-height 360 when expanded), so flex-basis AND min/max-height are animated —
// height alone is ignored/clamped. While it runs, the inner column is pinned at the EXPANDED layout and anchored
// to the panel's bottom (justify-content:flex-end), so the input bar rides the bottom edge and never jumps out of
// view; the overflow above is clipped. Expand switches the class first; collapse keeps the expanded content
// until the end (lines fade out), then switches. Skipped on desktop (toggle hidden), for reduced motion, and
// where Element.animate is missing.
function animatePanelSwitch(panel, btn, min) {
  const apply = () => panel.classList.toggle('rpanel--min', min);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof panel.animate !== 'function' || getComputedStyle(btn).display === 'none') { apply(); return; }
  const from = panel.getBoundingClientRect().height; // mid-flight this is the animated size
  if (panel._gvnAnim) panel._gvnAnim.cancel(); // its cleanup lands the previous target state
  apply();
  const to = panel.getBoundingClientRect().height;
  if (!from || !to || Math.abs(from - to) < 1) return;
  if (min) panel.classList.remove('rpanel--min'); // collapse: keep showing the expanded content while shrinking
  const pane = [...panel.querySelectorAll('.tab-content')].find((el) => getComputedStyle(el).display !== 'none');
  const kids = [...panel.children];
  const paneH = pane ? pane.getBoundingClientRect().height : 0;
  panel.style.justifyContent = 'flex-end';
  kids.forEach((el) => { el.style.flexShrink = '0'; });
  if (pane && paneH) pane.style.flex = '0 0 ' + paneH + 'px';
  const opts = { duration: PANEL_ANIM_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' };
  const anim = panel.animate([
    { flexBasis: from + 'px', flexGrow: 0, flexShrink: 0, minHeight: from + 'px', maxHeight: from + 'px' },
    { flexBasis: to + 'px', flexGrow: 0, flexShrink: 0, minHeight: to + 'px', maxHeight: to + 'px' },
  ], opts);
  panel._gvnAnim = anim;
  const fade = panel.querySelectorAll(min ? '.chat-messages, .sidebar-tabs' : '.sidebar-tabs, .tab-content--active');
  const fades = [...fade].map((el) => el.animate(min ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], opts));
  anim.onfinish = anim.oncancel = () => {
    if (panel._gvnAnim !== anim) return;
    panel._gvnAnim = null;
    fades.forEach((a) => a.cancel());
    panel.style.justifyContent = '';
    kids.forEach((el) => { el.style.flexShrink = ''; });
    if (pane) pane.style.flex = '';
    apply();
  };
}
function setPanelMinimized(min, animate) {
  const panel = document.querySelector('.rpanel');
  const btn = document.getElementById('rpanel-toggle');
  if (!panel || !btn) return;
  if (animate) animatePanelSwitch(panel, btn, min);
  else panel.classList.toggle('rpanel--min', min);
  btn.setAttribute('aria-expanded', String(!min));
  const label = t(min ? 'room.panel_expand' : 'room.panel_collapse');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  try { localStorage.setItem(PANEL_MIN_KEY, min ? '1' : '0'); } catch (_) { /* private mode */ }
  if (!min && chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
}
if (!document.body.dataset.roomPanelToggleBound) {
  document.body.dataset.roomPanelToggleBound = '1';
  const toggle = document.getElementById('rpanel-toggle');
  let stored = null;
  try { stored = localStorage.getItem(PANEL_MIN_KEY); } catch (_) { /* ignore */ }
  setPanelMinimized(stored !== '0'); // default: minimized — the board stays the focus
  if (toggle) toggle.addEventListener('click', () => {
    // aria-expanded, not the class: mid-collapse the class still says expanded until the animation ends
    setPanelMinimized(toggle.getAttribute('aria-expanded') === 'true', true);
  });
}
window.RoomPanel = { setMinimized: setPanelMinimized };

// ---------------------------------------------------------------------------
// Leave room
// ---------------------------------------------------------------------------
const btnLeave = document.getElementById('btn-leave');
btnLeave.addEventListener('click', () => {
  const st = window.RoomState;
  if (st.gameState && st.gameState.status === 'ongoing' && st.mySlot !== null) {
    if (!confirm(t('room.confirm_leave'))) return;
  }
  window.RoomClient.emit('room:leave');
});

// ---------------------------------------------------------------------------
// Chat input
// ---------------------------------------------------------------------------
const btnSend = document.getElementById('btn-send');

function sendChatFrom(inputEl) {
  const text = inputEl.value.trim();
  if (!text) return;
  // Optimistic client-side pass — purely cosmetic UX; the server's own
  // filterMessage() pass in ChatHandler.handleMessage is authoritative for
  // what other participants actually receive.
  const filtered = window.ProfanityFilter ? window.ProfanityFilter.filterMessage(text) : text;
  window.RoomClient.emit('chat:message', { text: filtered });
  inputEl.value = '';
}

function sendChat() { sendChatFrom(chatInput); }

// #264: the filter (~39 KB) is only this cosmetic pre-send pass, so fetch it on first chat focus instead of at
// startup. Classic <script>, not import() — it is a UMD file that must attach window.ProfanityFilter (see
// room-entry.js header). Until it arrives, sendChatFrom sends the raw text and the server filters it.
function loadProfanityFilter() {
  if (window.ProfanityFilter || document.querySelector('script[src*="profanity-filter.js"]')) return;
  const s = document.createElement('script');
  s.src = '/js/profanity-filter.js?v=ffb6ee81';
  document.head.appendChild(s);
}
chatInput.addEventListener('focus', loadProfanityFilter);

btnSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
