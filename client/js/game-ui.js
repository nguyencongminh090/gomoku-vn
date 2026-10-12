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
   *
   * The average itself lives in `timer-sync-core.js` (TODO.md #168) so the
   * diagnostic page reports the same estimate the room acts on; `null` back
   * means the sample was rejected, and RoomState is then left untouched.
   */
  function recordMoveRtt(rttMs) {
    const st = S();
    const next = global.TimerSyncCore.halfRttEma(st.halfRttMs, rttMs);
    if (next === null) return;
    st.halfRttMs = next;
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
      // TEMP (TODO.md #167): ride the client's rolling half-RTT estimate along
      // for CROSS-CHECK only — the server logs it beside its own (sparse)
      // engine.io ping/pong reading and never feeds it into any timeout math.
      // Omitted until the first ack has produced an estimate.
      const crtt = S().halfRttMs > 0 ? Math.round(S().halfRttMs) : undefined;
      global.RoomClient.emitAck('game:move', { x, y, moveId, crtt }, MOVE_ACK_TIMEOUT_MS, (err, res) => {
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

  // ── Turn bar (retired, #216) ───────────────────────────────────────────────
  // Names and clocks now live on the player cards (RoomUI.renderPlayerCards);
  // kept as an export because room-socket.js calls it — re-fits the board.
  function setTurnBarVisible() {
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
      // Just the board: players, clocks, actions and requests live in the rail (#216).
      boardArea.innerHTML = `
        <div class="board-canvas-wrap" id="board-wrap">
          <canvas id="game-canvas"></canvas>
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
      const gc = document.getElementById('game-controls');
      if (gc) gc.innerHTML = '';
      renderMoves();
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

      if (global.RoomUI && global.RoomUI.renderPlayerCards) global.RoomUI.renderPlayerCards();
      renderMoves();
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
    renderMoves();
  }

  // ── Moves tab (#216) ──────────────────────────────────────────────────────
  // Pairs per line (black · white) in edge coordinates (A1 bottom-left), newest highlighted.
  function moveLabel(mv, n) {
    return String.fromCharCode(65 + mv.x) + (n - mv.y);
  }
  function renderMoves() {
    const el = document.getElementById('moves-list');
    if (!el) return;
    const st = S();
    const gs = st.gameState;
    const hist = (gs && gs.moveHistory) || [];
    if (!hist.length) {
      el.innerHTML = `<li class="moves__empty">${t('room.moves_empty')}</li>`;
      return;
    }
    const n = gs.boardSize;
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const a = hist[i], b = hist[i + 1];
      const last = (j) => (j === hist.length - 1 ? ' class="moves__cur"' : '');
      html += `<li><span class="moves__n">${i / 2 + 1}</span><span${last(i)}>${moveLabel(a, n)}</span><span${b ? last(i + 1) : ''}>${b ? moveLabel(b, n) : ''}</span></li>`;
    }
    el.innerHTML = html;
    const pane = document.getElementById('tab-moves');
    if (pane) pane.scrollTop = pane.scrollHeight;
  }

  // ── Timer rendering ───────────────────────────────────────────────────────

  /**
   * The black/white clock values the UI should paint right now, as a
   * `{ black, white }` pair (TODO.md #155, #165).
   *
   * `st.timerValues` already carries the #165 transit-delay compensation —
   * room-socket.js's tickLocal/applyTimerSync shave it before writing there,
   * so anything reading this helper inherits it for free.
   *
   * On top of that, while our own move is in flight `predictedTurn` overlays
   * the pair: the mover's own clock frozen at its click-time value (the
   * server hasn't flipped `currentTurn` yet, so the real one is still
   * ticking for them), the opponent's counting down live from that same
   * snapshot. Never reads/writes gameState.timerValues itself, so the instant
   * predictedTurn clears the next paint shows the real server numbers again —
   * no separate "restore" needed.
   *
   * Shared verbatim by the desktop turn bar (renderTimers) and the mobile
   * players-strip (RoomUI.updateStripTimers) so the two surfaces of the same
   * feature can never show different numbers (instruction.md #166).
   */
  function effectiveTimerValues() {
    const st = S();
    const pt = st.predictedTurn;
    let black = st.timerValues.black;
    let white = st.timerValues.white;
    if (pt && pt.active && pt.snapshotTimerValues) {
      const elapsed = (Date.now() - pt.switchedAtLocalTs) / 1000;
      if (pt.forColor === 'BLACK') {
        black = Math.max(0, pt.snapshotTimerValues.black - elapsed);
        white = pt.snapshotTimerValues.white;
      } else {
        white = Math.max(0, pt.snapshotTimerValues.white - elapsed);
        black = pt.snapshotTimerValues.black;
      }
    }
    return { black, white };
  }

  /**
   * Which colour the clock/turn UI should treat as "to move" right now —
   * `'BLACK' | 'WHITE' | null` (null = no ongoing game / not resolvable).
   *
   * `predictedTurn` overrides while our move is in flight (TODO.md #155);
   * otherwise it's the authoritative `currentTurn`, with the Swap2-opening
   * placeholder rule (instruction.md §B37) applied the same way renderTimers
   * has always applied it. Shared with the mobile players-strip (#166).
   */
  function effectiveTurnColor() {
    const st = S();
    if (!st.gameState || st.gameState.status !== 'ongoing') return null;

    const pt = st.predictedTurn;
    if (pt && pt.active) return pt.forColor;

    const swap2 = st.gameState.swap2;
    if (swap2 && swap2.enabled && !swap2.colorsAssigned) {
      return st.gameState.currentTurn === swap2.firstPlayerId ? 'BLACK' : 'WHITE';
    }
    const blackP = st.gameState.players.find(p => p.color === 'BLACK');
    return st.gameState.currentTurn === (blackP ? blackP.userId : null) ? 'BLACK' : 'WHITE';
  }

  // Clocks are painted on the player cards (#216). The tick path is unchanged:
  // room-socket.js tickLocal → GameUI.renderTimers → RoomUI.updateCardClocks.
  function renderTimers() {
    if (global.RoomUI && typeof global.RoomUI.updateCardClocks === 'function') {
      global.RoomUI.updateCardClocks();
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

  // ── Action tiles (#216) ───────────────────────────────────────────────────
  // Equal tiles, one short label each: Lùi · Xin time (friendly games only —
  // the server refuses them when rated, FRIENDLY_ONLY) · Cầu hoà · Đầu hàng.
  // Draw and resign take two taps: the first arms the tile and shows a 3 s
  // countdown toast; a second tap inside it sends. #game-controls is empty
  // outside your own ongoing game (hidden by CSS), and the board is re-fit
  // whenever that flips because the rail/column height changes.
  const CONFIRM_MS = 3000;
  let armed = null;          // { action: 'resign'|'draw', until }
  let armedTimer = null;

  function tile(action, icon, labelKey, attrs = '') {
    const isArmed = armed && armed.action === action;
    return `<button class="act${isArmed ? ' act--confirm' : ''}" type="button" data-action="${action}" ${attrs}>
      <svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=350#ph-regular-${icon}"></use></svg>
      <span>${isArmed ? t('room.btn_confirm') : t(labelKey)}</span>
    </button>`;
  }

  function renderGameControls() {
    const st = S();
    const el = document.getElementById('game-controls');
    if (!el) return;

    const myPlayer = st.gameState ? st.gameState.players.find(p => p.userId === st.myUser.userId) : null;

    if (!st.gameState || st.gameState.status !== 'ongoing' || !myPlayer) {
      disarm(false);
      el.innerHTML = '';
      renderDrawPrompt();
      requestAnimationFrame(() => { if (S().boardRenderer) S().boardRenderer.resize(); });
      return;
    }

    const friendly = st.gameState.rated !== true;
    const timeTitle = escAttr(t('game.btn_time'));
    const undoTitle = escAttr(t('game.btn_undo'));
    el.innerHTML =
      (friendly ? tile('doUndoRequest', 'arrow-counter-clockwise', 'room.act_undo',
        `title="${undoTitle}" ${st.undoOfferPending ? 'disabled' : ''}`) : '') +
      (friendly ? tile('doRequestTime', 'hourglass', 'room.act_time',
        `title="${timeTitle}" ${st.timeRequestPending ? 'disabled' : ''}`) : '') +
      tile('doDrawOffer', 'handshake', 'room.act_draw', st.drawOfferPending ? 'disabled' : '') +
      tile('doResign', 'flag', 'room.act_resign');

    renderDrawPrompt();
    renderTimePrompt();
    renderUndoPrompt();
    renderConfirmPrompt();
    requestAnimationFrame(() => { if (S().boardRenderer) S().boardRenderer.resize(); });
  }

  function escAttr(str) { return _esc(str).replace(/"/g, '&quot;'); }

  function disarm(rerender = true) {
    armed = null;
    if (armedTimer) { clearInterval(armedTimer); armedTimer = null; }
    if (rerender) renderGameControls();
    else renderConfirmPrompt();
  }

  // First tap arms, second tap inside CONFIRM_MS returns true (send).
  function confirmTap(action) {
    if (armed && armed.action === action && Date.now() < armed.until) {
      disarm();
      return true;
    }
    if (armedTimer) clearInterval(armedTimer);
    armed = { action, until: Date.now() + CONFIRM_MS };
    armedTimer = setInterval(() => {
      if (!armed || Date.now() >= armed.until) disarm();
      else renderConfirmPrompt();
    }, 250);
    renderGameControls();
    return false;
  }

  function renderConfirmPrompt() {
    const el = document.getElementById('confirm-prompt-area');
    if (!el) return;
    if (!armed) { el.innerHTML = ''; return; }
    const left = Math.max(0, armed.until - Date.now());
    const key = armed.action === 'doResign' ? 'room.confirm_resign' : 'room.confirm_draw';
    const icon = armed.action === 'doResign' ? 'flag' : 'handshake';
    el.innerHTML = gtoast(icon, t(key), {
      danger: armed.action === 'doResign',
      count: `${Math.ceil(left / 1000)}s`,
      pct: (left / CONFIRM_MS) * 100,
    });
  }

  // One toast row: icon, one line of text, optional countdown, optional buttons.
  function gtoast(icon, text, { danger = false, count = '', pct = null, actions = '' } = {}) {
    return `<div class="gtoast${danger ? ' gtoast--danger' : ''}" role="alert">
      <svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=350#ph-regular-${icon}"></use></svg>
      <span class="gtoast__t">${text}</span>
      ${count ? `<b class="gtoast__n">${count}</b>` : ''}
      ${actions}
      ${pct !== null ? `<i class="gtoast__bar" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i>` : ''}
    </div>`;
  }

  function answerButtons(acceptAction, declineAction) {
    return `<button class="gtoast__btn gtoast__btn--ok" type="button" data-action="${acceptAction}" title="${escAttr(t('game.btn_accept'))}" aria-label="${escAttr(t('game.btn_accept'))}"><svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=350#ph-regular-check"></use></svg></button>
      <button class="gtoast__btn" type="button" data-action="${declineAction}" title="${escAttr(t('game.btn_decline'))}" aria-label="${escAttr(t('game.btn_decline'))}"><svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=350#ph-regular-x"></use></svg></button>`;
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
    if (global.RoomUI && global.RoomUI.renderPlayerCards) global.RoomUI.renderPlayerCards();
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
    if (st.gameState.rated !== true) {
      html += `<div class="swap2-undo-row">${tile('doUndoRequest', 'arrow-counter-clockwise', 'room.act_undo',
        `title="${escAttr(t('game.btn_undo'))}" ${st.undoOfferPending ? 'disabled' : ''}`)}</div>`;
    }
    el.innerHTML = html;
    // Same empty/populated-height concern as renderGameControls() above —
    // swap2 also writes directly into #game-controls.
    requestAnimationFrame(() => { if (S().boardRenderer) S().boardRenderer.resize(); });
  }

  // ── Requests as toasts (#216) ─────────────────────────────────────────────
  // Over the top of the rail panel, never over the board/clocks/actions. The
  // opponent's request carries ✓ / ✕; your own pending request is one quiet line.

  function renderRequest(areaId, pending, icon, offerKey, offerVars, acceptAction, declineAction, waitingKey) {
    const st = S();
    const el = document.getElementById(areaId);
    if (!el) return;
    if (!pending || !st.gameState || st.gameState.status !== 'ongoing') { el.innerHTML = ''; return; }
    if (pending.from === st.myUser.userId) {
      el.innerHTML = gtoast(icon, t(waitingKey));
      return;
    }
    el.innerHTML = gtoast(icon, t(offerKey, offerVars), { actions: answerButtons(acceptAction, declineAction) });
  }

  function renderDrawPrompt() {
    const p = S().drawOfferPending;
    renderRequest('draw-prompt-area', p, 'handshake', 'game.draw_offer',
      { name: _esc((p && p.fromName) || t('game.opponent_generic')) }, 'doDrawAccept', 'doDrawDecline', 'game.draw_waiting');
  }

  function renderTimePrompt() {
    const p = S().timeRequestPending;
    renderRequest('time-prompt-area', p, 'hourglass', 'game.time_offer',
      { name: _esc((p && p.fromName) || ''), bonus: (p && p.bonus) || 10 }, 'doTimeAccept', 'doTimeDecline', 'game.time_waiting');
  }

  function renderUndoPrompt() {
    const p = S().undoOfferPending;
    renderRequest('undo-prompt-area', p, 'arrow-counter-clockwise', 'game.undo_offer',
      { name: _esc((p && p.fromName) || t('game.opponent_generic')) }, 'doUndoAccept', 'doUndoDecline', 'game.undo_waiting');
  }

  // ── Escape helper ─────────────────────────────────────────────────────────
  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Game action handlers (global onclick shims) ───────────────────────────

  // Two-tap confirm instead of a blocking confirm() dialog (#216).
  global.doResign = function() {
    if (confirmTap('doResign')) global.RoomClient.emit('game:resign');
  };
  global.doDrawOffer = function() {
    if (S().drawOfferPending) return;
    if (confirmTap('doDrawOffer')) global.RoomClient.emit('game:draw_offer');
  };
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
    // Shared with RoomUI.updateStripTimers so the mobile players-strip applies
    // the exact same predictedTurn overlay + transit compensation (#155/#166).
    effectiveTimerValues,
    effectiveTurnColor,
    renderTurnLabel,
    renderGameControls,
    renderSwap2,
    renderMoves,
    renderDrawPrompt,
    renderTimePrompt,
    renderUndoPrompt,
  };

})(window);
