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
 *   [ ] Chat send on Enter and button click (both the in-tab input and the
 *       mobile quick chat bar)
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
  drawOfferPending:  null,   // { from, fromName } | null
  timeRequestPending:null,   // { from, fromName, bonus } | null

  // Board preferences (persisted to localStorage)
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

// zen-room's panel defaults OPEN at every width, because the seat/ready
// buttons inside .panel-players are the first thing a player needs and they
// live in it. On a phone the panel is a bottom sheet (room-zen.css ≤768px)
// rather than a side drawer, so "open" costs board height, not board width —
// and room-socket.js collapses it down to the tab bar as soon as game:init
// arrives, i.e. exactly when the board starts mattering more than the panel.

// Re-measures the board against the shell's new content box while the drawer
// animates. Called by the tab handler below; kept here so both the mid-flight
// and the settled measurement share one definition.
function refitBoardAfterDrawer() {
  const refit = () => {
    const st = window.RoomState;
    if (st && st.boardRenderer) st.boardRenderer.resize();
  };
  requestAnimationFrame(refit);
  setTimeout(refit, 180);
  setTimeout(refit, 400);   // just past the 0.35s transition
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Re-clicking the already-active tab toggles the zen-room drawer
    // collapsed/open instead of doing nothing; switching to a different tab
    // always re-opens it. .zen-drawer-collapsed has no matching CSS outside
    // room-zen.css, so this is a no-op on other skins.
    const alreadyActive = btn.classList.contains('tab-btn--active');
    const collapsedNow = document.body.classList.contains('zen-drawer-collapsed');

    tabBtns.forEach(b => b.classList.remove('tab-btn--active'));
    tabContents.forEach(c => c.classList.remove('tab-content--active'));
    btn.classList.add('tab-btn--active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('tab-content--active');

    if (alreadyActive) {
      document.body.classList.toggle('zen-drawer-collapsed', !collapsedNow);
    } else {
      document.body.classList.remove('zen-drawer-collapsed');
    }

    // Opening/collapsing the desktop drawer changes .board-area-shell's
    // padding-right, i.e. the board's entire width budget — but nothing fires
    // a window resize, so without this the canvas keeps its old size and is
    // either cropped by .board-canvas-wrap's overflow:hidden (drawer opened)
    // or leaves the reclaimed space empty (drawer collapsed). Re-fit once the
    // 0.35s padding transition has settled, and once on the way there so the
    // board doesn't visibly jump only at the end.
    if (document.body.classList.contains('zen-room')) refitBoardAfterDrawer();

    if (tabId === 'tab-chat') chatMessages.scrollTop = chatMessages.scrollHeight;
  });
});

const chatInput = document.getElementById('chat-input');

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

// Shared by both the in-tab chat input and the mobile quick chat bar
// (#quick-chat-input/#quick-chat-send below) — same emit, same optimistic
// filter pass, just reading from/clearing whichever input element sent it.
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

btnSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// ---------------------------------------------------------------------------
// Quick chat bar (mobile) — a second, always-visible input pinned to the
// bottom of the viewport (room-zen.css), separate from #chat-input-wrapper
// so the tab's full chat history/input never moves in the DOM. Same
// sendChatFrom() path, just a different input element.
// ---------------------------------------------------------------------------
const quickChatInput = document.getElementById('quick-chat-input');
const quickChatSend  = document.getElementById('quick-chat-send');
if (quickChatInput && quickChatSend) {
  const sendQuickChat = () => sendChatFrom(quickChatInput);
  quickChatSend.addEventListener('click', sendQuickChat);
  quickChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendQuickChat();
  });
}

