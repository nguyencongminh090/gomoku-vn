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

(function (global) {
  'use strict';

  const S = () => global.RoomState;
  const client = global.RoomClient;

  // Server error/status payloads carry a language-neutral `code` alongside a
  // Vietnamese `message` (for logs/back-compat) — see server/routes/auth.js's
  // equivalent pattern. Always prefer `code`'s i18n translation over the raw
  // message so English-mode users don't see Vietnamese text (TODO #45).
  function serverMessage(data) {
    if (data && data.code) return t('err.' + data.code.toLowerCase());
    return (data && data.message) || '';
  }

  /**
   * Ask the server to re-send this room's authoritative state (TODO.md #152).
   *
   * The answer comes back as an ordinary `room:joined`, so it lands in the
   * handler below that already knows how to rebuild the board from scratch —
   * there is deliberately no second rebuild path to keep in sync.
   *
   * Called from two places: `GameUI.sendMove` when a move never gets acked,
   * and the gap check in `game:moved` when a broadcast is missed.
   */
  function requestResync() {
    client.emit('game:resync');
  }

  // ── Connection ────────────────────────────────────────────────────────────

  client.on('connect', () => {
    processRoomIntent();
  });
  // Also fire immediately in case connect already fired before this listener
  if (client.socket && client.socket.connected) {
    processRoomIntent();
  }

  // ── Presence (slot status dot: leave-site vs disconnected) ─────────────────

  // Page Visibility API — tab hidden (switched away/minimized) while the
  // socket itself stays connected, distinct from an actual socket drop
  // (which the server marks 'disconnected' on its own, see
  // DisconnectHandler.js). Only meaningful once actually in a room; the
  // server-side setPresence() is a safe no-op otherwise, but skipping here
  // avoids emitting on every lobby/login tab-switch too.
  document.addEventListener('visibilitychange', () => {
    if (!S().roomData) return;
    client.emit('room:presence', { presence: document.hidden ? 'away' : 'active' });
    if (!document.hidden) resyncClockOnReturn();
  });

  // A backgrounded tab throttles setInterval, so the local countdown drifts
  // while hidden and `timer:sync` broadcasts received meanwhile were applied
  // against a stalled main thread. On the way back to the foreground, pull a
  // fresh authoritative sync rather than trusting the stale local state
  // (TODO.md #165). `focus` and `visibilitychange` both fire on tab return in
  // most browsers; the 1s guard collapses the pair into one resync.
  let lastReturnResyncTs = 0;
  function resyncClockOnReturn() {
    const gs = S().gameState;
    if (!gs || gs.status !== 'ongoing') return;
    const now = Date.now();
    if (now - lastReturnResyncTs < 1000) return;
    lastReturnResyncTs = now;
    requestResync();
  }
  window.addEventListener('focus', resyncClockOnReturn);

  // ── Room state events ─────────────────────────────────────────────────────

  // See the #room-entry-overlay comment in room.html — visible by default,
  // hidden once we actually have room data to show instead of it.
  function hideEntryOverlay() {
    const el = document.getElementById('room-entry-overlay');
    if (el) el.classList.remove('visible');
  }

  client.on('room:joined', (data) => {
    hideEntryOverlay();
    const st = S();
    st.roomData = data;

    // Clear any not-yet-confirmed stone from a move still in flight
    // (TODO.md #153). This fires on first join too (boardRenderer doesn't
    // exist yet — no-op) and on every game:resync answer, which is exactly
    // where a pending overlay needs to give way to the authoritative board
    // this payload is about to (re)draw.
    if (st.boardRenderer) st.boardRenderer.setOptimisticStone(null);
    // predictedTurn always travels with optimisticStone (TODO.md #155) — a
    // full resync answer is exactly the kind of authoritative reload that
    // must never leave it stranded active.
    st.predictedTurn.active = false;
    // Authoritative state is being (re)loaded below, including from this
    // module's own game:resync — nothing pending survives it (TODO.md #154).
    // The turn watchdog re-arms through applyTimerSync further down.
    cancelMoveConfirmWatchdog();

    // Update URL so the room link is shareable
    const url = new URL(window.location);
    if (url.searchParams.get('id') !== data.roomId) {
      url.searchParams.set('id', data.roomId);
      window.history.replaceState({}, '', url);
    }

    // Restore game state on reconnect
    if (data.gameState) {
      st.gameState = data.gameState;
      st.timerValues = data.timer || st.timerValues;
      // A pending undo request must still be visible to a reconnecting
      // opponent (TODO.md #128 decision #7/#8) — GameEngine.serialize()
      // carries it as gameState.undoOffer; renderSwap2()/updateBoardState()
      // below both call GameUI.renderUndoPrompt() internally.
      st.undoOfferPending = data.gameState.undoOffer || null;
      applyTimerSync(data.timerSync);
      if (st.gameState.swap2 && st.gameState.swap2.enabled && st.gameState.swap2.openingPhase !== 'play') {
        GameUI.initBoard();
        GameUI.renderSwap2();
      } else {
        GameUI.initBoard();
        GameUI.updateBoardState();
      }
    }
    RoomUI.updateUI();

    // Cover the rare case of joining/reconnecting with the tab already
    // hidden (e.g. it was backgrounded through the whole page load) — the
    // visibilitychange listener above only fires on a state *change*.
    if (document.hidden) client.emit('room:presence', { presence: 'away' });
  });

  client.on('room:updated', (data) => {
    const st = S();
    const prevSlot = st.mySlot;

    // Merge, don't replace. `settings` only arrives on the one event where it
    // actually changed (see RoomManager.serializeRoomUpdate), and `users` /
    // `scoreTable` only arrive when something in them actually changed (see
    // broadcastRoomUpdate in server/socket/state.js) — any omitted field must
    // keep whatever the client already holds. renderSettings() and initBoard()
    // read st.roomData.settings without optional chaining and would throw on
    // a wholesale replace.
    const { users: usersPatch, ...rest } = data;
    st.roomData = Object.assign({}, st.roomData, rest);

    // `users` is a patch — { upserts, removed } — not the full array, so it
    // has to be folded into the existing list by userId rather than assigned
    // wholesale. Both operations are idempotent (re-upserting an entry already
    // held, or removing a userId never held, changes nothing), same as the
    // lobby's room-list patch in lobby.js.
    if (usersPatch) {
      const byId = new Map((st.roomData.users || []).map(u => [u.userId, u]));
      for (const userId of usersPatch.removed || []) byId.delete(userId);
      for (const user of usersPatch.upserts || []) byId.set(user.userId, user);
      st.roomData.users = Array.from(byId.values());
    }

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
    cancelTurnWatchdog();
    cancelMoveConfirmWatchdog();
    window.location.href = 'index.html';
  });

  client.on('room:kicked', (data) => {
    showToast(data.code ? serverMessage(data) : (data.message || t('room.kicked')), 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
  });

  client.on('room:destroyed', (data) => {
    showToast(serverMessage(data), 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
  });

  client.on('room:error', (data) => {
    const st = S();
    if (!st.roomData) {
      showToast(serverMessage(data), 'error');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
      return;
    }
    ChatUI.appendSystemMessage(`⚠ ${serverMessage(data)}`);
  });

  // ── Chat events ───────────────────────────────────────────────────────────

  client.on('chat:message', (msg) => {
    ChatUI.appendChatMessage(msg);
  });

  client.on('chat:error', (data) => {
    ChatUI.appendSystemMessage(`⚠ ${serverMessage(data)}`);
  });

  // ── Game events ───────────────────────────────────────────────────────────

  client.on('game:error', (data) => {
    ChatUI.appendSystemMessage(`⚠ ${serverMessage(data)}`);
  });

  client.on('game:init', (data) => {
    const st = S();
    st.gameState = data;
    st.timerValues = data.timer || { black: data.timerSeconds || 60, white: data.timerSeconds || 60 };
    cancelMoveConfirmWatchdog();   // fresh game, nothing of ours in flight (#154)
    applyTimerSync(data.timerSync);
    st.drawOfferPending = null;
    st.timeRequestPending = null;
    st.undoOfferPending = data.undoOffer || null;

    // Phone: the zen panel is a bottom sheet covering the lower half of the
    // screen. It has to stay open before the game (that is where the seat and
    // ready buttons live), but the moment play starts the board is what
    // matters — slide it down to the tab bar. The player can pull it back up
    // from any rail icon. No-op on desktop, where the drawer sits beside the
    // board rather than over it, and on non-zen skins.
    // Through RoomDrawer, not classList directly: the class alone leaves the
    // sheet's content focusable and screen-reader-visible while it is off
    // screen (TODO.md #138). room.js owns that pairing and loads first.
    if (document.body.classList.contains('zen-room')
        && window.matchMedia('(max-width: 768px)').matches) {
      window.RoomDrawer.setCollapsed(true);
    }

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

    // Receive-side loss detection (TODO.md #152). The ack path protects the
    // player who *made* the move; this protects the one waiting for it. If a
    // game:moved broadcast is dropped, the opponent keeps showing the old
    // board and believes it is not their turn, while the mover waits for a
    // reply that is never coming — both sides frozen, neither with a timeout
    // to break out of it.
    //
    // `moveCount` is a sequence number that has been on the wire all along
    // and was simply assigned over without ever being compared. A move-delta
    // is only safe to apply on top of the exact state it was computed from.
    //
    // Only this handler may gap-check. Every other path that touches
    // moveCount (game:init, room:joined, game:swap2_state, game:undo_applied)
    // loads whole state rather than a delta and so *sets* the baseline — if
    // one of them went through this branch, the resync it triggered would
    // arrive as full state, read as another jump, and resync forever.
    if (typeof data.moveCount === 'number') {
      const expected = st.gameState.moveCount + 1;
      if (data.moveCount <= st.gameState.moveCount) {
        // Already applied — the server replaying a move for a retried
        // moveId. Applying it again would double-push into moveHistory.
        return;
      }
      if (data.moveCount > expected) {
        requestResync();
        return;
      }
    }

    // Confirm this player's own optimistic stone (TODO.md #153) now that its
    // real board write is about to happen below — matching by cell is safe
    // here (not just at handler entry) because we've only just confirmed
    // this delta is the next one being applied, not a stale replay or a
    // gap-redirected one. An opponent's move landing here simply won't match
    // this player's own pending cell, so this is a no-op for them.
    // Captured before clearing below — the sound-dedup check further down
    // needs to know whether THIS broadcast is the one that just confirmed
    // our own pending move, and optimisticStone won't say so any more once
    // it's been nulled.
    let confirmedOwnPendingMove = false;
    if (st.boardRenderer && st.boardRenderer.optimisticStone
        && st.boardRenderer.optimisticStone.x === data.x
        && st.boardRenderer.optimisticStone.y === data.y) {
      confirmedOwnPendingMove = true;
      st.boardRenderer.setOptimisticStone(null);
      // This is the confirmation the move-confirm watchdog (TODO.md #154) was
      // waiting for.
      cancelMoveConfirmWatchdog();
    }

    // Real progress — whatever the watchdog was backing off from is resolved.
    consecutiveFires = 0;
    lastFireSignature = null;

    if (st.drawOfferPending) {
      st.drawOfferPending = null;
      GameUI.renderDrawPrompt();
    }
    // The mover's own pending undo request auto-cancels when they continue
    // playing instead of waiting (TODO.md #128 decision #9) — the server
    // flags it on this same broadcast rather than a separate event.
    if (data.undoCancelled) {
      st.undoOfferPending = null;
      GameUI.renderUndoPrompt();
    }

    const colorVal = data.color === 'BLACK' ? 1 : 2;
    st.gameState.board[data.y][data.x] = colorVal;
    st.gameState.currentTurn = data.nextTurn;
    st.gameState.moveCount = data.moveCount;
    if (!st.gameState.moveHistory) st.gameState.moveHistory = [];
    st.gameState.moveHistory.push({ x: data.x, y: data.y, color: data.color, timestamp: Date.now() });
    if (data.timer) st.timerValues = data.timer;
    if (data.timerSync) applyTimerSync(data.timerSync);
    if (data.gameOver) st.gameState.status = 'finished';
    if (data.result) st.gameState.result = data.result;

    // predictedTurn snaps to the just-written server values above rather
    // than surviving the flip (TODO.md #155) — letting the local countdown
    // "win" would compound drift over a long game, since it started at click
    // time while the server's clock started at server-processing time.
    st.predictedTurn.active = false;

    if (global.audioManager) {
      const myPlayer = st.gameState.players.find(p => p.userId === st.myUser.userId);
      const isOpponent = !myPlayer || myPlayer.color !== data.color;
      // Our own move already played its sound at click time (TODO.md #155,
      // GameUI.sendMove) — replaying it here on confirmation would double it.
      // Opponent/spectator moves (isOpponent) are never predicted locally, so
      // they always play here, unaffected.
      if (isOpponent || !confirmedOwnPendingMove) {
        global.audioManager.playMoveSound(isOpponent);
      }
    }

    // applyTimerSync above re-arms the watchdog, but only when this broadcast
    // actually carried a timerSync — arm unconditionally so a payload without
    // one can't leave the turn silently unguarded.
    armTurnWatchdog();

    GameUI.updateBoardState();
    RoomUI.updateUI();
  });

  client.on('game:swap2_state', (data) => {
    const st = S();
    if (!st.gameState) return;

    if (data.undoCancelled) {
      st.undoOfferPending = null;
      GameUI.renderUndoPrompt();
    }

    st.gameState.board = data.board;
    st.gameState.currentTurn = data.currentTurn;
    st.gameState.moveCount = data.moveCount;
    if (data.moveHistory) st.gameState.moveHistory = data.moveHistory;
    st.gameState.swap2 = data.swap2;
    st.gameState.players = data.players;
    st.gameState._nextColor = data.nextColor;
    if (data.lastStone) st.gameState._lastStone = data.lastStone;

    // Full-state load on a path that carries no timerSync — re-evaluate the
    // watchdog against the turn this just installed instead of leaving it
    // pointed at the previous one (TODO.md #154).
    cancelMoveConfirmWatchdog();
    consecutiveFires = 0;
    lastFireSignature = null;
    armTurnWatchdog();

    if (st.gameState.swap2.openingPhase !== 'play') {
      GameUI.renderSwap2();
    } else {
      // Opening resolved — switch to normal play
      GameUI.updateBoardState();
      GameUI.renderGameControls();

      GameUI.setTurnBarVisible(true);

      const blackP = st.gameState.players.find(p => p.color === 'BLACK');
      const whiteP = st.gameState.players.find(p => p.color === 'WHITE');
      const bNameEl = document.getElementById('tb-black-name');
      const wNameEl = document.getElementById('tb-white-name');
      if (bNameEl) bNameEl.textContent = blackP ? blackP.displayName : '—';
      if (wNameEl) wNameEl.textContent = whiteP ? whiteP.displayName : '—';
    }
  });

  // ── Local clock ───────────────────────────────────────────────────────────
  //
  // The server no longer ticks once per second over the socket (review 4.3:
  // that was ~71% of in-game bandwidth). It sends `timer:sync` — both players'
  // remaining seconds, who is counting down, and when that player's clock hits
  // zero — whenever the clock changes discontinuously: game start, each move,
  // bonus time, pause on disconnect, resume. Between those, this ticks locally.
  //
  // Every sync carries the server's own clock reading, and we count down
  // against an offset rather than comparing timestamps directly, so a client
  // whose system clock is wrong still shows the right remaining time.

  let localTimer = null;      // setInterval handle for the local countdown
  let clockOffsetMs = 0;      // serverTime - our Date.now() at the last sync
  let activeDeadline = null;  // server-clock ms when the active player hits 0
  let activeColor = null;     // 'black' | 'white'

  // #169 — keep the displayed clock steady on a jittery link.
  let lastShaveSec = 0;          // the whole-second shave last applied — feeds displayShaveSec's hysteresis
  let clampSec = null;           // highest whole-second value we'll show for the active clock this turn
  let clampColor = null;         // which colour clampSec belongs to

  // A sync whose deadline is more than this further out than the previous one
  // means the server granted time (bonus / admin add-time); anything smaller
  // is ordinary sync-to-sync drift or a reordered packet. Well below the
  // smallest real grant, well above packet jitter.
  const TIME_GRANTED_MARGIN_MS = 2000;

  /** Our best estimate of the server's clock right now. */
  function serverNow() {
    return Date.now() + clockOffsetMs;
  }

  /**
   * #169 — the active player's displayed clock never ticks UP within a turn.
   * A jitter-driven shave flip or a reordered `timer:sync` can only ever be
   * absorbed downward; the number cannot bounce back up. The reset points
   * (turn change, unpause, granted time) clear `clampSec` before this runs, so
   * a legitimately higher value starts a fresh monotonic run.
   *
   * Trade-off (documented in docs/todo/B169-*.md): after a real RTT spike the
   * clock can hold for a second or two while wall-time catches back up. That
   * reads as a hiccup; the bounce it replaces read as "the game is broken".
   */
  function clampActiveDisplay(color, computedSec) {
    if (color === clampColor && clampSec !== null) {
      computedSec = Math.min(computedSec, clampSec);
    }
    clampSec = computedSec;
    clampColor = color;
    return computedSec;
  }

  function stopLocalTimer() {
    if (localTimer) {
      clearInterval(localTimer);
      localTimer = null;
    }
  }

  /**
   * How much of the displayed clock to shave off for packet transit (#165).
   * Half the last measured move round-trip, clamped: a one-way `timer:sync`
   * took roughly this long to reach us, so the server clock has already run
   * that much further than the reading the packet carried. Only ever
   * subtracted from a *displayed* value — activeDeadline and serverNow() keep
   * pure skew semantics so armTurnWatchdog's math below is unaffected.
   *
   * The maths itself lives in `timer-sync-core.js` (TODO.md #168): the
   * diagnostic page has to report exactly the clock this room runs, and a
   * second hand-copied implementation would drift from it within one fix.
   * This wrapper only supplies the RoomState reading.
   */
  function transitDelaySec() {
    const st = S();
    return global.TimerSyncCore.transitDelaySec(st && st.halfRttMs);
  }

  /** Recompute the active player's remaining seconds and repaint. */
  function tickLocal() {
    const st = S();
    if (activeDeadline === null || !activeColor) return;

    const remaining = clampActiveDisplay(activeColor, global.TimerSyncCore.compensatedRemainingSec(
      activeDeadline, serverNow(), st && st.halfRttMs));
    st.timerValues = Object.assign({}, st.timerValues, { [activeColor]: remaining });
    GameUI.renderTimers();

    // Beep once per second through the active player's own final 10s — never
    // for the opponent's clock (see prompt-architect spec). Unchanged in
    // behaviour; it just reads the locally-derived value now.
    if (global.audioManager && st.gameState && st.gameState.status === 'ongoing') {
      const myPlayer = st.gameState.players.find(p => p.userId === st.myUser.userId);
      if (myPlayer && st.gameState.currentTurn === st.myUser.userId) {
        const myColor = myPlayer.color === 'BLACK' ? 'black' : 'white';
        if (myColor === activeColor && remaining > 0 && remaining <= 10) {
          global.audioManager.playTimerTickSound();
        }
      }
    }

    // The server decides the actual timeout and will send game:ended; stop
    // counting past zero so we don't render negatives while that arrives.
    if (remaining <= 0) stopLocalTimer();
  }

  /** Adopt a timer state from the server and (re)start the local countdown. */
  function applyTimerSync(sync) {
    if (!sync) return;
    const st = S();

    // One `Date.now()` reading feeds both halves of the subtraction (it used
    // to be read twice, a millisecond apart) — same value, no double read.
    clockOffsetMs = global.TimerSyncCore.clockOffsetMs(sync.serverTime, Date.now());

    // Shave transit delay off the active player's opening value too, not just
    // the per-second ticks below — otherwise the first paint after every sync
    // (the one right after our own move, when the player is looking straight
    // at the clock) flashes the uncompensated number for up to a second
    // before tickLocal corrects it. #165. The previous step is fed back in so
    // a jittery estimate stops flipping it (#169).
    const shave = sync.running
      ? global.TimerSyncCore.displayShaveSec(st && st.halfRttMs, lastShaveSec)
      : 0;
    lastShaveSec = shave;

    // #169 — decide whether this sync starts a fresh monotonic run for the
    // active clock. It does on a turn change, on unpause, or when the server
    // pushed the deadline out (bonus / add-time); otherwise the clamp carries
    // over so the number can only continue downward.
    const rawActive = sync.activeColor === 'black' ? sync.black : sync.white;
    const sameColor = sync.activeColor === clampColor;
    const timeGranted = sameColor && activeDeadline !== null && Number.isFinite(sync.deadline)
      && sync.deadline > activeDeadline + TIME_GRANTED_MARGIN_MS;
    if (!sync.running || !sameColor || timeGranted) clampSec = null;

    const activeShown = sync.running
      ? clampActiveDisplay(sync.activeColor, Math.max(0, rawActive - shave))
      : Math.max(0, rawActive);
    st.timerValues = {
      black: sync.activeColor === 'black' ? activeShown : sync.black,
      white: sync.activeColor === 'white' ? activeShown : sync.white,
    };
    activeColor = sync.activeColor;
    activeDeadline = sync.deadline;

    // Diagnostic for #165: `rawOffsetMs` is clock skew + one-way transit
    // delay combined; a gap between it and a plausible skew (a few hundred ms
    // at most) is the transit delay this compensation removes. Off unless a
    // reporter sets localStorage.gvn_timer_debug = '1' in DevTools.
    let timerDebug = false;
    try { timerDebug = localStorage.getItem('gvn_timer_debug') === '1'; } catch { /* storage blocked */ }
    if (timerDebug) {
      console.info('[timer:sync] rawOffsetMs=%d halfRttMs=%d shaveSec=%d clampSec=%s activeColor=%s',
        Math.round(clockOffsetMs), Math.round(st.halfRttMs || 0), shave, String(clampSec), sync.activeColor);
    }

    stopLocalTimer();
    GameUI.renderTimers();

    // `running: false` means the server's clock is paused (disconnect grace) —
    // show the frozen values and count nothing.
    if (sync.running && sync.deadline) {
      localTimer = setInterval(tickLocal, 1000);
    }

    // Every discontinuous clock change funnels through here (game start, each
    // move, bonus time, pause, resume) — which makes this the one place the
    // desync watchdog below has to be re-armed from, rather than a re-arm
    // sprinkled over each of those handlers separately.
    armTurnWatchdog();
  }

  client.on('timer:sync', applyTimerSync);

  // ── Desync watchdog (TODO.md #154) ────────────────────────────────────────
  //
  // #152's gap check only fires when a *later* `game:moved` arrives to compare
  // moveCount against. With two players alternating strictly, that later packet
  // IS the move the stuck side is waiting for, so it never comes and the gap
  // check has nothing to trigger on. There is no periodic broadcast to act as a
  // wake-up either — TimerManager ticks purely server-side (TimerManager.js:11)
  // and the clock rides along on the very `game:moved` that was dropped.
  //
  // The wake-up this needs was already on the wire: `timerSync.deadline`, the
  // server-clock instant at which the player we believe is on move flags. What
  // it must NOT do is wait for that deadline to pass.
  //
  // ⚠ The obvious design — "the watched clock ran out and no game:ended came,
  // so our view is provably stale" — is sound logic that arrives too late to
  // be worth anything, and an e2e run caught it doing exactly that. Writing D
  // for the deadline we are watching and T for the clock length:
  //
  //     D  = t0 + T          t0 = when the opponent's clock started
  //     F  = t1 + T          t1 = when the opponent actually moved, t1 > t0
  //                          F  = when OUR clock flags, server-side, because
  //                               it started the moment they moved
  //
  // Being stuck means the server has us on move, so we are running out of time
  // at F — and F > D always. Firing at D + grace therefore races our own
  // flag-fall and loses it whenever the opponent moved within `grace` of their
  // clock starting. Measured in the browser: opponent moved instantly, the
  // stuck player was timed out and lost the game 14.8s in, watchdog due at 21s.
  // The status quo this whole item exists to remove is "the stuck player loses
  // on time", so a watchdog that fires after that has fixed nothing.
  //
  // Firing at a FRACTION of the watched clock inverts that for free: t0 + αT
  // with α < 1 is strictly before D, hence strictly before F, no matter how
  // fast the opponent moved. The rescue margin is (1-α)T + the opponent's
  // think time, and it can never go negative.
  //
  // α = 0.75 against the measured distribution — 9,429 real inter-move gaps
  // across 334 completed games, from the server-side Date.now() stamps in
  // `games.moves`:
  //
  //   p50 5.0s · p90 24.8s · p99 50.4s · p99.5 54.9s · p99.9 83.5s · max 184.3s
  //
  // At the default per_move/60s control (server/config.js) that fires at 45s,
  // which 1.8% of real gaps exceed — 25% of games would spend one spurious
  // resync — and it leaves the stuck player at least 15s of their own clock to
  // actually move once recovered. Note how badly a flat constant does on this
  // same data, which is why one isn't used (#131's lesson): 15s would have
  // fired in 75% of those games, 30s in 50%.
  //
  // A spurious fire is deliberately cheap: `game:resync` answers as an ordinary
  // room:joined, and initBoard() only rebuilds DOM when there is no renderer
  // yet, so an unchanged answer costs one canvas repaint and nothing visible.
  // It also says nothing to the player, for the same reason — a notice fired on
  // a long think would be worse noise than the resync it is announcing.
  const WAIT_FRACTION = 0.75;

  // Ceiling for controls whose clock is minutes long (per_game/blitz), so those
  // don't sit deadlocked for a quarter of an hour. p99.9 of the same measured
  // distribution — 9 of 9,429 gaps (0.1%) sit above it.
  const WAIT_CEILING_MS = 83500;

  // Floor for the first check of a turn, so a clock already down to its last
  // seconds doesn't schedule a fire for a few hundred ms from now.
  const WATCHDOG_MIN_MS = 3000;

  // A move's `game:moved` is written to our own socket BEFORE its ack (see
  // GameHandler: io.to(room).emit then ack, same connection, so it is ordered
  // ahead). Once the ack is in hand the broadcast has therefore either already
  // arrived or been dropped — this window only absorbs main-thread jank, so it
  // is half of #152's ack timeout rather than another full round-trip's worth.
  const MOVE_CONFIRM_TIMEOUT_MS = 2500;

  // Rate limit, not a detection threshold: no matter what the deadline says,
  // never re-check sooner than this, and back off while nothing changes. This
  // is what makes a resync loop impossible when the deadline is *already* in
  // the past at arming time (a resync answer that lands after the clock it
  // describes has expired) — the same class of trap as #152's bug 7.
  const WATCHDOG_FLOOR_MS = 15000;
  const WATCHDOG_MAX_BACKOFF = 5;   // floor doubles at most this many times

  let turnWatchdog = null;
  let moveConfirmWatchdog = null;
  let lastFireSignature = null;
  let consecutiveFires = 0;

  /** What the watchdog last resynced on, to notice a resync that changed nothing. */
  function stateSignature() {
    const gs = S().gameState;
    if (!gs) return 'none';
    return `${gs.moveCount}|${gs.currentTurn}|${activeDeadline}`;
  }

  function cancelTurnWatchdog() {
    if (turnWatchdog) { clearTimeout(turnWatchdog); turnWatchdog = null; }
  }

  function cancelMoveConfirmWatchdog() {
    if (moveConfirmWatchdog) { clearTimeout(moveConfirmWatchdog); moveConfirmWatchdog = null; }
  }

  function onTurnWatchdogFire() {
    turnWatchdog = null;
    const gs = S().gameState;
    // Re-checked here, not just at arming time: every path that ends or
    // suspends a game (game:ended, resign, undo, Swap2, interruption, leaving)
    // can land while this is pending, and an orphaned resync firing into a
    // finished game is the failure mode docs/instruction/B154-*.md calls out.
    if (!gs || gs.status !== 'ongoing') return;

    const sig = stateSignature();
    consecutiveFires = (sig === lastFireSignature) ? consecutiveFires + 1 : 1;
    lastFireSignature = sig;

    requestResync();
    // Re-arm rather than waiting for the answer to do it: if the resync answer
    // is itself lost, nothing else would ever schedule another check and the
    // client would be stranded exactly as before. The backoff above keeps that
    // retry from becoming a loop.
    armTurnWatchdog();
  }

  function armTurnWatchdog() {
    cancelTurnWatchdog();
    const st = S();
    const gs = st.gameState;
    if (!gs || gs.status !== 'ongoing') return;
    // No deadline means no clock is running — game not started, or paused for
    // disconnect grace (getSync sends running:false, deadline:null). Nothing to
    // measure against, and a paused game is not a deadlock.
    if (activeDeadline === null) return;
    // Only while waiting for someone else's move. Believing it is our own turn
    // and being wrong is the *other* variant (ack OK, own broadcast dropped),
    // and that one already has two faster answers: the move-confirm watchdog
    // below, and #152's gap check firing the moment the opponent replies. Left
    // armed here it would instead resync us for thinking too long on our own
    // turn — a false positive on every deep think, and the one case where the
    // player is definitely not stuck. Spectators have no turn and stay armed,
    // which is right: they have no ack path at all.
    if (gs.currentTurn === st.myUser.userId) return;

    const untilDeadline = activeDeadline - serverNow();
    const delay = Math.min(untilDeadline * WAIT_FRACTION, WAIT_CEILING_MS);
    // Repeats are rate-limited instead of fraction-based: once we have fired on
    // a state that then didn't change, the fraction would only shrink toward
    // zero and spin.
    const floor = consecutiveFires
      ? WATCHDOG_FLOOR_MS * Math.pow(2, Math.min(consecutiveFires - 1, WATCHDOG_MAX_BACKOFF))
      : WATCHDOG_MIN_MS;
    turnWatchdog = setTimeout(onTurnWatchdogFire, Math.max(floor, delay));
  }

  /**
   * Arm the fast path for "my ack came back OK but my own move never did"
   * (the second variant in docs/todo/B154-*.md). Called by GameUI.sendMove.
   *
   * The turn watchdog above already catches this case, but only once the stale
   * clock runs out — up to a full move allowance of a stone stuck in its
   * pending look, and (once #155 lands) of a turn bar stuck on a predicted
   * turn. This bounds it to one confirmation window instead.
   */
  function armMoveConfirmWatchdog() {
    cancelMoveConfirmWatchdog();
    moveConfirmWatchdog = setTimeout(() => {
      moveConfirmWatchdog = null;
      const st = S();
      if (!st.gameState || st.gameState.status !== 'ongoing') return;
      // The stone is cleared by the game:moved that confirms it, so a stone
      // still pending here means that broadcast never landed.
      if (!st.boardRenderer || !st.boardRenderer.optimisticStone) return;
      requestResync();
    }, MOVE_CONFIRM_TIMEOUT_MS);
  }

  client.on('game:ended', (data) => {
    const st = S();
    // The "ended while an ack is still in flight" race (TODO.md #155): a
    // pending move's own optimisticStone/predictedTurn can never get its
    // game:moved confirmation once the game is already over (an ack landing
    // after this is just ignored, nothing left to reconcile). Cleared here,
    // before the result below is applied, rather than left to time out via
    // the move-confirm watchdog into a game that no longer exists.
    if (st.boardRenderer) st.boardRenderer.setOptimisticStone(null);
    st.predictedTurn.active = false;
    stopLocalTimer();   // the clock is over; the final values stay on screen
    // No clock left to reason about — anything still pending here would be an
    // orphaned resync fired into a finished game (TODO.md #154).
    cancelTurnWatchdog();
    cancelMoveConfirmWatchdog();
    if (data.scoreTable && st.roomData) st.roomData.scoreTable = data.scoreTable;
    if (st.gameState) {
      st.gameState.status = 'finished';
      if (data.result) st.gameState.result = data.result;
    }
    // Repaints the board (dropping the now-cleared overlays) and the
    // turn-bar/timer (which RoomUI.updateUI() below never touches) against
    // the finished status just written above.
    GameUI.updateBoardState();
    st.drawOfferPending = null;
    GameUI.renderDrawPrompt();
    st.undoOfferPending = null;
    GameUI.renderUndoPrompt();

    // No more win/lose/draw modal (instruction.md §B36 removed
    // #game-overlay) — the board's own win highlight (board.js
    // _drawWinHighlight) plus the system-chat lines already emitted
    // server-side (resign/timeout/draw) are the announcement. The win/lose
    // sound cue is the one thing that used to live inside that removed
    // RoomUI.showGameOverlay(), so it's kept here directly.
    if (st.mySlot !== null && data.result && data.result.winner !== 'draw') {
      if (data.result.winner === st.myUser.userId) {
        if (window.audioManager) window.audioManager.playWinSound();
      } else {
        if (window.audioManager) window.audioManager.playLoseSound();
      }
    }

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

  client.on('game:undo_offered', (data) => {
    S().undoOfferPending = data;
    GameUI.renderUndoPrompt();
  });

  client.on('game:undo_declined', () => {
    S().undoOfferPending = null;
    GameUI.renderUndoPrompt();
  });

  // Play-mode accept only — an opening-mode accept arrives as a
  // game:swap2_state resync instead (reuses the existing Swap2 render path).
  client.on('game:undo_applied', (data) => {
    const st = S();
    if (!st.gameState) return;

    st.undoOfferPending = null;

    for (const cell of data.cleared) {
      st.gameState.board[cell.y][cell.x] = 0;
    }
    st.gameState.currentTurn = data.currentTurn;
    st.gameState.moveCount = data.moveCount;
    if (st.gameState.moveHistory) {
      st.gameState.moveHistory = st.gameState.moveHistory.slice(0, data.moveCount);
    }

    // As in game:swap2_state above — the turn moved without a timerSync, so the
    // watchdog has to be re-pointed at it (TODO.md #154).
    cancelMoveConfirmWatchdog();
    consecutiveFires = 0;
    lastFireSignature = null;
    armTurnWatchdog();

    GameUI.renderUndoPrompt();
    GameUI.updateBoardState();
    RoomUI.updateUI();
  });

  client.on('game:interrupted', (data) => {
    ChatUI.appendSystemMessage(t('room.disconnected', { name: data.playerName, seconds: data.secondsLeft }));
    if (S().gameState) S().gameState.status = 'interrupted';
    // Not 'ongoing' any more, and the server pauses the clock — no deadlock to
    // detect while a player is inside disconnect grace (TODO.md #154).
    cancelTurnWatchdog();
    cancelMoveConfirmWatchdog();
    GameUI.updateBoardState();
  });

  client.on('game:resumed', () => {
    ChatUI.appendSystemMessage(t('room.reconnected'));
    if (S().gameState) S().gameState.status = 'ongoing';
    // Back to 'ongoing', so the watchdog can guard again. The server's resume
    // sends a fresh timer:sync of its own; this only covers the case of that
    // sync arriving before this event (TODO.md #154).
    armTurnWatchdog();
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
      if (roomId) {
        client.emit('room:join', { roomId });
      } else {
        // No sessionStorage intent and no ?id= — e.g. a bare room.html link
        // pasted/typed directly. Nothing will ever emit room:join/create, so
        // room:joined will never arrive and #room-entry-overlay would stay up
        // forever (see TODO.md #40 / instruction.md §40). Bounce back to the
        // lobby instead of freezing there.
        window.location.href = 'index.html';
      }
    }
  }

  // Exposed for game-ui.js's move state machine (TODO.md #152) — it needs the
  // same server-error rendering and the same resync entry point this module
  // uses, and duplicating either would let them drift.
  global.RoomSocket = { serverMessage, requestResync, armMoveConfirmWatchdog, refreshLocalTimer: tickLocal };

})(window);
