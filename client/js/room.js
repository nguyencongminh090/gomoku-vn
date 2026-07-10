'use strict';

/**
 * room.js — Room page controller.
 *
 * Responsibilities:
 *   - Render player slots with roles and ready status
 *   - Render settings panel (editable for host, read-only for others)
 *   - Handle sit/stand/ready/leave/kick actions
 *   - In-room chat with system messages
 *   - Auto-join room via sessionStorage or socket reconnect
 *
 * Manual test checklist:
 *   [ ] Room data populates from room:joined event
 *   [ ] Player slots render correct name/role/ready state
 *   [ ] Sit button places user in empty slot
 *   [ ] Stand button vacates slot
 *   [ ] Ready/cancel-ready toggle works
 *   [ ] Host sees editable settings; others see read-only info
 *   [ ] Settings change resets ready states
 *   [ ] Chat messages appear in real time (including system)
 *   [ ] Kick button visible only to host, works correctly
 *   [ ] Leave button navigates back to lobby
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
// Socket client
// ---------------------------------------------------------------------------
const client = new SocketClient();
const myUser = client.getUserInfo();

if (!myUser) {
  window.location.replace('login.html');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let roomData  = null;   // Latest room:joined / room:updated payload
let myRole    = null;   // 'host' | 'player' | 'guest'
let mySlot    = null;   // 1 | 2 | null
let isReady   = false;

const BOARD_DISPLAY_KEY = 'play3cr_board_display';
let boardDisplayMode = localStorage.getItem(BOARD_DISPLAY_KEY) || 'paper';
if (!['paper', 'stone'].includes(boardDisplayMode)) boardDisplayMode = 'paper';

// Game state
let gameState = null;   // From game:init
let boardRenderer = null;
let timerValues = { black: 0, white: 0 };
let drawOfferPending = null; // { from, fromName } or null
let timeRequestPending = null; // { from, fromName, bonus } or null

// Focus mode state
let focusMode = false;

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const statusBanner   = document.getElementById('status-banner');
const roomIdNav      = document.getElementById('room-id-nav');
const btnLeave       = document.getElementById('btn-leave');
const slot1Content   = document.getElementById('slot-1-content');
const slot2Content   = document.getElementById('slot-2-content');
const slot1Card      = document.getElementById('slot-1');
const slot2Card      = document.getElementById('slot-2');
const actionButtons  = document.getElementById('action-buttons');
const settingsPanel  = document.getElementById('settings-panel');
const settingsBody   = document.getElementById('settings-body');
const usersPanel     = document.getElementById('users-panel');
const usersList      = document.getElementById('users-list');
const chatMessages   = document.getElementById('chat-messages');
const chatInput      = document.getElementById('chat-input');
const btnSend        = document.getElementById('btn-send');
const scorePanel     = document.getElementById('score-panel');
const scoreBody      = document.getElementById('score-body');
const boardArea      = document.getElementById('board-area');
const gameOverlay    = document.getElementById('game-overlay');
const overlayResult  = document.getElementById('overlay-result');
const overlayReason  = document.getElementById('overlay-reason');
const btnRematch     = document.getElementById('btn-rematch');
const btnCloseOverlay = document.getElementById('btn-close-overlay');
const floatContainer = document.getElementById('float-messages');
const btnFocus       = document.getElementById('btn-focus');

client.bindStatusBanner(statusBanner);

// ---------------------------------------------------------------------------
// Tabs logic
// ---------------------------------------------------------------------------
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all
    tabBtns.forEach(b => b.classList.remove('tab-btn--active'));
    tabContents.forEach(c => c.classList.remove('tab-content--active'));

    // Add active class to clicked tab
    btn.classList.add('tab-btn--active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('tab-content--active');
    
    // Auto scroll chat to bottom when chat tab is opened
    if (tabId === 'tab-chat') {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
});

// ---------------------------------------------------------------------------
// Focus mode toggle
// ---------------------------------------------------------------------------
const chatInputWrapper = document.getElementById('chat-input-wrapper');
const tabChat = document.getElementById('tab-chat');

btnFocus.addEventListener('click', () => {
  focusMode = !focusMode;
  document.body.classList.toggle('room--focus', focusMode);
  
  if (focusMode) {
    // Move chat input to body so it stays visible
    document.body.appendChild(chatInputWrapper);
  } else {
    // Put it back into the chat tab
    if (tabChat) {
      tabChat.querySelector('.chat-panel').appendChild(chatInputWrapper);
    }
  }

  if (boardRenderer) {
    setTimeout(() => boardRenderer.resize(), 50);
  }
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if ((e.key === 'f' || e.key === 'F') && gameState && gameState.status === 'ongoing') {
    e.preventDefault();
    btnFocus.click();
  } else if (e.key === 'Escape' && focusMode) {
    e.preventDefault();
    btnFocus.click();
  }
});

// ---------------------------------------------------------------------------
// Leave room
// ---------------------------------------------------------------------------
btnLeave.addEventListener('click', () => {
  if (gameState && gameState.status === 'ongoing' && mySlot !== null) {
    if (!confirm(t('room.confirm_leave'))) return;
  }
  client.emit('room:leave');
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  client.emit('chat:message', { text });
  chatInput.value = '';
}

btnSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------

// Initial room data (on connect/reconnect)
client.on('room:joined', (data) => {
  roomData = data;
  
  // Update URL to include the room ID so it's shareable and reloadable
  const url = new URL(window.location);
  if (url.searchParams.get('id') !== data.roomId) {
    url.searchParams.set('id', data.roomId);
    window.history.replaceState({}, '', url);
  }

  // Restore game state if reconnecting mid-game
  if (data.gameState) {
    gameState = data.gameState;
    timerValues = data.timer || timerValues;
    if (gameState.swap2 && gameState.swap2.enabled && gameState.swap2.openingPhase !== 'play') {
      // Reconnect during the Swap2 opening — render the opening UI.
      initBoard();
      renderSwap2();
    } else {
      initBoard();
      updateBoardState();
    }
  }
  updateUI();
});

// Room state updates
client.on('room:updated', (data) => {
  roomData = data;
  updateUI();
});

// Left room
client.on('room:left', () => {
  window.location.href = 'index.html';
});

// Kicked from room
client.on('room:kicked', (data) => {
  showToast(data.message || t('room.kicked'), 'error');
  setTimeout(() => { window.location.href = 'index.html'; }, 1500);
});

// Room destroyed (e.g., idle timeout)
client.on('room:destroyed', (data) => {
  showToast(data.message, 'error');
  setTimeout(() => { window.location.href = 'index.html'; }, 1500);
});

// Room error
client.on('room:error', (data) => {
  if (!roomData) {
    // Not in a room yet — error during create/join, go back to lobby
    showToast(data.message, 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    return;
  }
  appendSystemMessage(`⚠ ${data.message}`);
});

// Chat messages
client.on('chat:message', (msg) => {
  appendChatMessage(msg);
});

client.on('chat:error', (data) => {
  appendSystemMessage(`⚠ ${data.message}`);
});

// Game error
client.on('game:error', (data) => {
  appendSystemMessage(`⚠ ${data.message}`);
});

// Game init — game starts
client.on('game:init', (data) => {
  gameState = data;
  timerValues = data.timer || { black: data.timerSeconds || 60, white: data.timerSeconds || 60 };
  drawOfferPending = null;
  timeRequestPending = null; // Reset time request state for new game
  gameOverlay.classList.remove('visible');
  btnFocus.style.display = 'flex'; // Show focus button during game

  if (gameState.swap2 && gameState.swap2.enabled && gameState.swap2.openingPhase !== 'play') {
    // Swap2 opening in progress — build the board DOM, then render opening UI.
    initBoard();
    renderSwap2();
  } else {
    initBoard();
    updateBoardState();
  }
  updateUI();
});

// Game moved
client.on('game:moved', (data) => {
  if (!gameState) return;

  // A move cancels any pending draw offer server-side, so clear it locally too
  if (drawOfferPending) {
    drawOfferPending = null;
    renderDrawPrompt();
  }

  // Update local board state
  const colorVal = data.color === 'BLACK' ? 1 : 2;
  gameState.board[data.y][data.x] = colorVal;
  gameState.currentTurn = data.nextTurn;
  gameState.moveCount = data.moveCount;
  if (!gameState.moveHistory) gameState.moveHistory = [];
  gameState.moveHistory.push({ x: data.x, y: data.y, color: data.color, timestamp: Date.now() });
  if (data.timer) timerValues = data.timer;
  if (data.gameOver) gameState.status = 'finished';
  if (data.result) gameState.result = data.result;

  updateBoardState();
  updateUI();
});

// Swap2 opening state update
client.on('game:swap2_state', (data) => {
  if (!gameState) return;

  gameState.board = data.board;
  gameState.currentTurn = data.currentTurn;
  gameState.moveCount = data.moveCount;
  if (data.moveHistory) gameState.moveHistory = data.moveHistory;
  gameState.swap2 = data.swap2;
  gameState.players = data.players;
  gameState._nextColor = data.nextColor;
  if (data.lastStone) gameState._lastStone = data.lastStone;

  if (gameState.swap2.openingPhase !== 'play') {
    renderSwap2();
  } else {
    // Opening resolved — switch to normal play rendering.
    updateBoardState();
    renderGameControls();

    const turnBar = document.getElementById('turn-bar');
    if (turnBar) turnBar.style.visibility = 'visible';

    const blackP = gameState.players.find(p => p.color === 'BLACK');
    const whiteP = gameState.players.find(p => p.color === 'WHITE');
    const bNameEl = document.getElementById('tb-black-name');
    const wNameEl = document.getElementById('tb-white-name');
    if (bNameEl) bNameEl.textContent = blackP ? blackP.displayName : '—';
    if (wNameEl) wNameEl.textContent = whiteP ? whiteP.displayName : '—';
  }
});

// Timer tick
client.on('timer:tick', (data) => {
  timerValues = data;
  renderTimers();
});

// Game ended
client.on('game:ended', (data) => {
  if (data.scoreTable && roomData) roomData.scoreTable = data.scoreTable;
  
  if (gameState) {
    gameState.status = 'finished';
    if (data.result) gameState.result = data.result;
  }
  
  drawOfferPending = null;
  renderDrawPrompt(); // Explicitly clear the draw prompt
  btnFocus.style.display = 'none'; // Hide focus button
  
  // Exit focus mode on game end
  if (focusMode) {
    focusMode = false;
    document.body.classList.remove('room--focus');
    if (tabChat) tabChat.querySelector('.chat-panel').appendChild(chatInputWrapper);
  }
  
  showGameOverlay(data.result);
  updateUI();
});

// Time request offered (from either player)
client.on('game:time_offered', (data) => {
  timeRequestPending = data;
  renderTimePrompt();
});

// Time request granted (opponent accepted)
client.on('game:time_granted', (data) => {
  timeRequestPending = null;
  renderTimePrompt();
  updateBoardState();
});

// Time request declined
client.on('game:time_declined', (data) => {
  timeRequestPending = null;
  renderTimePrompt();
  updateBoardState();
});

// Draw offer received
client.on('game:draw_offered', (data) => {
  drawOfferPending = data;
  renderDrawPrompt();
});

// Draw declined
client.on('game:draw_declined', () => {
  drawOfferPending = null;
  renderDrawPrompt();
});

// [5.2] Game interrupted (opponent disconnected)
client.on('game:interrupted', (data) => {
  appendSystemMessage(t('room.disconnected', { name: data.playerName, seconds: data.secondsLeft }));
  if (gameState) gameState.status = 'interrupted';
  updateBoardState();
});

// [5.2] Game resumed (opponent reconnected)
client.on('game:resumed', (data) => {
  appendSystemMessage(t('room.reconnected'));
  if (gameState) gameState.status = 'ongoing';
  updateBoardState();
});

// ---------------------------------------------------------------------------
// Room entry: process intent from lobby OR reconnect
// ---------------------------------------------------------------------------
// The lobby stores an intent in sessionStorage (create or join).
// This page's socket will execute the intent once connected.
// This avoids the race where the lobby socket disconnects and destroys
// the room before this page's socket can take over.
// ---------------------------------------------------------------------------

let intentProcessed = false;

function processRoomIntent() {
  if (intentProcessed) return;
  intentProcessed = true;

  const raw = sessionStorage.getItem('gvn_room_intent');
  sessionStorage.removeItem('gvn_room_intent');

  if (raw) {
    try {
      const intent = JSON.parse(raw);
      if (intent.action === 'create') {
        client.emit('room:create', { settings: intent.settings || {} });
      } else if (intent.action === 'join') {
        client.emit('room:join', { roomId: intent.roomId });
      }
    } catch { /* ignore parse error */ }
  } else {
    // No intent in sessionStorage. Check URL parameters for direct link.
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('id');
    if (roomId) {
      client.emit('room:join', { roomId });
    }
  }
  // If no intent and no URL param, SocketHandler's reconnect logic will auto-emit room:joined
  // if the user was already in a room.
}

// Process intent when socket connects (may fire immediately or after reconnect)
client.on('connect', () => {
  processRoomIntent();
});
// Also try immediately in case connect already fired before this listener
if (client.socket && client.socket.connected) {
  processRoomIntent();
}

// ---------------------------------------------------------------------------
// UI Update (main render function)
// ---------------------------------------------------------------------------

function updateUI() {
  if (!roomData) return;

  // Update nav
  roomIdNav.textContent = roomData.roomName || roomData.roomId;
  document.title = `Play3CR — ${roomData.roomName || roomData.roomId}`;

  // Find my user in the room
  const me = roomData.users.find(u => u.userId === myUser.userId);
  myRole = me ? me.role : null;
  mySlot = me ? me.slot : null;
  isReady = me ? me.ready : false;

  // Render slots
  renderSlot(1, slot1Content, slot1Card);
  renderSlot(2, slot2Content, slot2Card);

  // Render action buttons
  renderActionButtons();

  // Render settings
  renderSettings();

  // Render guest users list
  renderUsersList();

  // Render score table
  renderScoreTable();

  // Make sure empty board is rendered if no game is active
  if (!gameState) {
    initBoard();
  }
}

// ---------------------------------------------------------------------------
// Render player slot
// ---------------------------------------------------------------------------

function renderSlot(slotNum, contentEl, cardEl) {
  const player = roomData.users.find(u => u.slot === slotNum);
  cardEl.classList.toggle('slot-card--active', !!player);

  if (!player) {
    // Empty slot — clickable to sit down (only if I'm not seated and not playing)
    const canSit = mySlot === null && roomData.state !== 'playing';
    contentEl.innerHTML = `
      <div class="slot-card__empty ${canSit ? 'slot-card__clickable' : ''}"
           ${canSit ? `onclick="sitDown(${slotNum})"` : ''}
           title="${canSit ? 'Nhấn để ngồi vào' : ''}">
        #${slotNum}
      </div>
    `;
    return;
  }

  const isMe = player.userId === myUser.userId;
  const roleBadge = player.role === 'host'
    ? '<span class="slot-card__role slot-card__role--host">Chủ phòng</span>'
    : '';

  // X button to stand up (only for myself, and not during a game)
  const standBtn = (isMe && roomData.state !== 'playing')
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

// ---------------------------------------------------------------------------
// Render action buttons
// ---------------------------------------------------------------------------

function renderActionButtons() {
  if (!myRole) {
    actionButtons.innerHTML = '';
    return;
  }

  // During a game, no lobby-style action buttons
  if (roomData.state === 'playing') {
    actionButtons.innerHTML = '';
    return;
  }

  let html = '';

  // Only show ready/cancel-ready when seated
  if (mySlot !== null) {
    if (isReady) {
      html += `<button class="btn-slot btn-slot--cancel-ready" onclick="toggleReady()">Huỷ sẵn sàng</button>`;
    } else {
      html += `<button class="btn-slot btn-slot--ready" onclick="toggleReady()">Sẵn sàng</button>`;
    }
  }

  actionButtons.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Render settings panel
// ---------------------------------------------------------------------------

function getWinningRuleLabel(rule) {
  const key = rule || 'freestyle';
  return {
    freestyle: t('rule.freestyle'),
    standard: t('rule.standard'),
    caro: t('rule.caro'),
  }[key] || t('rule.freestyle');
}

function getTimerModeLabel(mode) {
  return {
    per_move: t('room.timer_per_move'),
    per_game: t('room.timer_per_game'),
    blitz: t('room.timer_blitz'),
  }[mode] || t('room.timer_per_move');
}

function getTimerSettingsText(settings) {
  const base = `${settings.timerSeconds}s`;
  const inc = settings.timerIncrementSeconds || 0;
  const mode = getTimerModeLabel(settings.timerMode);
  return settings.timerMode === 'blitz' ? `${base} + ${inc}s — ${mode}` : `${base} — ${mode}`;
}

function renderBoardDisplayControl() {
  return `
    <div class="setting-row">
      <span class="setting-label">${t('settings.display')}</span>
      <div class="pill-group">
        <input type="radio" name="boardDisplayMode" id="bdm-paper" value="paper" ${boardDisplayMode === 'paper' ? 'checked' : ''} onchange="updateBoardDisplayMode()" />
        <label for="bdm-paper">${t('settings.display_paper')}</label>
        <input type="radio" name="boardDisplayMode" id="bdm-stone" value="stone" ${boardDisplayMode === 'stone' ? 'checked' : ''} onchange="updateBoardDisplayMode()" />
        <label for="bdm-stone">${t('settings.display_stone')}</label>
      </div>
    </div>
  `;
}

function renderSettings() {
  const s = roomData.settings;

  if (myRole === 'host' && roomData.state !== 'playing') {
    // Host sees editable settings
    settingsBody.innerHTML = `
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
      ${renderBoardDisplayControl()}
    `;
    settingsBody.classList.add('open');
  } else {
    // Non-host or playing: read-only info
    const ruleNames = [];
    ruleNames.push(getWinningRuleLabel(s.winningRule));
    if (s.ruleWall) ruleNames.push(t('room.rule_wall'));
    if (s.rulePortal) ruleNames.push(t('room.rule_portal'));
    if (s.ruleSwap2) ruleNames.push('Swap2');
    const ruleText = ruleNames.length > 0 ? ruleNames.join(', ') : t('room.rule_basic');
    const timerText = getTimerSettingsText(s);

    settingsBody.innerHTML = `
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
      ${renderBoardDisplayControl()}
    `;
    settingsBody.classList.add('open');
  }
}

window.addEventListener('langchange', () => {
  if (roomData) renderSettings();
});

// ---------------------------------------------------------------------------
// Render guest users list
// ---------------------------------------------------------------------------

function renderUsersList() {
  const guests = roomData.users.filter(u => u.slot === null);

  if (guests.length === 0) {
    usersPanel.style.display = 'none';
    return;
  }
  usersPanel.style.display = '';

  let html = '';
  for (const g of guests) {
    const kickBtn = (myRole === 'host' && g.userId !== myUser.userId && roomData.state !== 'playing')
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

// ---------------------------------------------------------------------------
// Render score table
// ---------------------------------------------------------------------------

function renderScoreTable() {
  const st = roomData.scoreTable || {};
  const seatedPlayers = roomData.users.filter(u => u.slot === 1 || u.slot === 2);
  
  if (seatedPlayers.length === 0 && Object.keys(st).length === 0) {
    scorePanel.style.display = 'none';
    return;
  }
  
  scorePanel.style.display = '';

  let html = '';
  const combined = { ...st };
  
  // Ensure seated players are in the score table with 0s
  for (const p of seatedPlayers) {
    if (!combined[p.userId]) {
      combined[p.userId] = { name: p.displayName, win: 0, loss: 0, draw: 0 };
    }
  }

  for (const [, entry] of Object.entries(combined)) {
    html += `
      <tr>
        <td>${escapeHtml(entry.name || '—')}</td>
        <td>${entry.win || 0}</td>
        <td>${entry.loss || 0}</td>
        <td>${entry.draw || 0}</td>
      </tr>
    `;
  }
  scoreBody.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Chat rendering
// ---------------------------------------------------------------------------

function appendChatMessage(msg) {
  const div = document.createElement('div');

  if (msg.isSystem) {
    div.className = 'chat-msg chat-msg--system';
    div.textContent = msg.text;
  } else {
    div.className = 'chat-msg';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-msg__name';
    nameSpan.textContent = msg.from + ':';
    div.appendChild(nameSpan);
    div.appendChild(document.createTextNode(' ' + msg.text));
  }

  chatMessages.appendChild(div);
  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Also show as float message during game (system notices go to toasts instead)
  if (gameState && !msg.isSystem) {
    showFloatMessage(msg);
  }
}

function appendSystemMessage(text) {
  appendChatMessage({ from: null, text, isSystem: true, timestamp: Date.now() });
  // Surface system notices via a toast as well (warnings flagged with ⚠ → error style).
  showToast(text, text.indexOf('⚠') !== -1 ? 'error' : 'info');
}

// ---------------------------------------------------------------------------
// Float Messages
// ---------------------------------------------------------------------------

function showFloatMessage(msg) {
  if (!floatContainer) return;

  const el = document.createElement('div');
  el.className = msg.isSystem ? 'float-msg float-msg--system' : 'float-msg';

  if (msg.isSystem) {
    el.textContent = msg.text;
  } else {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'float-msg__name';
    nameSpan.textContent = msg.from + ':';
    el.appendChild(nameSpan);
    el.appendChild(document.createTextNode(' ' + msg.text));
  }

  floatContainer.appendChild(el);

  // Duration inversely proportional to number of visible messages
  // Base: 10s for 1 message. More messages = shorter display.
  const visibleCount = floatContainer.children.length;
  const duration = Math.max(3000, 10000 / visibleCount);

  // Set animation-duration for the fade-out
  el.style.animationDuration = `0.3s, ${duration}ms`;
  el.style.animationDelay = `0s, ${duration * 0.6}ms`;

  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, duration);

  // Cap max floating messages
  while (floatContainer.children.length > 6) {
    floatContainer.removeChild(floatContainer.firstChild);
  }
}

// ---------------------------------------------------------------------------
// Toast notifications (non-blocking, auto-dismiss)
// ---------------------------------------------------------------------------

window.showToast = function(message, type = 'info', duration = 4000) {
  // Lazily create the toast container if it doesn't exist yet.
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }

  const el = document.createElement('div');
  el.className = 'toast toast--' + type;
  el.textContent = message;

  // Mirror showFloatMessage: first animation (toast-in) plays immediately,
  // the second (toast-out) is delayed to near the end of the duration.
  el.style.animationDelay = '0s, ' + Math.max(duration - 400, 0) + 'ms';

  stack.appendChild(el);

  // Auto-remove after the full duration.
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, duration);

  // Cap visible toasts at 5; drop the oldest first.
  while (stack.children.length > 5) {
    stack.removeChild(stack.firstChild);
  }
};

// ---------------------------------------------------------------------------
// Action handlers (exposed globally for onclick)
// ---------------------------------------------------------------------------

window.sitDown = function(slot) {
  client.emit('room:sit', { slot });
};

window.standUp = function() {
  client.emit('room:stand');
};

window.toggleReady = function() {
  client.emit('room:ready');
};

window.kickUser = function(userId) {
  client.emit('room:kick', { userId });
};

window.updateSettings = function() {
  const boardSizeEl = document.querySelector('input[name="r-boardSize"]:checked');
  const timerModeEl = document.querySelector('input[name="r-timerMode"]:checked');
  const timerEl     = document.getElementById('r-timer');
  const timerIncrementEl = document.getElementById('r-timer-increment');
  const wallEl      = document.getElementById('r-wall');
  const portalEl    = document.getElementById('r-portal');

  if (!boardSizeEl || !timerModeEl) return;

  client.emit('room:settings', {
    settings: {
      boardSize: parseInt(boardSizeEl.value, 10),
      winningRule: (document.querySelector('input[name="r-winRule"]:checked') || {}).value || 'freestyle',
      ruleWall: wallEl ? wallEl.checked : false,
      rulePortal: portalEl ? portalEl.checked : false,
      ruleSwap2: (document.querySelector('input[name="r-openRule"]:checked') || {}).value === 'swap2',
      timerMode: timerModeEl.value,
      timerSeconds: timerEl ? (parseInt(timerEl.value, 10) || 60) : 60,
      timerIncrementSeconds: timerIncrementEl ? (parseInt(timerIncrementEl.value, 10) || 0) : 0,
    },
  });
};

window.updateBoardDisplayMode = function() {
  const modeEl = document.querySelector('input[name="boardDisplayMode"]:checked');
  const mode = modeEl ? modeEl.value : 'paper';
  boardDisplayMode = ['paper', 'stone'].includes(mode) ? mode : 'paper';
  localStorage.setItem(BOARD_DISPLAY_KEY, boardDisplayMode);
  if (boardRenderer) {
    boardRenderer.setState({
      displayMode: boardDisplayMode,
      moveHistory: gameState ? (gameState.moveHistory || []) : [],
    });
  }
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// Board / Game rendering
// ---------------------------------------------------------------------------

/** Create the canvas and BoardRenderer when a game starts or room loads. */
function initBoard() {
  if (!roomData) return;
  const boardSize = gameState ? gameState.boardSize : roomData.settings.boardSize;

  if (!boardRenderer) {
    boardArea.innerHTML = `
      <div class="board-area-inner">
        <div class="turn-bar" id="turn-bar" style="visibility: hidden">
          <div class="turn-bar__player" id="tb-black">
            <div class="turn-bar__info">
              <span class="turn-bar__stone turn-bar__stone--black"></span>
              <span class="turn-bar__name" id="tb-black-name"></span>
            </div>
            <span class="turn-bar__timer" id="tb-black-timer"></span>
          </div>
          <div class="game-info__turn" id="turn-label"></div>
          <div class="turn-bar__player" id="tb-white">
            <span class="turn-bar__timer" id="tb-white-timer"></span>
            <div class="turn-bar__info turn-bar__info--right">
              <span class="turn-bar__name" id="tb-white-name"></span>
              <span class="turn-bar__stone turn-bar__stone--white"></span>
            </div>
          </div>
        </div>
        <div class="board-canvas-wrap" id="board-wrap">
          <canvas id="game-canvas"></canvas>
        </div>
        <div class="game-controls" id="game-controls"></div>
        <div id="draw-prompt-area"></div>
        <div id="time-prompt-area"></div>
      </div>
    `;

    const canvas = document.getElementById('game-canvas');
    boardRenderer = new BoardRenderer(canvas, {
      boardSize: boardSize,
      onCellClick: (x, y) => {
        // Swap2 opening: route placements to the opening handler instead.
        if (gameState && gameState.swap2 && gameState.swap2.enabled && gameState.swap2.openingPhase !== 'play') {
          if (gameState.currentTurn === myUser.userId
              && (gameState.swap2.openingPhase === 'place3' || gameState.swap2.openingPhase === 'place2')) {
            client.emit('game:swap2_place', { x, y });
          }
          return;
        }
        if (gameState && gameState.status === 'ongoing') {
          client.emit('game:move', { x, y });
        }
      },
    });

    window._boardResizeHandler = () => { if (boardRenderer) boardRenderer.resize(); };
    window.addEventListener('resize', window._boardResizeHandler);
  }

  if (!gameState) {
    // Render empty board
    boardRenderer.setState({
      boardSize: boardSize,
      board: Array(boardSize).fill().map(() => Array(boardSize).fill(0)),
      walls: [], portals: [], firstMoveZones: [],
      showZones: false, interactive: false, lastMove: null, myColor: null,
      displayMode: boardDisplayMode, moveHistory: []
    });
    document.getElementById('turn-bar').style.visibility = 'hidden';
    document.getElementById('game-controls').innerHTML = '';
  } else {
    // Render active game
    document.getElementById('turn-bar').style.visibility = 'visible';
    const myPlayer = gameState.players.find(p => p.userId === myUser.userId);
    const myColorStr = myPlayer ? myPlayer.color : null;

    boardRenderer.setState({
      boardSize: gameState.boardSize,
      board: gameState.board,
      walls: gameState.walls,
      portals: gameState.portals,
      firstMoveZones: gameState.firstMoveZones,
      showZones: gameState.walls.length > 0 && gameState.moveCount === 0,
      myColor: myColorStr,
      interactive: !!myColorStr && gameState.status === 'ongoing',
      displayMode: boardDisplayMode,
      moveHistory: gameState.moveHistory || [],
    });

    const blackP = gameState.players.find(p => p.color === 'BLACK');
    const whiteP = gameState.players.find(p => p.color === 'WHITE');
    const bNameEl = document.getElementById('tb-black-name');
    const wNameEl = document.getElementById('tb-white-name');
    if (bNameEl) bNameEl.textContent = blackP ? blackP.displayName : '—';
    if (wNameEl) wNameEl.textContent = whiteP ? whiteP.displayName : '—';
  }

  requestAnimationFrame(() => {
    if (boardRenderer) boardRenderer.resize();
  });
}

/** Update the board renderer state after a move. */
function updateBoardState() {
  if (!boardRenderer || !gameState) return;

  const myPlayer = gameState.players.find(p => p.userId === myUser.userId);
  const isMyTurn = gameState.currentTurn === myUser.userId;
  const lastMove = gameState.moveCount > 0
    ? gameState.board.reduce((acc, row, y) => {
        // Find last placed stone from moveHistory if available
        return acc;
      }, null)
    : null;

  // Get last move from the board history
  let lm = null;
  if (gameState.moveHistory && gameState.moveHistory.length > 0) {
    const last = gameState.moveHistory[gameState.moveHistory.length - 1];
    lm = { x: last.x, y: last.y };
  }

  boardRenderer.setState({
    board: gameState.board,
    lastMove: lm,
    isMyTurn: isMyTurn && gameState.status === 'ongoing',
    showZones: gameState.walls.length > 0 && gameState.moveCount === 0,
    interactive: !!myPlayer && gameState.status === 'ongoing',
    winLine: gameState.result ? gameState.result.winLine : null,
    displayMode: boardDisplayMode,
    moveHistory: gameState.moveHistory || [],
  });

  renderTimers();
  renderTurnLabel();
  renderGameControls();
}

/** Render timer values in the turn bar. */
function renderTimers() {
  const bTimerEl = document.getElementById('tb-black-timer');
  const wTimerEl = document.getElementById('tb-white-timer');
  if (!bTimerEl || !wTimerEl) return;

  bTimerEl.textContent = formatTime(timerValues.black);
  wTimerEl.textContent = formatTime(timerValues.white);

  bTimerEl.classList.toggle('turn-bar__timer--low', timerValues.black <= 10);
  wTimerEl.classList.toggle('turn-bar__timer--low', timerValues.white <= 10);

  // Highlight active player
  const tbBlack = document.getElementById('tb-black');
  const tbWhite = document.getElementById('tb-white');
  if (tbBlack && tbWhite && gameState) {
    const blackP = gameState.players.find(p => p.color === 'BLACK');
    const isBlackTurn = gameState.currentTurn === (blackP ? blackP.userId : null);
    tbBlack.classList.toggle('turn-bar__active', isBlackTurn && gameState.status === 'ongoing');
    tbWhite.classList.toggle('turn-bar__active', !isBlackTurn && gameState.status === 'ongoing');
  }
}

/** Render the turn indicator label. */
function renderTurnLabel() {
  const el = document.getElementById('turn-label');
  if (!el || !gameState) return;

  if (gameState.status !== 'ongoing') {
    el.textContent = t('game.finished');
    el.classList.remove('game-info__turn--mine');
    return;
  }

  const isMyTurn = gameState.currentTurn === myUser.userId;
  el.textContent = isMyTurn ? t('game.your_turn') : t('game.opponent_turn');
  el.classList.toggle('game-info__turn--mine', isMyTurn);
}

/** Render game control buttons (resign, draw). */
function renderGameControls() {
  const el = document.getElementById('game-controls');
  if (!el) return;

  const myPlayer = gameState ? gameState.players.find(p => p.userId === myUser.userId) : null;

  if (!gameState || gameState.status !== 'ongoing' || !myPlayer) {
    el.innerHTML = '';
    renderDrawPrompt();
    return;
  }

  const timeDisabled = timeRequestPending ? 'disabled' : '';
  el.innerHTML = `
    <button class="btn-game btn-game--resign" onclick="doResign()">${t('game.btn_resign')}</button>
    <button class="btn-game btn-game--draw" onclick="doDrawOffer()">${t('game.btn_draw')}</button>
    <button class="btn-game btn-game--time" onclick="doRequestTime()" ${timeDisabled}>
      ${t('game.btn_time')}
    </button>
  `;

  renderDrawPrompt();
  renderTimePrompt();
}

/** Render the Swap2 opening UI: board interactivity + phase-specific prompt. */
function renderSwap2() {
  if (!boardRenderer || !gameState || !gameState.swap2) return;

  const mine = (gameState.currentTurn === myUser.userId);
  const phase = gameState.swap2.openingPhase;
  const placing = (phase === 'place3' || phase === 'place2');

  // Determine the preview color for the next stone the current player will place.
  let previewColor = null;
  if (gameState._nextColor === 'BLACK') previewColor = 'BLACK';
  else if (gameState._nextColor === 'WHITE') previewColor = 'WHITE';

  boardRenderer.setState({
    board: gameState.board,
    interactive: mine && placing,
    isMyTurn: mine && placing,
    myColor: previewColor,
    lastMove: gameState._lastStone || null,
    showZones: false,
    winLine: null,
    displayMode: boardDisplayMode,
    moveHistory: gameState.moveHistory || [],
  });

  // Keep the turn bar hidden throughout the opening.
  const turnBar = document.getElementById('turn-bar');
  if (turnBar) turnBar.style.visibility = 'hidden';

  // Clear any leftover draw/time prompts during the opening.
  renderDrawPrompt();
  renderTimePrompt();

  const el = document.getElementById('game-controls');
  if (!el) return;

  const isSecond = gameState.swap2.secondPlayerId === myUser.userId;
  const isFirst = gameState.swap2.firstPlayerId === myUser.userId;

  let html = '';
  if (placing && mine) {
    html = `<div class="swap2-hint">Swap2 — Đặt quân mở màn</div>`;
  } else if (placing && !mine) {
    html = `<div class="swap2-hint">Đối thủ đang đặt quân mở màn...</div>`;
  } else if (phase === 'p2choice' && isSecond) {
    html = `
      <div class="swap2-choice">
        <button class="btn-game" onclick="swap2Choose('white')">Đi Trắng</button>
        <button class="btn-game" onclick="swap2Choose('black')">Đi Đen</button>
        <button class="btn-game" onclick="swap2Choose('place')">Đặt thêm 2 quân</button>
      </div>`;
  } else if (phase === 'p2choice' && !isSecond) {
    html = `<div class="swap2-hint">Đối thủ đang lựa chọn (Swap2)...</div>`;
  } else if (phase === 'p1choice' && isFirst) {
    html = `
      <div class="swap2-choice">
        <button class="btn-game" onclick="swap2Choose('black')">Chọn Đen</button>
        <button class="btn-game" onclick="swap2Choose('white')">Chọn Trắng</button>
      </div>`;
  } else if (phase === 'p1choice' && !isFirst) {
    html = `<div class="swap2-hint">Đối thủ đang lựa chọn màu...</div>`;
  }

  el.innerHTML = html;
}

/** Render draw offer prompt if applicable. */
function renderDrawPrompt() {
  const el = document.getElementById('draw-prompt-area');
  if (!el) return;

  if (!drawOfferPending || !gameState || gameState.status !== 'ongoing') {
    el.innerHTML = '';
    return;
  }

  // If I'm the one who offered, show waiting message
  if (drawOfferPending.from === myUser.userId) {
    el.innerHTML = `<div class="draw-prompt">Đang chờ đối thủ phản hồi đề nghị hoà...</div>`;
    return;
  }

  // Opponent offered — show accept/decline
  el.innerHTML = `
    <div class="draw-prompt">
      <span>${escapeHtml(drawOfferPending.fromName || 'Đối thủ')} đề nghị hoà</span>
      <div class="draw-prompt__actions">
        <button class="btn-draw-action btn-draw-accept" onclick="doDrawAccept()">Đồng ý</button>
        <button class="btn-draw-action btn-draw-decline" onclick="doDrawDecline()">Từ chối</button>
      </div>
    </div>
  `;
}

/** Render time request prompt if applicable. */
function renderTimePrompt() {
  const el = document.getElementById('time-prompt-area');
  if (!el) return;

  if (!timeRequestPending || !gameState || gameState.status !== 'ongoing') {
    el.innerHTML = '';
    return;
  }

  // If I'm the one who requested, show waiting message
  if (timeRequestPending.from === myUser.userId) {
    el.innerHTML = `<div class="draw-prompt">${t('game.time_waiting')}</div>`;
    return;
  }

  // Opponent requested — show accept/decline
  el.innerHTML = `
    <div class="draw-prompt">
      <span>${t('game.time_offer', { name: escapeHtml(timeRequestPending.fromName || ''), bonus: timeRequestPending.bonus || 10 })}</span>
      <div class="draw-prompt__actions">
        <button class="btn-draw-action btn-draw-accept" onclick="doTimeAccept()">${t('game.btn_accept')}</button>
        <button class="btn-draw-action btn-draw-decline" onclick="doTimeDecline()">${t('game.btn_decline')}</button>
      </div>
    </div>
  `;
}


function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}

// ---------------------------------------------------------------------------
// Game End Overlay
// ---------------------------------------------------------------------------

function showGameOverlay(result) {
  if (!result) return;

  // Only show the personal Win/Loss overlay to seated players.
  // Spectators (guests with no slot) only see the float messages.
  if (mySlot === null) return;

  const overlayIcon = document.getElementById('overlay-icon');
  let resultText, resultClass, reasonText, icon;

  if (result.winner === 'draw') {
    icon = '🤝';
    resultText = t('overlay.draw');
    resultClass = 'game-overlay__result--draw';
    reasonText = result.reason === 'agreement' ? t('overlay.reason_draw_agree') : t('overlay.reason_draw_full');
  } else if (result.winner === myUser.userId) {
    icon = '🎉';
    resultText = t('overlay.win');
    resultClass = 'game-overlay__result--win';
    reasonText = getReasonText(result.reason, true);
  } else {
    icon = '👊';
    resultText = t('overlay.lose');
    resultClass = 'game-overlay__result--lose';
    reasonText = getReasonText(result.reason, false);
  }

  if (overlayIcon) overlayIcon.textContent = icon;
  overlayResult.textContent = resultText;
  overlayResult.className = 'game-overlay__result ' + resultClass;
  overlayReason.textContent = reasonText;
  gameOverlay.classList.add('visible');

  // Ensure board shows empty state after game ends and state is reset
  setTimeout(() => {
    if (!gameState && roomData) {
      initBoard();
    }
  }, 500);
}

function getReasonText(reason, isWinner) {
  switch (reason) {
    case 'win':     return t('overlay.reason_win');
    case 'resign':  return isWinner ? t('overlay.reason_resign_w') : t('overlay.reason_resign_l');
    case 'timeout': return isWinner ? t('overlay.reason_timeout_w') : t('overlay.reason_timeout_l');
    default:        return '';
  }
}

// Overlay buttons
btnRematch.addEventListener('click', () => {
  gameOverlay.classList.remove('visible');
  client.emit('game:rematch');
});

btnCloseOverlay.addEventListener('click', () => {
  gameOverlay.classList.remove('visible');
});

// ---------------------------------------------------------------------------
// Game action handlers
// ---------------------------------------------------------------------------

window.doResign = function() {
  if (confirm(t('game.confirm_resign'))) {
    client.emit('game:resign');
  }
};

window.doDrawOffer = function() {
  client.emit('game:draw_offer');
};

window.doDrawAccept = function() {
  client.emit('game:draw_accept');
};

window.doDrawDecline = function() {
  client.emit('game:draw_decline');
};

window.doRequestTime = function() {
  if (timeRequestPending) return;
  client.emit('game:request_time');
};

window.doTimeAccept = function() {
  client.emit('game:time_accept');
};

window.doTimeDecline = function() {
  client.emit('game:time_decline');
};

window.swap2Choose = function(c) {
  client.emit('game:swap2_choice', { choice: c });
};
