'use strict';

/**
 * game-ui.js — Game board and in-game UI rendering.
 *
 * Reads from: window.RoomState
 * Writes to:  DOM (board area, turn bar, game controls, draw/time prompts)
 *
 * Exports (on window):
 *   GameUI.initBoard()
 *   GameUI.updateBoardState()
 *   GameUI.renderTimers()
 *   GameUI.renderTurnLabel()
 *   GameUI.renderGameControls()
 *   GameUI.renderSwap2()
 *   GameUI.renderDrawPrompt()
 *   GameUI.renderTimePrompt()
 *   window.doResign()
 *   window.doDrawOffer() / doDrawAccept() / doDrawDecline()
 *   window.doRequestTime() / doTimeAccept() / doTimeDecline()
 *   window.swap2Choose(choice)
 */

(function(global) {
  'use strict';

  const S = () => global.RoomState;

  // ── DOM refs (stable refs set on first initBoard call) ────────────────────
  const boardArea = document.getElementById('board-area');
  const btnFocus  = document.getElementById('btn-focus');

  // ── Time formatting ───────────────────────────────────────────────────────

  function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
  }

  // ── Turn bar visibility ───────────────────────────────────────────────────

  // The turn bar is display:none before a game starts so it reserves no layout
  // height (it used to be visibility:hidden, leaving an empty strip above the
  // board — costly on phones). board.js resize() reads its offsetHeight, so the
  // board is re-measured whenever this toggles.
  function setTurnBarVisible(visible) {
    const tb = document.getElementById('turn-bar');
    if (!tb) return;
    tb.classList.toggle('turn-bar--hidden', !visible);
    requestAnimationFrame(() => {
      if (S().boardRenderer) S().boardRenderer.resize();
    });
  }

  // ── Board initialization ──────────────────────────────────────────────────

  function initBoard() {
    const st = S();
    if (!st.roomData) return;
    const boardSize = st.gameState ? st.gameState.boardSize : st.roomData.settings.boardSize;

    if (!st.boardRenderer) {
      boardArea.innerHTML = `
        <div class="board-area-inner">
          <div class="turn-bar turn-bar--hidden" id="turn-bar">
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
      st.boardRenderer = new BoardRenderer(canvas, {
        boardSize: boardSize,
        clickMode: st.clickMode,
        onCellClick: (x, y) => {
          const gs = S().gameState;
          // Swap2 opening: route placements to opening handler
          if (gs && gs.swap2 && gs.swap2.enabled && gs.swap2.openingPhase !== 'play') {
            if (gs.currentTurn === st.myUser.userId
                && (gs.swap2.openingPhase === 'place3' || gs.swap2.openingPhase === 'place2')) {
              global.RoomClient.emit('game:swap2_place', { x, y });
            }
            return;
          }
          if (gs && gs.status === 'ongoing') {
            global.RoomClient.emit('game:move', { x, y });
          }
        },
      });

      window._boardResizeHandler = () => { if (S().boardRenderer) S().boardRenderer.resize(); };
      window.addEventListener('resize', window._boardResizeHandler);
    }

    if (!st.gameState) {
      st.boardRenderer.setState({
        boardSize, board: Array(boardSize).fill().map(() => Array(boardSize).fill(0)),
        walls: [], portals: [], firstMoveZones: [],
        showZones: false, interactive: false, lastMove: null, myColor: null,
        displayMode: st.boardDisplayMode, moveHistory: [],
      });
      setTurnBarVisible(false);
      const gc = document.getElementById('game-controls');
      if (gc) gc.innerHTML = '';
    } else {
      const myPlayer = st.gameState.players.find(p => p.userId === st.myUser.userId);
      const myColorStr = myPlayer ? myPlayer.color : null;

      st.boardRenderer.setState({
        boardSize: st.gameState.boardSize,
        board:     st.gameState.board,
        walls:     st.gameState.walls,
        portals:   st.gameState.portals,
        firstMoveZones: st.gameState.firstMoveZones,
        showZones: st.gameState.walls.length > 0 && st.gameState.moveCount === 0,
        myColor:     myColorStr,
        interactive: !!myColorStr && st.gameState.status === 'ongoing',
        displayMode: st.boardDisplayMode,
        moveHistory: st.gameState.moveHistory || [],
      });

      const blackP  = st.gameState.players.find(p => p.color === 'BLACK');
      const whiteP  = st.gameState.players.find(p => p.color === 'WHITE');
      const bNameEl = document.getElementById('tb-black-name');
      const wNameEl = document.getElementById('tb-white-name');
      if (bNameEl) bNameEl.textContent = blackP ? blackP.displayName : '—';
      if (wNameEl) wNameEl.textContent = whiteP ? whiteP.displayName : '—';

      setTurnBarVisible(true);
    }

    requestAnimationFrame(() => {
      if (S().boardRenderer) S().boardRenderer.resize();
    });
  }

  // ── Board state update after move ─────────────────────────────────────────

  function updateBoardState() {
    const st = S();
    if (!st.boardRenderer || !st.gameState) return;

    const myPlayer = st.gameState.players.find(p => p.userId === st.myUser.userId);

    let lm = null;
    if (st.gameState.moveHistory && st.gameState.moveHistory.length > 0) {
      const last = st.gameState.moveHistory[st.gameState.moveHistory.length - 1];
      lm = { x: last.x, y: last.y };
    }

    st.boardRenderer.setState({
      board:       st.gameState.board,
      lastMove:    lm,
      isMyTurn:    st.gameState.currentTurn === st.myUser.userId && st.gameState.status === 'ongoing',
      showZones:   st.gameState.walls.length > 0 && st.gameState.moveCount === 0,
      interactive: !!myPlayer && st.gameState.status === 'ongoing',
      winLine:     st.gameState.result ? st.gameState.result.winLine : null,
      displayMode: st.boardDisplayMode,
      moveHistory: st.gameState.moveHistory || [],
    });

    renderTimers();
    renderTurnLabel();
    renderGameControls();
  }

  // ── Timer rendering ───────────────────────────────────────────────────────

  function renderTimers() {
    const st = S();
    const bTimerEl = document.getElementById('tb-black-timer');
    const wTimerEl = document.getElementById('tb-white-timer');
    if (!bTimerEl || !wTimerEl) return;

    bTimerEl.textContent = formatTime(st.timerValues.black);
    wTimerEl.textContent = formatTime(st.timerValues.white);
    bTimerEl.classList.toggle('turn-bar__timer--low', st.timerValues.black <= 10);
    wTimerEl.classList.toggle('turn-bar__timer--low', st.timerValues.white <= 10);

    const tbBlack = document.getElementById('tb-black');
    const tbWhite = document.getElementById('tb-white');
    if (tbBlack && tbWhite && st.gameState) {
      // During Swap2's opening phases, colors aren't assigned yet
      // (`player.color` is null) — the black/white slots are placeholders
      // for firstPlayerId/secondPlayerId instead (instruction.md §B37).
      const swap2 = st.gameState.swap2;
      let isBlackTurn;
      if (swap2 && swap2.enabled && !swap2.colorsAssigned) {
        isBlackTurn = st.gameState.currentTurn === swap2.firstPlayerId;
      } else {
        const blackP = st.gameState.players.find(p => p.color === 'BLACK');
        isBlackTurn = st.gameState.currentTurn === (blackP ? blackP.userId : null);
      }
      tbBlack.classList.toggle('turn-bar__active', isBlackTurn && st.gameState.status === 'ongoing');
      tbWhite.classList.toggle('turn-bar__active', !isBlackTurn && st.gameState.status === 'ongoing');
    }
  }

  // ── Turn label ────────────────────────────────────────────────────────────

  function renderTurnLabel() {
    const st = S();
    const el = document.getElementById('turn-label');
    if (!el || !st.gameState) return;

    if (st.gameState.status !== 'ongoing') {
      el.textContent = t('game.finished');
      el.classList.remove('game-info__turn--mine');
      return;
    }

    const isMyTurn = st.gameState.currentTurn === st.myUser.userId;
    el.textContent = isMyTurn ? t('game.your_turn') : t('game.opponent_turn');
    el.classList.toggle('game-info__turn--mine', isMyTurn);
  }

  // ── Game control buttons ──────────────────────────────────────────────────

  function renderGameControls() {
    const st = S();
    const el = document.getElementById('game-controls');
    if (!el) return;

    const myPlayer = st.gameState ? st.gameState.players.find(p => p.userId === st.myUser.userId) : null;

    if (!st.gameState || st.gameState.status !== 'ongoing' || !myPlayer) {
      el.innerHTML = '';
      renderDrawPrompt();
      return;
    }

    const timeDisabled = st.timeRequestPending ? 'disabled' : '';
    el.innerHTML = `
      <button class="btn-game btn-game--resign" onclick="doResign()">${t('game.btn_resign')}</button>
      <button class="btn-game btn-game--draw"   onclick="doDrawOffer()">${t('game.btn_draw')}</button>
      <button class="btn-game btn-game--time"   onclick="doRequestTime()" ${timeDisabled}>
        ${t('game.btn_time')}
      </button>
    `;

    renderDrawPrompt();
    renderTimePrompt();
  }

  // ── Swap2 opening UI ──────────────────────────────────────────────────────

  function renderSwap2() {
    const st = S();
    if (!st.boardRenderer || !st.gameState || !st.gameState.swap2) return;

    const mine   = (st.gameState.currentTurn === st.myUser.userId);
    const phase  = st.gameState.swap2.openingPhase;
    const placing = (phase === 'place3' || phase === 'place2');

    let previewColor = null;
    if (st.gameState._nextColor === 'BLACK') previewColor = 'BLACK';
    else if (st.gameState._nextColor === 'WHITE') previewColor = 'WHITE';

    st.boardRenderer.setState({
      board:       st.gameState.board,
      interactive: mine && placing,
      isMyTurn:    mine && placing,
      myColor:     previewColor,
      lastMove:    st.gameState._lastStone || null,
      showZones:   false,
      winLine:     null,
      displayMode: st.boardDisplayMode,
      moveHistory: st.gameState.moveHistory || [],
    });

    // Timer runs throughout the opening (instruction.md §B37) — keep the
    // turn bar visible instead of hiding it, and label the two slots by
    // firstPlayerId/secondPlayerId since `player.color` is still null.
    setTurnBarVisible(true);
    const bNameEl = document.getElementById('tb-black-name');
    const wNameEl = document.getElementById('tb-white-name');
    const firstP  = st.gameState.players.find(p => p.userId === st.gameState.swap2.firstPlayerId);
    const secondP = st.gameState.players.find(p => p.userId === st.gameState.swap2.secondPlayerId);
    if (bNameEl) bNameEl.textContent = firstP ? firstP.displayName : '—';
    if (wNameEl) wNameEl.textContent = secondP ? secondP.displayName : '—';
    renderTimers();

    renderDrawPrompt();
    renderTimePrompt();

    const el = document.getElementById('game-controls');
    if (!el) return;

    const isSecond = st.gameState.swap2.secondPlayerId === st.myUser.userId;
    const isFirst  = st.gameState.swap2.firstPlayerId  === st.myUser.userId;

    let html = '';
    if (placing && mine) {
      html = `<div class="swap2-hint">${t('game.swap2_place_title')}</div>`;
    } else if (placing && !mine) {
      html = `<div class="swap2-hint">${t('game.swap2_opponent_placing')}</div>`;
    } else if (phase === 'p2choice' && isSecond) {
      html = `
        <div class="swap2-choice">
          <button class="btn-game" onclick="swap2Choose('white')">${t('game.swap2_go_white')}</button>
          <button class="btn-game" onclick="swap2Choose('black')">${t('game.swap2_go_black')}</button>
          <button class="btn-game" onclick="swap2Choose('place')">${t('game.swap2_place_two_more')}</button>
        </div>`;
    } else if (phase === 'p2choice' && !isSecond) {
      html = `<div class="swap2-hint">${t('game.swap2_opponent_choosing')}</div>`;
    } else if (phase === 'p1choice' && isFirst) {
      html = `
        <div class="swap2-choice">
          <button class="btn-game" onclick="swap2Choose('black')">${t('game.swap2_choose_black')}</button>
          <button class="btn-game" onclick="swap2Choose('white')">${t('game.swap2_choose_white')}</button>
        </div>`;
    } else if (phase === 'p1choice' && !isFirst) {
      html = `<div class="swap2-hint">${t('game.swap2_opponent_choosing_color')}</div>`;
    }
    el.innerHTML = html;
  }

  // ── Draw offer prompt ─────────────────────────────────────────────────────

  function renderDrawPrompt() {
    const st = S();
    const el = document.getElementById('draw-prompt-area');
    if (!el) return;

    if (!st.drawOfferPending || !st.gameState || st.gameState.status !== 'ongoing') {
      el.innerHTML = '';
      return;
    }

    if (st.drawOfferPending.from === st.myUser.userId) {
      el.innerHTML = `<div class="draw-prompt">${t('game.draw_waiting')}</div>`;
      return;
    }

    el.innerHTML = `
      <div class="draw-prompt">
        <span>${t('game.draw_offer', { name: _esc(st.drawOfferPending.fromName || t('game.opponent_generic')) })}</span>
        <div class="draw-prompt__actions">
          <button class="btn-draw-action btn-draw-accept"  onclick="doDrawAccept()">${t('game.btn_accept')}</button>
          <button class="btn-draw-action btn-draw-decline" onclick="doDrawDecline()">${t('game.btn_decline')}</button>
        </div>
      </div>
    `;
  }

  // ── Time request prompt ───────────────────────────────────────────────────

  function renderTimePrompt() {
    const st = S();
    const el = document.getElementById('time-prompt-area');
    if (!el) return;

    if (!st.timeRequestPending || !st.gameState || st.gameState.status !== 'ongoing') {
      el.innerHTML = '';
      return;
    }

    if (st.timeRequestPending.from === st.myUser.userId) {
      el.innerHTML = `<div class="draw-prompt">${t('game.time_waiting')}</div>`;
      return;
    }

    el.innerHTML = `
      <div class="draw-prompt">
        <span>${t('game.time_offer', { name: _esc(st.timeRequestPending.fromName || ''), bonus: st.timeRequestPending.bonus || 10 })}</span>
        <div class="draw-prompt__actions">
          <button class="btn-draw-action btn-draw-accept"  onclick="doTimeAccept()">${t('game.btn_accept')}</button>
          <button class="btn-draw-action btn-draw-decline" onclick="doTimeDecline()">${t('game.btn_decline')}</button>
        </div>
      </div>
    `;
  }

  // ── Escape helper ─────────────────────────────────────────────────────────
  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Game action handlers (global onclick shims) ───────────────────────────

  global.doResign = function() {
    if (confirm(t('game.confirm_resign'))) global.RoomClient.emit('game:resign');
  };
  global.doDrawOffer   = () => global.RoomClient.emit('game:draw_offer');
  global.doDrawAccept  = () => global.RoomClient.emit('game:draw_accept');
  global.doDrawDecline = () => global.RoomClient.emit('game:draw_decline');
  global.doRequestTime = () => { if (!S().timeRequestPending) global.RoomClient.emit('game:request_time'); };
  global.doTimeAccept  = () => global.RoomClient.emit('game:time_accept');
  global.doTimeDecline = () => global.RoomClient.emit('game:time_decline');
  global.swap2Choose   = (c) => global.RoomClient.emit('game:swap2_choice', { choice: c });

  // ── Lang change listener ──────────────────────────────────────────────────
  // Swap2/draw/time prompts are built as raw innerHTML strings (not
  // data-i18n), so applyI18n() alone can't re-translate them — re-run their
  // render functions on language switch instead.
  window.addEventListener('langchange', () => {
    const st = S();
    if (!st.gameState) return;
    renderSwap2();
    renderGameControls();
  });

  // ── Public API ────────────────────────────────────────────────────────────
  global.GameUI = {
    initBoard,
    setTurnBarVisible,
    updateBoardState,
    renderTimers,
    renderTurnLabel,
    renderGameControls,
    renderSwap2,
    renderDrawPrompt,
    renderTimePrompt,
  };

})(window);
