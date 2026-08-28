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

  // ── Move sending: ack, timeout, one retry, then resync (TODO.md #152) ─────

  // How long to wait for the server's ack before assuming the packet was lost.
  // ~10x the ~0.5 s RTT measured for the affected players, so ordinary latency
  // never trips it. Worst case a player waits 2 x this (one retry) before the
  // resync path kicks in — changing it changes that number too.
  const MOVE_ACK_TIMEOUT_MS = 5000;

  /** Idempotency key for one move attempt; reused verbatim across the retry. */
  function newMoveId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function moveNotice(text) {
    if (global.ChatUI) global.ChatUI.appendSystemMessage(text);
  }

  /**
   * Fold one measured move round-trip into RoomState.halfRttMs (TODO.md #165).
   *
   * Half the RTT is our estimate of the one-way delay a `timer:sync` packet
   * spends in flight — the amount the displayed clock would otherwise run
   * behind the server. An exponential moving average (α=0.5) so a single
   * outlier can't wipe the clock; ignored entirely above ~30s (that isn't
   * latency, it's a stall) and the consumer clamps to 8s regardless.
   */
  function recordMoveRtt(rttMs) {
    if (!(rttMs >= 0) || rttMs > 30000) return;
    const st = S();
    const half = rttMs / 2;
    st.halfRttMs = st.halfRttMs ? Math.round(st.halfRttMs * 0.5 + half * 0.5) : Math.round(half);
  }

  /**
   * Send a move and see it through to a definite outcome.
   *
   * Before #152 this was a bare `emit('game:move', {x,y})`: if either that
   * packet or the `game:moved` broadcast answering it was dropped while the
   * socket stayed up, nothing on either side noticed. The stone never
   * appeared, no error, no spinner, and the only way out was F5.
   *
   *   ack {ok}     → done
   *   ack {error}  → show the reason, done. Never retried: the server saw the
   *                  move and refused it on purpose, so resending earns the
   *                  same refusal and makes the player wait for it.
   *   timeout #1   → resend, same moveId, so the server can recognise it as
   *                  the same action if the first one did land
   *   timeout #2   → stop, ask for a full resync, tell the player
   *
   * Optimistic render (TODO.md #153, upgraded to Full CSP by #155): a solid,
   * indistinguishable-from-real stone is drawn at (x,y) immediately, before
   * any of the above — the mover no longer waits out a round trip to see
   * their own move. It is a pure visual overlay (BoardRenderer.
   * optimisticStone), never written into gameState.board, so a rejected move
   * rolls back for free: clearing the overlay IS the rollback. #155 adds two
   * more predictions alongside it, same discipline: the move sound plays
   * immediately instead of waiting for game:moved, and `predictedTurn`
   * (RoomState, sibling of boardRenderer — never gameState itself) flips the
   * turn-bar/opponent timer to look switched right away. Clearing
   * `predictedTurn.active` is the entire rollback for that piece too,
   * because gameState.currentTurn/timerValues are never touched — the next
   * updateBoardState() call renders the real values automatically.
   *
   * Deliberately NOT cleared here on ack {ok}. The server sends the
   * `game:moved` broadcast before the ack (same connection, so it's ordered
   * ahead), and that broadcast is what writes the confirmed stone into
   * gameState.board — clearing the overlay only once that write has actually
   * happened (see room-socket.js's game:moved handler) avoids a one-frame
   * flash of an empty cell in the rare case where this move's own broadcast
   * was itself redirected into a resync by the receive-side gap check (an
   * earlier, unrelated broadcast this client had missed).
   */
  function sendMove(x, y) {
    const moveId = newMoveId();
    const st = S();
    const myPlayer = st.gameState && st.gameState.players.find(p => p.userId === st.myUser.userId);
    if (st.boardRenderer && myPlayer) {
      st.boardRenderer.setOptimisticStone({ x, y, color: myPlayer.color });
      // Immediate, not waiting on network (TODO.md #155) — this is always
      // our own move, never the opponent's, so `false` is not a placeholder.
      if (global.audioManager) global.audioManager.playMoveSound(false);
      // predictedTurn always travels with optimisticStone — never one
      // without the other, so the move-confirm watchdog and the rollback
      // paths below only ever need to flip a single pair together.
      st.predictedTurn.active = true;
      st.predictedTurn.forColor = myPlayer.color === 'BLACK' ? 'WHITE' : 'BLACK';
      // Freeze the deadline-derived value, not whatever the last 1s interval
      // happened to write — main-thread jank or a throttled background tab can
      // leave st.timerValues a second or two stale, and the snapshot would
      // then carry that staleness for the whole in-flight window (TODO.md
      // #165). refreshLocalTimer() is room-socket.js's own tickLocal.
      if (global.RoomSocket && global.RoomSocket.refreshLocalTimer) {
        global.RoomSocket.refreshLocalTimer();
      }
      st.predictedTurn.snapshotTimerValues = Object.assign({}, st.timerValues);
      st.predictedTurn.switchedAtLocalTs = Date.now();
      renderTimers();
      renderTurnLabel();
    }

    const attempt = (isRetry) => {
      const sentAt = Date.now();
      global.RoomClient.emitAck('game:move', { x, y, moveId }, MOVE_ACK_TIMEOUT_MS, (err, res) => {
        // Any real server reply — accept or reject — is a full round trip on
        // the live game path; feed it to the transit-delay estimate (TODO.md
        // #165). A timeout (`err`) is not a measurement: the clock we read is
        // MOVE_ACK_TIMEOUT_MS, not the network.
        if (!err) recordMoveRtt(Date.now() - sentAt);
        if (err) {
          // The game may have ended while this attempt was outstanding (the
          // move itself could have been the winning one, with only its ack
          // lost). Retrying then just earns a NO_ACTIVE_GAME error for a move
          // that in fact won.
          const gs = S().gameState;
          if (!gs || gs.status !== 'ongoing') return;

          if (!isRetry) {
            if (S().boardRenderer) S().boardRenderer.markOptimisticWarning();
            moveNotice(t('room.move_retrying'));
            attempt(true);
          } else {
            moveNotice(t('room.move_failed'));
            if (global.RoomSocket) global.RoomSocket.requestResync();
            // The pending stone stays up (still showing its 'warning' look)
            // until game:resync's answer lands as room:joined and clears it
            // along with rebuilding the whole board — see room-socket.js.
            // Clearing it here instead would guess at an outcome the server
            // hasn't actually confirmed yet.
          }
          return;
        }
        if (res && res.error) {
          if (S().boardRenderer) S().boardRenderer.setOptimisticStone(null);
          // gameState.currentTurn/timerValues were never touched, so clearing
          // the flag and re-rendering just the turn-bar/timer (the only two
          // things predictedTurn affects) is the whole rollback (TODO.md
          // #155) — same "clearing the overlay IS the rollback" property as
          // the stone.
          S().predictedTurn.active = false;
          renderTimers();
          renderTurnLabel();
          moveNotice(`⚠ ${global.RoomSocket ? global.RoomSocket.serverMessage(res) : res.error}`);
          return;
        }
        // Accepted. The server broadcasts `game:moved` before it acks, so that
        // broadcast should already be in hand — if it isn't, it was dropped on
        // its own and nothing else would ever notice: the retry path above only
        // runs on a *missing ack*, and the one we are holding arrived fine.
        // Left unguarded this is the second deadlock variant in
        // docs/todo/B154-*.md, with the pending stone stuck for good.
        if (global.RoomSocket && global.RoomSocket.armMoveConfirmWatchdog) {
          global.RoomSocket.armMoveConfirmWatchdog();
        }
      });
    };

    attempt(false);
  }

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
          <div id="undo-prompt-area"></div>
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
            // Local pre-check (TODO.md #155 Q1) — cheap, early-exit only,
            // strictly bounded to what the client already authoritatively
            // has (board/currentTurn/status). Not a new validation layer:
            // anything past this (walls, portals, swap2 phase rules) stays
            // server-only and still rejects via the ack rollback path.
            if (gs.board[y] && gs.board[y][x] !== 0) return;
            if (gs.currentTurn !== st.myUser.userId) return;
            // One in-flight move at a time (TODO.md #153): `isMyTurn` in
            // board.js doesn't flip false until gameState.currentTurn changes,
            // which only happens once this move is confirmed — so without this
            // guard a second click during the round trip would start a second
            // optimistic stone and clobber the first one (BoardRenderer only
            // tracks one).
            if (S().boardRenderer && S().boardRenderer.optimisticStone) return;
            sendMove(x, y);
          }
        },
      });

      // rAF-gated: mobile Safari fires several 'resize' events in quick
      // succession while its address bar shows/hides during scroll, and an
      // unthrottled resize() reading window dimensions mid-animation can bake
      // a transient viewport size into the canvas until the next event fires.
      window._boardResizePending = false;
      window._boardResizeHandler = () => {
        if (window._boardResizePending) return;
        window._boardResizePending = true;
        requestAnimationFrame(() => {
          window._boardResizePending = false;
          if (S().boardRenderer) S().boardRenderer.resize();
        });
      };
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

    // predictedTurn (TODO.md #155): while a move is in flight, render the
    // clocks as if the turn already switched — the mover's own clock frozen
    // at its click-time value (not the still-ticking real one; the server
    // hasn't flipped `currentTurn` yet), the opponent's counting down live
    // from that same snapshot. Never reads/writes gameState.timerValues
    // itself, so the instant this clears the very next tick shows the real,
    // server-confirmed numbers again — no separate "restore" needed.
    const pt = st.predictedTurn;
    let blackVal = st.timerValues.black;
    let whiteVal = st.timerValues.white;
    if (pt && pt.active && pt.snapshotTimerValues) {
      const elapsed = (Date.now() - pt.switchedAtLocalTs) / 1000;
      if (pt.forColor === 'BLACK') {
        blackVal = Math.max(0, pt.snapshotTimerValues.black - elapsed);
        whiteVal = pt.snapshotTimerValues.white;
      } else {
        whiteVal = Math.max(0, pt.snapshotTimerValues.white - elapsed);
        blackVal = pt.snapshotTimerValues.black;
      }
    }

    bTimerEl.textContent = formatTime(blackVal);
    wTimerEl.textContent = formatTime(whiteVal);
    bTimerEl.classList.toggle('turn-bar__timer--low', blackVal <= 10);
    wTimerEl.classList.toggle('turn-bar__timer--low', whiteVal <= 10);

    const tbBlack = document.getElementById('tb-black');
    const tbWhite = document.getElementById('tb-white');
    if (tbBlack && tbWhite && st.gameState) {
      // During Swap2's opening phases, colors aren't assigned yet
      // (`player.color` is null) — the black/white slots are placeholders
      // for firstPlayerId/secondPlayerId instead (instruction.md §B37).
      const swap2 = st.gameState.swap2;
      let isBlackTurn;
      if (pt && pt.active) {
        isBlackTurn = pt.forColor === 'BLACK';
      } else if (swap2 && swap2.enabled && !swap2.colorsAssigned) {
        isBlackTurn = st.gameState.currentTurn === swap2.firstPlayerId;
      } else {
        const blackP = st.gameState.players.find(p => p.color === 'BLACK');
        isBlackTurn = st.gameState.currentTurn === (blackP ? blackP.userId : null);
      }
      tbBlack.classList.toggle('turn-bar__active', isBlackTurn && st.gameState.status === 'ongoing');
      tbWhite.classList.toggle('turn-bar__active', !isBlackTurn && st.gameState.status === 'ongoing');
    }

    // The turn bar above is display:none at ≤768px; there the mobile players
    // strip carries the clocks instead. Repaint it from here rather than from
    // a second interval so both surfaces stay on the one tick path
    // room-socket.js already drives (tickLocal → GameUI.renderTimers).
    if (global.RoomUI && typeof global.RoomUI.updateStripTimers === 'function') {
      global.RoomUI.updateStripTimers();
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

    // predictedTurn is only ever set by our own sendMove(), so while it's
    // active it is by definition never our turn — this is the mover's own
    // screen the instant after they moved (TODO.md #155). Keeps this label
    // in sync with the turn-bar highlight in renderTimers() above instead of
    // contradicting it for one RTT.
    const pt = st.predictedTurn;
    const isMyTurn = (pt && pt.active) ? false : st.gameState.currentTurn === st.myUser.userId;
    el.textContent = isMyTurn ? t('game.your_turn') : t('game.opponent_turn');
    el.classList.toggle('game-info__turn--mine', isMyTurn);
  }

  // ── Game control buttons ──────────────────────────────────────────────────

  // #game-controls is empty (no buttons) whenever there's no ongoing game —
  // in zen, an empty #game-controls collapses to 0 height (see
  // .game-controls:empty in room-zen.css) so the board can grow into that
  // space pre-game instead of it sitting reserved-but-unused. That means the
  // board's real available height budget changes the moment this function's
  // innerHTML flips between empty and populated, so board.js resize() has
  // to be re-run right after — same pattern setTurnBarVisible() already
  // uses for the same reason (a toggling sibling that changes the layout
  // budget board.js measures).
  function renderGameControls() {
    const st = S();
    const el = document.getElementById('game-controls');
    if (!el) return;

    const myPlayer = st.gameState ? st.gameState.players.find(p => p.userId === st.myUser.userId) : null;

    if (!st.gameState || st.gameState.status !== 'ongoing' || !myPlayer) {
      el.innerHTML = '';
      renderDrawPrompt();
      requestAnimationFrame(() => { if (S().boardRenderer) S().boardRenderer.resize(); });
      return;
    }

    const timeDisabled = st.timeRequestPending ? 'disabled' : '';
    const undoDisabled = st.undoOfferPending ? 'disabled' : '';
    el.innerHTML = `
      <button class="btn-game btn-game--resign" data-action="doResign">${t('game.btn_resign')}</button>
      <button class="btn-game btn-game--draw"   data-action="doDrawOffer">${t('game.btn_draw')}</button>
      <button class="btn-game btn-game--time"   data-action="doRequestTime" ${timeDisabled}>
        ${t('game.btn_time')}
      </button>
      <button class="btn-game btn-game--undo"   data-action="doUndoRequest" ${undoDisabled}>
        ${t('game.btn_undo')}
      </button>
    `;

    renderDrawPrompt();
    renderTimePrompt();
    renderUndoPrompt();
    requestAnimationFrame(() => { if (S().boardRenderer) S().boardRenderer.resize(); });
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
    renderUndoPrompt();

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
          <button class="btn-game" data-action="swap2Choose" data-arg="white">${t('game.swap2_go_white')}</button>
          <button class="btn-game" data-action="swap2Choose" data-arg="black">${t('game.swap2_go_black')}</button>
          <button class="btn-game" data-action="swap2Choose" data-arg="place">${t('game.swap2_place_two_more')}</button>
        </div>`;
    } else if (phase === 'p2choice' && !isSecond) {
      html = `<div class="swap2-hint">${t('game.swap2_opponent_choosing')}</div>`;
    } else if (phase === 'p1choice' && isFirst) {
      html = `
        <div class="swap2-choice">
          <button class="btn-game" data-action="swap2Choose" data-arg="black">${t('game.swap2_choose_black')}</button>
          <button class="btn-game" data-action="swap2Choose" data-arg="white">${t('game.swap2_choose_white')}</button>
        </div>`;
    } else if (phase === 'p1choice' && !isFirst) {
      html = `<div class="swap2-hint">${t('game.swap2_opponent_choosing_color')}</div>`;
    }
    // Undo is available to either player throughout the opening, regardless
    // of whose turn it is to place/choose (TODO.md #128) — appended after
    // the phase-specific hint/buttons above, not a replacement for them.
    // Wrapped in its own full-width row: #game-controls is a non-wrapping
    // flex row on desktop, and .swap2-hint/.swap2-choice above already
    // claim width:100% of it, so the undo button needs its own row rather
    // than fighting them for space on the same one.
    const undoDisabled = st.undoOfferPending ? 'disabled' : '';
    html += `
      <div class="swap2-undo-row">
        <button class="btn-game btn-game--undo" data-action="doUndoRequest" ${undoDisabled}>
          ${t('game.btn_undo')}
        </button>
      </div>`;
    el.innerHTML = html;
    // Same empty/populated-height concern as renderGameControls() above —
    // swap2 also writes directly into #game-controls.
    requestAnimationFrame(() => { if (S().boardRenderer) S().boardRenderer.resize(); });
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
          <button class="btn-draw-action btn-draw-accept"  data-action="doDrawAccept">${t('game.btn_accept')}</button>
          <button class="btn-draw-action btn-draw-decline" data-action="doDrawDecline">${t('game.btn_decline')}</button>
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
          <button class="btn-draw-action btn-draw-accept"  data-action="doTimeAccept">${t('game.btn_accept')}</button>
          <button class="btn-draw-action btn-draw-decline" data-action="doTimeDecline">${t('game.btn_decline')}</button>
        </div>
      </div>
    `;
  }

  // ── Undo request prompt ───────────────────────────────────────────────────

  function renderUndoPrompt() {
    const st = S();
    const el = document.getElementById('undo-prompt-area');
    if (!el) return;

    if (!st.undoOfferPending || !st.gameState || st.gameState.status !== 'ongoing') {
      el.innerHTML = '';
      return;
    }

    if (st.undoOfferPending.from === st.myUser.userId) {
      el.innerHTML = `<div class="draw-prompt">${t('game.undo_waiting')}</div>`;
      return;
    }

    el.innerHTML = `
      <div class="draw-prompt">
        <span>${t('game.undo_offer', { name: _esc(st.undoOfferPending.fromName || t('game.opponent_generic')) })}</span>
        <div class="draw-prompt__actions">
          <button class="btn-draw-action btn-draw-accept"  data-action="doUndoAccept">${t('game.btn_accept')}</button>
          <button class="btn-draw-action btn-draw-decline" data-action="doUndoDecline">${t('game.btn_decline')}</button>
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
  global.doUndoRequest = () => { if (!S().undoOfferPending) global.RoomClient.emit('game:undo_request'); };
  global.doUndoAccept  = () => global.RoomClient.emit('game:undo_accept');
  global.doUndoDecline = () => global.RoomClient.emit('game:undo_decline');
  global.swap2Choose   = (c) => global.RoomClient.emit('game:swap2_choice', { choice: c });

  // ── Lang change listener ──────────────────────────────────────────────────
  // Swap2/draw/time/undo prompts are built as raw innerHTML strings (not
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
    // Exported for its regression test (TODO.md #152); the board's own click
    // handler calls the local binding directly.
    sendMove,
    setTurnBarVisible,
    updateBoardState,
    renderTimers,
    renderTurnLabel,
    renderGameControls,
    renderSwap2,
    renderDrawPrompt,
    renderTimePrompt,
    renderUndoPrompt,
  };

})(window);
