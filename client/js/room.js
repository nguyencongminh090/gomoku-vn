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

  // Predicted turn-switch overlay (TODO.md #155 — Full CSP). Render-only,
  // symmetric to boardRenderer.optimisticStone: sendMove() sets it so the
  // turn-bar/timer flip to the opponent with 0ms perceived latency, but it
  // never writes gameState.currentTurn/timerValues — those stay the real,
  // server-confirmed values, so a rollback is just active:false, never a
  // hand-written "restore".
  predictedTurn: { active: false, forColor: null, snapshotTimerValues: null, switchedAtLocalTs: null },

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

// Collapsing the drawer is a purely VISUAL clip: .panel-right-shell shrinks to
// the rail width while .panel-right keeps its full width inside it, so
// overflow:hidden cuts the content off at the inline-start edge and
// justify-content:flex-end leaves the rail showing (room-zen.css — deliberate,
// it avoids reflowing the text every time the drawer animates). Nothing in that
// removes the clipped content from the page: measured with Playwright, Tab from
// the topnav still walked into #chat-input and #btn-send while they were
// invisible, and a screen reader still read the whole closed drawer
// (TODO.md #138).
//
// `inert` is the missing half — a DOM attribute, not a style, so it can only be
// applied from here. Applied to the content columns only: .sidebar-tabs (the
// rail) must stay focusable, since its buttons are the sole way to open the
// drawer again. Mobile ≤768px uses the same class with a different mechanism
// (transform:translateY on the sheet), so the content is off-screen rather than
// clipped — same semantics needed, hence no media-query gate here.
const DRAWER_CONTENT_SELECTOR = '.panel-right .panel-players, .panel-right .tab-content';

function syncDrawerInert() {
  // .zen-drawer-collapsed has no matching CSS outside room-zen.css, so on other
  // skins the content is fully visible and must never be made inert.
  const hide = document.body.classList.contains('zen-room')
            && document.body.classList.contains('zen-drawer-collapsed');
  const regions = document.querySelectorAll(DRAWER_CONTENT_SELECTOR);

  // Making the element holding focus inert drops focus to <body>, which strands
  // a keyboard user with no position in the page. Hand it to the rail button
  // for the tab they were on — the one control that stays reachable — before
  // the attribute lands.
  if (hide) {
    const active = document.activeElement;
    for (const region of regions) {
      if (active && region.contains(active)) {
        const rail = document.querySelector('.tab-btn--active') || document.querySelector('.tab-btn');
        if (rail) rail.focus();
        break;
      }
    }
  }

  regions.forEach(region => { region.inert = hide; });
}

// The single writer for .zen-drawer-collapsed. #136 was caused by two code
// paths disagreeing about the drawer's state; `inert` has to stay in step with
// the class from all three places that move it (the breakpoint handler and the
// tab click below, plus room-socket.js's mobile auto-collapse on game:init), so
// they all go through here rather than each remembering to sync afterwards.
function setDrawerCollapsed(collapsed) {
  document.body.classList.toggle('zen-drawer-collapsed', collapsed);
  syncDrawerInert();
}

window.RoomDrawer = { setCollapsed: setDrawerCollapsed, syncInert: syncDrawerInert };
syncDrawerInert();   // match whatever state the document loaded in

// room-socket.js's game:init handler auto-collapses the drawer with a
// one-time `matchMedia('(max-width: 768px)').matches` check — nothing else
// ever undoes that, so if the viewport happened to be narrow for even a
// moment right when a match started (e.g. a briefly docked DevTools panel,
// a window mid-resize) the drawer stays collapsed forever afterward, even
// once the window is genuinely wide again (TODO.md #134). This only clears
// the stuck state once the viewport is provably no longer narrow; it never
// sets zen-drawer-collapsed itself, so the mobile auto-collapse and the
// manual tab-click toggle below are both untouched.
const drawerBreakpoint = window.matchMedia('(max-width: 768px)');
drawerBreakpoint.addEventListener('change', (e) => {
  if (!e.matches && document.body.classList.contains('zen-drawer-collapsed')) {
    setDrawerCollapsed(false);
    if (document.body.classList.contains('zen-room')) refitBoardAfterDrawer();
  }
});

// Switching tab and collapsing the drawer are two different intentions that
// used to share one code path (TODO.md #136). Everything that only *shows a
// tab* lives here and deliberately never touches zen-drawer-collapsed, so
// programmatic callers can't move the drawer as a side effect: room-ui.js
// bounces the user off a tab whose button just disappeared, and it used to do
// that by synthesising `chatBtn.click()` — a fake DOM event that re-entered
// the drawer branch below with `alreadyActive` computed from whatever the DOM
// happened to say at that moment. Expressing the intent directly removes that
// whole class of accident instead of adding a flag to detect it.
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

// Binding guard. A stale `?v=` on any cross-import makes the browser resolve a
// second module instance of this file and re-run its top level (the hazard
// CLAUDE.md's cache-busting rule documents, already shipped twice as a
// duplicate socket). Two copies of the listener below would turn an ordinary
// "switch to another tab" click into a collapse: the first copy removes the
// class and marks the button active, then the second copy — now seeing
// `alreadyActive === true` — toggles the drawer shut, at any viewport width.
// Confirmed live: injecting a second room.js instance also gets the tab kicked
// back to login by the duplicate socket. One binding per document, whatever
// the module graph does.
if (!document.body.dataset.roomTabsBound) {
  document.body.dataset.roomTabsBound = '1';

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Read the intent BEFORE mutating anything, so the decision can't be
      // taken from state this handler itself just wrote.
      const alreadyActive = btn.classList.contains('tab-btn--active');
      const collapsedNow = document.body.classList.contains('zen-drawer-collapsed');
      const tabId = btn.getAttribute('data-tab');

      activateTab(tabId);

      // Re-clicking the already-active tab toggles the zen-room drawer
      // collapsed/open instead of doing nothing; switching to a different tab
      // always re-opens it. .zen-drawer-collapsed has no matching CSS outside
      // room-zen.css, so this is a no-op on other skins.
      if (alreadyActive) {
        setDrawerCollapsed(!collapsedNow);
      } else {
        setDrawerCollapsed(false);
      }

      // Opening/collapsing the desktop drawer changes .board-area-shell's
      // padding-right, i.e. the board's entire width budget — but nothing fires
      // a window resize, so without this the canvas keeps its old size and is
      // either cropped by .board-canvas-wrap's overflow:hidden (drawer opened)
      // or leaves the reclaimed space empty (drawer collapsed). Re-fit once the
      // 0.35s padding transition has settled, and once on the way there so the
      // board doesn't visibly jump only at the end.
      if (document.body.classList.contains('zen-room')) refitBoardAfterDrawer();
    });
  });
}

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

  // Nothing else ever released focus from this input (TODO.md #151) — once a
  // mobile user tapped it, it stayed document.activeElement even after they
  // tapped back onto the board, so the browser kept re-scrolling the page to
  // hold it above the on-screen keyboard. #board-area-shell is a stable
  // container GameUI never replaces wholesale, unlike #board-area itself.
  const boardAreaShell = document.getElementById('board-area-shell');
  if (boardAreaShell) {
    boardAreaShell.addEventListener('pointerdown', () => {
      if (document.activeElement === quickChatInput) quickChatInput.blur();
    });
  }
}

