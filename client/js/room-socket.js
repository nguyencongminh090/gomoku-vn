'use strict';

/**
 * room-socket.js — All Socket.io event wiring for the room page.
 *
 * Reads/writes: window.RoomState
 * Calls:        RoomUI.*, GameUI.*, ChatUI.*
 *
 * This module owns every client.on(...) binding. It is responsible for keeping
 * RoomState synchronized with server events and then triggering UI re-renders.
 *
 * NO WebSocket event names or payload structures are changed here.
 */

(function(global) {
  'use strict';

  const S      = () => global.RoomState;
  const client = global.RoomClient;

  // ── Connection ────────────────────────────────────────────────────────────

  client.on('connect', () => {
    processRoomIntent();
  });
  // Also fire immediately in case connect already fired before this listener
  if (client.socket && client.socket.connected) {
    processRoomIntent();
  }

  // ── Room state events ─────────────────────────────────────────────────────

  client.on('room:joined', (data) => {
    const st = S();
    st.roomData = data;

    // Update URL so the room link is shareable
    const url = new URL(window.location);
    if (url.searchParams.get('id') !== data.roomId) {
      url.searchParams.set('id', data.roomId);
      window.history.replaceState({}, '', url);
    }

    // Restore game state on reconnect
    if (data.gameState) {
      st.gameState   = data.gameState;
      st.timerValues = data.timer || st.timerValues;
      if (st.gameState.swap2 && st.gameState.swap2.enabled && st.gameState.swap2.openingPhase !== 'play') {
        GameUI.initBoard();
        GameUI.renderSwap2();
      } else {
        GameUI.initBoard();
        GameUI.updateBoardState();
      }
    }
    RoomUI.updateUI();
  });

  client.on('room:updated', (data) => {
    const st = S();
    const prevSlot = st.mySlot;

    st.roomData = data;
    RoomUI.updateUI();

    // Detect an involuntary seat vacate — the ready-window timeout kicks a
    // seated-but-unconfirmed player out of their slot server-side. A manual
    // stand-up (✕ icon) sets standRequested first, so only the unexpected
    // case (server-initiated) surfaces this toast.
    if (prevSlot !== null && st.mySlot === null && !st.standRequested) {
      showToast(t('room.seat_timeout_kicked'), 'error');
    }
    st.standRequested = false;
  });

  client.on('room:left', () => {
    window.location.href = 'index.html';
  });

  client.on('room:kicked', (data) => {
    showToast(data.message || t('room.kicked'), 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
  });

  client.on('room:destroyed', (data) => {
    showToast(data.message, 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
  });

  client.on('room:error', (data) => {
    const st = S();
    if (!st.roomData) {
      showToast(data.message, 'error');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
      return;
    }
    ChatUI.appendSystemMessage(`⚠ ${data.message}`);
  });

  // ── Chat events ───────────────────────────────────────────────────────────

  client.on('chat:message', (msg) => {
    ChatUI.appendChatMessage(msg);
  });

  client.on('chat:error', (data) => {
    ChatUI.appendSystemMessage(`⚠ ${data.message}`);
  });

  // ── Game events ───────────────────────────────────────────────────────────

  client.on('game:error', (data) => {
    ChatUI.appendSystemMessage(`⚠ ${data.message}`);
  });

  client.on('game:init', (data) => {
    const st = S();
    st.gameState          = data;
    st.timerValues        = data.timer || { black: data.timerSeconds || 60, white: data.timerSeconds || 60 };
    st.drawOfferPending   = null;
    st.timeRequestPending = null;

    const gameOverlay = document.getElementById('game-overlay');
    if (gameOverlay) gameOverlay.classList.remove('visible');
    const btnFocus = document.getElementById('btn-focus');
    if (btnFocus) btnFocus.style.display = 'flex';

    if (st.gameState.swap2 && st.gameState.swap2.enabled && st.gameState.swap2.openingPhase !== 'play') {
      GameUI.initBoard();
      GameUI.renderSwap2();
    } else {
      GameUI.initBoard();
      GameUI.updateBoardState();
    }
    RoomUI.updateUI();
  });

  client.on('game:moved', (data) => {
    const st = S();
    if (!st.gameState) return;

    if (st.drawOfferPending) {
      st.drawOfferPending = null;
      GameUI.renderDrawPrompt();
    }

    const colorVal = data.color === 'BLACK' ? 1 : 2;
    st.gameState.board[data.y][data.x] = colorVal;
    st.gameState.currentTurn  = data.nextTurn;
    st.gameState.moveCount    = data.moveCount;
    if (!st.gameState.moveHistory) st.gameState.moveHistory = [];
    st.gameState.moveHistory.push({ x: data.x, y: data.y, color: data.color, timestamp: Date.now() });
    if (data.timer) st.timerValues = data.timer;
    if (data.gameOver) st.gameState.status = 'finished';
    if (data.result)   st.gameState.result = data.result;

    GameUI.updateBoardState();
    RoomUI.updateUI();
  });

  client.on('game:swap2_state', (data) => {
    const st = S();
    if (!st.gameState) return;

    st.gameState.board        = data.board;
    st.gameState.currentTurn  = data.currentTurn;
    st.gameState.moveCount    = data.moveCount;
    if (data.moveHistory) st.gameState.moveHistory = data.moveHistory;
    st.gameState.swap2        = data.swap2;
    st.gameState.players      = data.players;
    st.gameState._nextColor   = data.nextColor;
    if (data.lastStone) st.gameState._lastStone = data.lastStone;

    if (st.gameState.swap2.openingPhase !== 'play') {
      GameUI.renderSwap2();
    } else {
      // Opening resolved — switch to normal play
      GameUI.updateBoardState();
      GameUI.renderGameControls();

      GameUI.setTurnBarVisible(true);

      const blackP  = st.gameState.players.find(p => p.color === 'BLACK');
      const whiteP  = st.gameState.players.find(p => p.color === 'WHITE');
      const bNameEl = document.getElementById('tb-black-name');
      const wNameEl = document.getElementById('tb-white-name');
      if (bNameEl) bNameEl.textContent = blackP ? blackP.displayName : '—';
      if (wNameEl) wNameEl.textContent = whiteP ? whiteP.displayName : '—';
    }
  });

  client.on('timer:tick', (data) => {
    S().timerValues = data;
    GameUI.renderTimers();
  });

  client.on('game:ended', (data) => {
    const st = S();
    if (data.scoreTable && st.roomData) st.roomData.scoreTable = data.scoreTable;
    if (st.gameState) {
      st.gameState.status = 'finished';
      if (data.result) st.gameState.result = data.result;
    }
    st.drawOfferPending = null;
    GameUI.renderDrawPrompt();

    const btnFocus = document.getElementById('btn-focus');
    if (btnFocus) btnFocus.style.display = 'none';

    // Exit focus mode on game end
    if (st.focusMode) {
      st.focusMode = false;
      document.body.classList.remove('room--focus');
      const tabChat = document.getElementById('tab-chat');
      const chatInputWrapper = document.getElementById('chat-input-wrapper');
      if (tabChat && chatInputWrapper) tabChat.querySelector('.chat-panel').appendChild(chatInputWrapper);
    }

    RoomUI.showGameOverlay(data.result);
    RoomUI.updateUI();
  });

  client.on('game:time_offered', (data) => {
    S().timeRequestPending = data;
    GameUI.renderTimePrompt();
  });

  client.on('game:time_granted', () => {
    S().timeRequestPending = null;
    GameUI.renderTimePrompt();
    GameUI.updateBoardState();
  });

  client.on('game:time_declined', () => {
    S().timeRequestPending = null;
    GameUI.renderTimePrompt();
    GameUI.updateBoardState();
  });

  client.on('game:draw_offered', (data) => {
    S().drawOfferPending = data;
    GameUI.renderDrawPrompt();
  });

  client.on('game:draw_declined', () => {
    S().drawOfferPending = null;
    GameUI.renderDrawPrompt();
  });

  client.on('game:interrupted', (data) => {
    ChatUI.appendSystemMessage(t('room.disconnected', { name: data.playerName, seconds: data.secondsLeft }));
    if (S().gameState) S().gameState.status = 'interrupted';
    GameUI.updateBoardState();
  });

  client.on('game:resumed', () => {
    ChatUI.appendSystemMessage(t('room.reconnected'));
    if (S().gameState) S().gameState.status = 'ongoing';
    GameUI.updateBoardState();
  });

  // ── Room entry intent processing ──────────────────────────────────────────

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
      const params = new URLSearchParams(window.location.search);
      const roomId = params.get('id');
      if (roomId) client.emit('room:join', { roomId });
    }
  }

})(window);
