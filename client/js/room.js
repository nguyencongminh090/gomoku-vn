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
 *   5. Focus mode toggle + keyboard shortcuts
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
 *   [ ] Start modal appears once both slots are filled; countdown ticks down
 *   [ ] Clicking Start shows "waiting for opponent" until the other confirms
 *   [ ] Not confirming within 30s vacates that seat (toast shown to that player)
 *   [ ] Settings change emitted correctly (host only)
 *   [ ] Chat send on Enter and button click
 *   [ ] Focus mode toggle (F key, button click, Escape)
 *   [ ] Game overlay close and rematch buttons work
 *   [ ] Overlay removed when game:init fires for new game
 */

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
(function authGuard() {
  if (!localStorage.getItem('gvn_token')) {
    window.location.replace('login.html');
  }
})();

// ---------------------------------------------------------------------------
// Socket client — exposed globally so modules can emit without circular deps
// ---------------------------------------------------------------------------
window.RoomClient = new SocketClient();
const myUser = window.RoomClient.getUserInfo();

if (!myUser) {
  window.location.replace('login.html');
}

// ---------------------------------------------------------------------------
// Shared state singleton (read/written by all modules)
// ---------------------------------------------------------------------------
window.RoomState = {
  // Socket / user
  myUser,

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

  // Focus mode
  focusMode: false,
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

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('tab-btn--active'));
    tabContents.forEach(c => c.classList.remove('tab-content--active'));
    btn.classList.add('tab-btn--active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('tab-content--active');
    if (tabId === 'tab-chat') chatMessages.scrollTop = chatMessages.scrollHeight;
  });
});

// ---------------------------------------------------------------------------
// Focus mode
// ---------------------------------------------------------------------------
const btnFocus        = document.getElementById('btn-focus');
const chatInputWrapper = document.getElementById('chat-input-wrapper');
const tabChat         = document.getElementById('tab-chat');

btnFocus.addEventListener('click', () => {
  const st = window.RoomState;
  st.focusMode = !st.focusMode;
  document.body.classList.toggle('room--focus', st.focusMode);

  if (st.focusMode) {
    document.body.appendChild(chatInputWrapper);
  } else {
    if (tabChat) tabChat.querySelector('.chat-panel').appendChild(chatInputWrapper);
  }

  if (st.boardRenderer) {
    setTimeout(() => st.boardRenderer.resize(), 50);
  }
});

// Keyboard shortcuts
const chatInput = document.getElementById('chat-input');
document.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const st = window.RoomState;
  if ((e.key === 'f' || e.key === 'F') && st.gameState && st.gameState.status === 'ongoing') {
    e.preventDefault();
    btnFocus.click();
  } else if (e.key === 'Escape' && st.focusMode) {
    e.preventDefault();
    btnFocus.click();
  }
});

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

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  // Optimistic client-side pass — purely cosmetic UX; the server's own
  // filterMessage() pass in ChatHandler.handleMessage is authoritative for
  // what other participants actually receive.
  const filtered = window.ProfanityFilter ? window.ProfanityFilter.filterMessage(text) : text;
  window.RoomClient.emit('chat:message', { text: filtered });
  chatInput.value = '';
}

btnSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// ---------------------------------------------------------------------------
// Game overlay buttons
// ---------------------------------------------------------------------------
const gameOverlay     = document.getElementById('game-overlay');
const btnRematch      = document.getElementById('btn-rematch');
const btnCloseOverlay = document.getElementById('btn-close-overlay');

btnRematch.addEventListener('click', () => {
  gameOverlay.classList.remove('visible');
  window.RoomClient.emit('game:rematch');
});

btnCloseOverlay.addEventListener('click', () => {
  gameOverlay.classList.remove('visible');
  // Declining a rematch stands the player up (same as the seat's stand-up
  // button) instead of leaving them seated-but-not-ready. This keeps Start
  // Modal's only trigger "I am seated", so it can never reappear as a side
  // effect of the *other* player's rematch click while this player still has
  // an unactioned game overlay open — see TODO.md #35 / instruction.md §B35.
  window.RoomState.standRequested = true;
  window.RoomClient.emit('room:stand');
});
