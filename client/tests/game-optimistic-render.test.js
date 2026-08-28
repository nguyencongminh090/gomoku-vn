/**
 * TODO.md #153 — optimistic render for the mover's own stone.
 *
 * Before this fix, `onCellClick` only emitted the move; the stone — even the
 * mover's own — only appeared once the server's `game:moved` broadcast came
 * back, so the full round trip (~0.5s for the reporting players) showed up
 * as visible lag on every move despite there being no artificial delay
 * anywhere in the drawing code (traced and ruled out in
 * docs/todo/B153-*.md).
 *
 * Depends on #152 (ack/timeout/retry/moveId/resync) — these tests exercise
 * the optimistic overlay through that same lifecycle, at the GameUI/
 * room-socket integration level, with a stub BoardRenderer standing in for
 * the canvas (see client/tests/board-optimistic-stone.test.js for the
 * BoardRenderer-internal drawing tests).
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const GAME_UI_SOURCE     = JS('game-ui.js');
const ROOM_SOCKET_SOURCE = JS('room-socket.js');
const I18N_SOURCE        = JS('i18n.js');
// Shared clock maths both room modules call into (TODO.md #168). room.html
// loads it as a classic script before the module entry; evaluating it first
// here reproduces that order.
const TIMER_SYNC_CORE_SOURCE = JS('timer-sync-core.js');

function makeClientStub() {
  return {
    socket: { connected: false },
    listeners: {},
    ackCalls: [],
    plainEmits: [],
    on(event, cb) { this.listeners[event] = cb; return this; },
    emit(event, data) { this.plainEmits.push({ event, data }); },
    emitAck(event, data, timeoutMs, cb) {
      this.ackCalls.push({ event, data, timeoutMs, cb });
    },
    timeout(i) { this.ackCalls[i].cb(new Error('operation has timed out')); },
    respond(i, res) { this.ackCalls[i].cb(null, res); },
  };
}

/** A stand-in for BoardRenderer that records calls instead of touching a canvas. */
function makeBoardRendererStub() {
  return {
    optimisticStone: null,
    setOptimisticStoneCalls: [],
    markOptimisticWarningCalls: 0,
    setOptimisticStone(stone) {
      this.optimisticStone = stone;
      this.setOptimisticStoneCalls.push(stone);
    },
    markOptimisticWarning() {
      this.markOptimisticWarningCalls++;
      if (this.optimisticStone) this.optimisticStone = { ...this.optimisticStone, warning: true };
    },
    setState: jest.fn(),
    resize: jest.fn(),
  };
}

function loadRoomModules({ gameStatus = 'ongoing', moveCount = 5, withBoardRenderer = true } = {}) {
  // The turn-bar/timer elements are included directly (rather than only via
  // initBoard()'s template, which is stubbed out below) because sendMove()
  // and room-socket.js's rollback/confirm paths call the real renderTimers()/
  // renderTurnLabel() straight from game-ui.js's own closure — a same-module
  // call the `window.GameUI.xxx = jest.fn()` stubs further down can't
  // intercept, only cross-module callers (room-socket.js) go through those.
  document.body.innerHTML = `
    <div id="board-area"></div><div id="chat-messages"></div>
    <div id="turn-bar">
      <div id="tb-black"><span id="tb-black-timer"></span></div>
      <div id="turn-label"></div>
      <div id="tb-white"><span id="tb-white-timer"></span></div>
    </div>
  `;

  const client = makeClientStub();
  window.RoomClient = client;

  const systemMessages = [];
  window.ChatUI = {
    appendSystemMessage: (text) => systemMessages.push(text),
    appendChatMessage: jest.fn(),
    showFloatMessage: jest.fn(),
  };

  window.RoomUI = { updateUI: jest.fn() };
  window.audioManager = {
    playMoveSound: jest.fn(),
    playWinSound: jest.fn(),
    playLoseSound: jest.fn(),
    playTimerTickSound: jest.fn(),
  };

  const boardRenderer = withBoardRenderer ? makeBoardRendererStub() : null;

  window.RoomState = {
    myUser: { userId: 'me' },
    roomData: { roomId: 'r1' },
    boardRenderer,
    timerValues: { black: 60, white: 60 },
    halfRttMs: 0,
    predictedTurn: { active: false, forColor: null, snapshotTimerValues: null, switchedAtLocalTs: null },
    gameState: {
      status: gameStatus,
      moveCount,
      currentTurn: 'me',
      board: Array.from({ length: 15 }, () => new Array(15).fill(0)),
      moveHistory: [],
      players: [
        { userId: 'me', color: 'BLACK' },
        { userId: 'them', color: 'WHITE' },
      ],
    },
  };

  window.eval(TIMER_SYNC_CORE_SOURCE);
  window.eval(I18N_SOURCE);
  window.eval(GAME_UI_SOURCE);
  // Kept aside for the one test that needs the real onCellClick wiring
  // initBoard() builds — every other test (and room-socket.js's own calls
  // to GameUI.initBoard() on room:joined) gets the stub below, same as the
  // #152 test file this pattern is borrowed from.
  const realInitBoard = window.GameUI.initBoard;
  window.GameUI.updateBoardState = jest.fn();
  window.GameUI.renderDrawPrompt = jest.fn();
  window.GameUI.renderUndoPrompt = jest.fn();
  window.GameUI.initBoard = jest.fn();
  window.GameUI.renderSwap2 = jest.fn();
  window.eval(ROOM_SOCKET_SOURCE);

  return { client, systemMessages, st: window.RoomState, boardRenderer, realInitBoard };
}

describe('GameUI.sendMove — optimistic stone lifecycle', () => {
  test('a valid click draws the stone immediately, before any server response', () => {
    const { client, boardRenderer } = loadRoomModules();

    window.GameUI.sendMove(3, 4);

    // Drawn before the network call even resolves — no round trip involved.
    expect(boardRenderer.optimisticStone).toEqual({ x: 3, y: 4, color: 'BLACK' });
    expect(client.ackCalls).toHaveLength(1);
  });

  test('the stone uses the mover\'s own color, not a hardcoded one', () => {
    const { boardRenderer, st } = loadRoomModules();
    st.gameState.players = [
      { userId: 'me', color: 'WHITE' },
      { userId: 'them', color: 'BLACK' },
    ];

    window.GameUI.sendMove(7, 7);

    expect(boardRenderer.optimisticStone.color).toBe('WHITE');
  });

  test('an ack error clears the stone — nothing was ever written to gameState.board, so this IS the rollback', () => {
    const { client, boardRenderer, systemMessages, st } = loadRoomModules();
    const boardBefore = JSON.stringify(st.gameState.board);

    window.GameUI.sendMove(3, 4);
    client.respond(0, { error: 'Ô này đã có quân.', code: 'CELL_OCCUPIED' });

    expect(boardRenderer.optimisticStone).toBeNull();
    expect(JSON.stringify(st.gameState.board)).toBe(boardBefore);
    expect(systemMessages).toHaveLength(1);
  });

  test('a first ack timeout marks the stone as warning but keeps it in place — retry, not rollback', () => {
    const { client, boardRenderer } = loadRoomModules();

    window.GameUI.sendMove(3, 4);
    client.timeout(0);

    expect(boardRenderer.markOptimisticWarningCalls).toBe(1);
    expect(boardRenderer.optimisticStone).toEqual({ x: 3, y: 4, color: 'BLACK', warning: true });
    // setOptimisticStone(null) must NOT have been called — the overlay is
    // still standing in for a move that might yet succeed.
    expect(boardRenderer.setOptimisticStoneCalls).not.toContainEqual(null);
  });

  test('a second ack timeout still leaves the stone up — cleared later by the resync answer, not here', () => {
    const { client, boardRenderer } = loadRoomModules();

    window.GameUI.sendMove(3, 4);
    client.timeout(0);
    client.timeout(1);

    expect(boardRenderer.optimisticStone).not.toBeNull();
    expect(boardRenderer.setOptimisticStoneCalls).not.toContainEqual(null);
  });

  test('ack {ok} does NOT itself clear the stone — that is game:moved\'s job (see room-socket.js tests)', () => {
    const { client, boardRenderer } = loadRoomModules();

    window.GameUI.sendMove(3, 4);
    client.respond(0, { ok: true, moveCount: 6 });

    // Clearing here unconditionally would flash the cell empty in the one
    // case where this move's own game:moved got redirected into a resync by
    // the receive-side gap check instead of applying — see the long comment
    // in sendMove(). The overlay must survive an {ok} ack on its own.
    expect(boardRenderer.optimisticStone).toEqual({ x: 3, y: 4, color: 'BLACK' });
  });

  test('no boardRenderer yet (page still loading) does not throw', () => {
    const { client } = loadRoomModules({ withBoardRenderer: false });
    expect(() => window.GameUI.sendMove(3, 4)).not.toThrow();
    expect(client.ackCalls).toHaveLength(1);
  });
});

describe('onCellClick — Swap2 opening never gets an optimistic stone', () => {
  test('a click during Swap2 opening placement routes to swap2_place, not sendMove — no overlay', () => {
    const { client, boardRenderer, realInitBoard } = loadRoomModules();
    window.RoomState.roomData = { roomId: 'r1', settings: { boardSize: 15 } };
    Object.assign(window.RoomState.gameState, {
      boardSize: 15, walls: [], portals: [], firstMoveZones: [],
      swap2: { enabled: true, openingPhase: 'place3' },
    });
    window.RoomState.boardRenderer = null;

    let onCellClick;
    window.BoardRenderer = function (canvas, opts) { onCellClick = opts.onCellClick; return boardRenderer; };
    realInitBoard();

    onCellClick(4, 4);

    expect(client.plainEmits).toEqual([{ event: 'game:swap2_place', data: { x: 4, y: 4 } }]);
    expect(client.ackCalls).toHaveLength(0);          // sendMove/emitAck never called
    expect(boardRenderer.optimisticStone).toBeNull();  // no ghost stone for an unresolved color
  });
});

describe('onCellClick — one in-flight move at a time', () => {
  test('a second click while a move is in flight does not start a second optimistic stone or emit', () => {
    const { client, boardRenderer, realInitBoard } = loadRoomModules();
    window.RoomState.roomData = { roomId: 'r1', settings: { boardSize: 15 } };
    // initBoard()'s real (non-swap2) branch reads a fuller gameState shape
    // than the other tests' fixture needs — fill in what it touches.
    Object.assign(window.RoomState.gameState, {
      boardSize: 15, walls: [], portals: [], firstMoveZones: [],
    });
    // initBoard() only builds the onCellClick closure the FIRST time (when
    // st.boardRenderer is falsy) — undo the stub loadRoomModules() seeded so
    // the constructor path actually runs and hands the closure back to us.
    window.RoomState.boardRenderer = null;

    let onCellClick;
    window.BoardRenderer = function (canvas, opts) { onCellClick = opts.onCellClick; return boardRenderer; };
    realInitBoard();

    onCellClick(3, 4);
    expect(client.ackCalls).toHaveLength(1);
    expect(boardRenderer.optimisticStone).toEqual({ x: 3, y: 4, color: 'BLACK' });
    // TODO.md #155: the pair set by the first click only.
    expect(window.RoomState.predictedTurn).toMatchObject({ active: true, forColor: 'WHITE' });
    expect(window.audioManager.playMoveSound).toHaveBeenCalledTimes(1);

    onCellClick(7, 7); // second click, same in-flight window
    expect(client.ackCalls).toHaveLength(1);              // no second emit
    expect(boardRenderer.optimisticStone.x).toBe(3);       // original stone untouched
    // Case 13 (planning.md Q3): no second sound, no re-snapshotting the
    // already-active predictedTurn overlay.
    expect(window.audioManager.playMoveSound).toHaveBeenCalledTimes(1);

    // Once resolved, clicking again works normally.
    boardRenderer.setOptimisticStone(null);
    onCellClick(7, 7);
    expect(client.ackCalls).toHaveLength(2);
    expect(window.audioManager.playMoveSound).toHaveBeenCalledTimes(2);
  });
});

describe('game:moved — confirms or leaves the optimistic stone alone', () => {
  const moved = (x, y, moveCount, extra) => ({ x, y, color: 'WHITE', nextTurn: 'me', moveCount, ...extra });

  test('a game:moved for the SAME cell as the pending stone clears it', () => {
    const { boardRenderer, client } = loadRoomModules({ moveCount: 5 });
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK' });

    client.listeners['game:moved'](moved(1, 2, 6));

    expect(boardRenderer.optimisticStone).toBeNull();
  });

  test('a game:moved for a DIFFERENT cell (opponent\'s move) leaves the pending stone alone', () => {
    const { boardRenderer, client } = loadRoomModules({ moveCount: 5 });
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK' });

    client.listeners['game:moved'](moved(9, 9, 6));

    expect(boardRenderer.optimisticStone).toEqual({ x: 1, y: 2, color: 'BLACK' });
  });

  test('a gap-redirected game:moved (moveCount jumps) leaves the pending stone up — resync will clear it', () => {
    const { boardRenderer, client } = loadRoomModules({ moveCount: 5 });
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK' });

    client.listeners['game:moved'](moved(1, 2, 8)); // skips 6,7 → gap branch, returns before the clear

    expect(client.plainEmits).toEqual([{ event: 'game:resync', data: undefined }]);
    expect(boardRenderer.optimisticStone).toEqual({ x: 1, y: 2, color: 'BLACK' });
  });

  test('a replayed (already-applied) game:moved does not touch the pending stone either way', () => {
    const { boardRenderer, client } = loadRoomModules({ moveCount: 5 });
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK' });

    client.listeners['game:moved'](moved(9, 9, 5)); // <= current moveCount → early return

    expect(boardRenderer.optimisticStone).toEqual({ x: 1, y: 2, color: 'BLACK' });
  });

  test('no pending stone: game:moved does not throw touching optimisticStone', () => {
    const { boardRenderer, client } = loadRoomModules({ moveCount: 5 });
    expect(boardRenderer.optimisticStone).toBeNull();
    expect(() => client.listeners['game:moved'](moved(1, 2, 6))).not.toThrow();
  });

  // Own move played at moved(x,y,...): color 'WHITE' with 'me' as WHITE below.
  test('confirming our own pending move does NOT replay the sound already played at click (TODO.md #155)', () => {
    const { client, boardRenderer, st } = loadRoomModules({ moveCount: 5 });
    st.gameState.players = [{ userId: 'me', color: 'WHITE' }, { userId: 'them', color: 'BLACK' }];
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'WHITE' });
    window.audioManager.playMoveSound.mockClear();

    client.listeners['game:moved'](moved(1, 2, 6)); // matches the pending cell

    expect(window.audioManager.playMoveSound).not.toHaveBeenCalled();
    expect(st.predictedTurn.active).toBe(false);
  });

  test('an opponent move always plays its sound, unaffected by any pending state of ours', () => {
    const { client, boardRenderer } = loadRoomModules({ moveCount: 5 });
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK' }); // our own unrelated pending move
    window.audioManager.playMoveSound.mockClear();

    client.listeners['game:moved'](moved(9, 9, 6)); // opponent's cell, color WHITE, 'me' is BLACK

    expect(window.audioManager.playMoveSound).toHaveBeenCalledWith(true);
  });

  test('a spectator (no matching player entry) always hears the normal move sound', () => {
    const { client, st } = loadRoomModules({ moveCount: 5 });
    st.gameState.players = [{ userId: 'p1', color: 'BLACK' }, { userId: 'p2', color: 'WHITE' }];
    window.audioManager.playMoveSound.mockClear();

    client.listeners['game:moved'](moved(9, 9, 6));

    expect(window.audioManager.playMoveSound).toHaveBeenCalledWith(true);
  });

  test('confirming clears predictedTurn and the next render uses the server timer, not the predicted countdown', () => {
    const { client, boardRenderer, st } = loadRoomModules({ moveCount: 5 });
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK' });
    st.predictedTurn = { active: true, forColor: 'WHITE', snapshotTimerValues: { black: 60, white: 60 }, switchedAtLocalTs: Date.now() - 5000 };

    client.listeners['game:moved'](moved(1, 2, 6, { timer: { black: 58, white: 60 } }));

    expect(st.predictedTurn.active).toBe(false);
    // The server's number (58), not "60 minus 5s elapsed" (55) the predicted
    // countdown would have shown — snap, not compound (planning.md Q2 step 5).
    expect(st.timerValues).toEqual({ black: 58, white: 60 });
  });
});

describe('room:joined — always clears any pending optimistic stone', () => {
  const baseGameState = () => ({
    status: 'ongoing', moveCount: 9, currentTurn: 'me',
    board: Array.from({ length: 15 }, () => new Array(15).fill(0)),
    moveHistory: [], players: [
      { userId: 'me', color: 'BLACK' }, { userId: 'them', color: 'WHITE' },
    ],
  });

  test('a resync answer clears a stone left over from a doubly-timed-out move', () => {
    const { boardRenderer, client, st } = loadRoomModules();
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK', warning: true });
    st.predictedTurn = { active: true, forColor: 'WHITE', snapshotTimerValues: { black: 60, white: 60 }, switchedAtLocalTs: Date.now() };

    client.listeners['room:joined']({ roomId: 'r1', users: [], gameState: baseGameState() });

    expect(boardRenderer.optimisticStone).toBeNull();
    // TODO.md #155 case 6: predictedTurn never outlives optimisticStone —
    // a full resync rebuild must clear both together.
    expect(st.predictedTurn.active).toBe(false);
  });

  test('the very first room:joined (no boardRenderer yet) does not throw', () => {
    const { client } = loadRoomModules({ withBoardRenderer: false });
    expect(() => client.listeners['room:joined']({ roomId: 'r1', users: [], gameState: baseGameState() }))
      .not.toThrow();
  });
});

// ── TODO.md #155 — Full CSP: sound + predictedTurn overlay ──────────────────
// Case numbers below refer to the 13-case matrix in
// features/full-csp-zero-latency/planning.md Q3.

describe('GameUI.sendMove — Full CSP sound + predictedTurn (case 1)', () => {
  test('the move sound plays at click time, before any ack has resolved', () => {
    const { client } = loadRoomModules();

    window.GameUI.sendMove(3, 4);

    expect(window.audioManager.playMoveSound).toHaveBeenCalledTimes(1);
    expect(window.audioManager.playMoveSound).toHaveBeenCalledWith(false);
    expect(client.ackCalls).toHaveLength(1); // sound didn't wait on this
  });

  test('predictedTurn flips the turn-bar highlight and label to the opponent immediately', () => {
    const { st } = loadRoomModules();

    window.GameUI.sendMove(3, 4);

    expect(st.predictedTurn.active).toBe(true);
    expect(st.predictedTurn.forColor).toBe('WHITE'); // me = BLACK
    expect(document.getElementById('tb-white').classList.contains('turn-bar__active')).toBe(true);
    expect(document.getElementById('tb-black').classList.contains('turn-bar__active')).toBe(false);
    expect(document.getElementById('turn-label').textContent).toBe(window.t('game.opponent_turn'));
  });

  test('the mover\'s own clock freezes at its click-time value while predicted; the opponent\'s ticks down', () => {
    const { st } = loadRoomModules();
    st.timerValues = { black: 42, white: 55 };

    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      window.GameUI.sendMove(3, 4); // me = BLACK, opponent = WHITE
      now += 3000; // 3s of "real" elapsed time
      window.GameUI.renderTimers();

      expect(document.getElementById('tb-black-timer').textContent).toBe('42'); // frozen
      expect(document.getElementById('tb-white-timer').textContent).toBe('52'); // 55 - 3
    } finally {
      Date.now = realNow;
    }
  });
});

describe('GameUI.sendMove — ack error rolls predictedTurn back too (cases 2-4)', () => {
  test('an ack error reverts the turn-bar to the real (unchanged) turn, not the predicted one', () => {
    const { client, st } = loadRoomModules();

    window.GameUI.sendMove(3, 4);
    expect(st.predictedTurn.active).toBe(true);

    client.respond(0, { error: 'Ô này đã có quân.', code: 'CELL_OCCUPIED' });

    expect(st.predictedTurn.active).toBe(false);
    // gameState.currentTurn was never touched — still 'me' (BLACK) — so the
    // real updateBoardState() this rollback triggers renders BLACK active.
    expect(document.getElementById('tb-black').classList.contains('turn-bar__active')).toBe(true);
    expect(document.getElementById('tb-white').classList.contains('turn-bar__active')).toBe(false);
    expect(document.getElementById('turn-label').textContent).toBe(window.t('game.your_turn'));
  });
});

describe('GameUI.sendMove — retry keeps predictedTurn active, same lifecycle as optimisticStone (cases 5-6)', () => {
  test('a first ack timeout (retry) leaves predictedTurn active', () => {
    const { client, st } = loadRoomModules();

    window.GameUI.sendMove(3, 4);
    client.timeout(0);

    expect(st.predictedTurn.active).toBe(true);
  });

  test('a second ack timeout (→ resync) still leaves predictedTurn active — room:joined clears it, not this', () => {
    const { client, st } = loadRoomModules();

    window.GameUI.sendMove(3, 4);
    client.timeout(0);
    client.timeout(1);

    expect(st.predictedTurn.active).toBe(true);
  });
});

describe('game:ended racing a pending move clears both overlays (cases 7-8)', () => {
  test('our own win arriving while our move is still unacked clears optimisticStone + predictedTurn', () => {
    const { client, boardRenderer, st } = loadRoomModules();

    window.GameUI.sendMove(3, 4); // ack never resolves — still "in flight"
    expect(boardRenderer.optimisticStone).not.toBeNull();
    expect(st.predictedTurn.active).toBe(true);
    window.audioManager.playMoveSound.mockClear();

    client.listeners['game:ended']({ result: { winner: 'me' } });

    expect(boardRenderer.optimisticStone).toBeNull();
    expect(st.predictedTurn.active).toBe(false);
    expect(window.audioManager.playWinSound).toHaveBeenCalledTimes(1);
    expect(window.audioManager.playMoveSound).not.toHaveBeenCalled(); // no extra move sound from the race
  });

  test('an opponent-timeout loss arriving while our move is still unacked also clears our overlays', () => {
    const { client, boardRenderer, st } = loadRoomModules();

    window.GameUI.sendMove(3, 4);

    client.listeners['game:ended']({ result: { winner: 'them' } });

    expect(boardRenderer.optimisticStone).toBeNull();
    expect(st.predictedTurn.active).toBe(false);
    expect(window.audioManager.playLoseSound).toHaveBeenCalledTimes(1);
  });
});

describe('onCellClick — local pre-check blocks provably-illegal clicks before sendMove (cases 9-10)', () => {
  function wireOnCellClick(boardRenderer, realInitBoard) {
    let onCellClick;
    window.BoardRenderer = function (canvas, opts) { onCellClick = opts.onCellClick; return boardRenderer; };
    realInitBoard();
    return onCellClick;
  }

  test('a click on an already-occupied cell never predicts, never sends, never plays a sound', () => {
    const { client, boardRenderer, realInitBoard, st } = loadRoomModules();
    window.RoomState.roomData = { roomId: 'r1', settings: { boardSize: 15 } };
    Object.assign(st.gameState, { boardSize: 15, walls: [], portals: [], firstMoveZones: [] });
    window.RoomState.boardRenderer = null;
    st.gameState.board[4][3] = 1; // (x=3, y=4) already occupied

    const onCellClick = wireOnCellClick(boardRenderer, realInitBoard);
    onCellClick(3, 4);

    expect(client.ackCalls).toHaveLength(0);
    expect(boardRenderer.optimisticStone).toBeNull();
    expect(st.predictedTurn.active).toBe(false);
    expect(window.audioManager.playMoveSound).not.toHaveBeenCalled();
  });

  test('a click when it is not our turn never predicts, never sends', () => {
    const { client, boardRenderer, realInitBoard, st } = loadRoomModules();
    window.RoomState.roomData = { roomId: 'r1', settings: { boardSize: 15 } };
    Object.assign(st.gameState, { boardSize: 15, walls: [], portals: [], firstMoveZones: [] });
    window.RoomState.boardRenderer = null;
    st.gameState.currentTurn = 'them';

    const onCellClick = wireOnCellClick(boardRenderer, realInitBoard);
    onCellClick(3, 4);

    expect(client.ackCalls).toHaveLength(0);
    expect(boardRenderer.optimisticStone).toBeNull();
    expect(st.predictedTurn.active).toBe(false);
    expect(window.audioManager.playMoveSound).not.toHaveBeenCalled();
  });
});

// ── TODO.md #165 — transit-delay compensation on the local clock ────────────
//
// `timer:sync` carries the server's clock reading, but the packet then spends
// ~d ms in flight, so the client's countdown ends up d seconds behind the
// server ("displayed − true = +d", constant). Invisible at d≈20ms; a visible
// 1–3s over-count for the desktop+VPN reporter. The fix subtracts an estimate
// of d (half the last measured move round-trip) from the *displayed* value —
// never from activeDeadline/serverNow(), so the desync watchdog is untouched.
// The residual step of ~d that remains when the mover's own move lands (its
// upload leg, which the client can't see until the ack) is deliberately left
// to #167 (server-side lag refund); see docs/todo/B165-*.md "Ngoài phạm vi".

describe('#165 — timer:sync applies transit-delay compensation', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  function syncAt(now, over) {
    // A sync whose serverTime is `d` ms in the past — i.e. it spent d in
    // flight — with a self-consistent deadline for `whiteSecs` on white's
    // clock. Mirrors what a lossy link actually delivers.
    return Object.assign({
      black: 60, white: 30, activeColor: 'white', running: true,
      serverTime: now, deadline: now + 30000,
    }, over);
  }

  test('the active clock is shown d seconds lower; the idle clock is untouched', () => {
    const { client } = loadRoomModules();
    window.RoomState.halfRttMs = 3000;
    const now = 1_000_000;
    Date.now = () => now;

    client.listeners['timer:sync'](syncAt(now, { white: 13, deadline: now + 13000 }));

    expect(document.getElementById('tb-white-timer').textContent).toBe('10'); // 13 − 3
    expect(document.getElementById('tb-black-timer').textContent).toBe('1:00'); // idle, raw
  });

  test('the shave persists as the clock ticks down (not just the first paint)', () => {
    const { client } = loadRoomModules();
    window.RoomState.halfRttMs = 2000;
    let now = 5_000_000;
    Date.now = () => now;

    client.listeners['timer:sync'](syncAt(now, { white: 30, deadline: now + 30000 }));
    expect(document.getElementById('tb-white-timer').textContent).toBe('28'); // 30 − 2

    now += 5000;
    window.RoomSocket.refreshLocalTimer();
    expect(document.getElementById('tb-white-timer').textContent).toBe('23'); // 25 − 2
  });

  test('a paused sync (running:false) is never shaved — the frozen value is exact', () => {
    const { client } = loadRoomModules();
    window.RoomState.halfRttMs = 3000;
    const now = 2_000_000;
    Date.now = () => now;

    client.listeners['timer:sync'](syncAt(now, { white: 13, running: false, deadline: null }));

    expect(document.getElementById('tb-white-timer').textContent).toBe('13');
  });

  test('with no RTT sample yet (halfRttMs 0) the clock is unchanged from before the fix', () => {
    const { client } = loadRoomModules();
    const now = 3_000_000;
    Date.now = () => now;

    client.listeners['timer:sync'](syncAt(now, { white: 13, deadline: now + 13000 }));

    expect(document.getElementById('tb-white-timer').textContent).toBe('13');
  });
});

describe('#165 — predictedTurn snapshot is taken from the deadline, not a stale interval write', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  test('sendMove re-derives the clock before freezing it, ignoring a stale timerValues', () => {
    const { client, st } = loadRoomModules();
    st.gameState.players = [{ userId: 'me', color: 'WHITE' }, { userId: 'them', color: 'BLACK' }];
    st.gameState.currentTurn = 'me';
    st.halfRttMs = 3000;
    const now = 1_000_000;
    Date.now = () => now;

    client.listeners['timer:sync']({
      black: 60, white: 13, activeColor: 'white', running: true,
      serverTime: now, deadline: now + 13000,
    });

    // Simulate a background-throttled tab: the 1s interval left a stale, wrong
    // value in timerValues. The snapshot must NOT trust it.
    st.timerValues = { black: 60, white: 99 };

    window.GameUI.sendMove(3, 4);

    expect(st.predictedTurn.snapshotTimerValues.white).toBe(10); // 13 − 3, re-derived
  });

  test('compensation shrinks the clock jump seen when predictedTurn clears', () => {
    function run(halfRttMs) {
      const { client, st } = loadRoomModules();
      st.gameState.players = [{ userId: 'me', color: 'WHITE' }, { userId: 'them', color: 'BLACK' }];
      st.gameState.currentTurn = 'me';
      st.halfRttMs = halfRttMs;

      let now = 1_000_000;
      const realNow = Date.now;
      Date.now = () => now;
      try {
        // Pre-move sync: sent 3s ago (d = 3s in flight), white has 13s left.
        client.listeners['timer:sync']({
          black: 60, white: 13, activeColor: 'white', running: true,
          serverTime: now - 3000, deadline: now - 3000 + 13000,
        });
        window.GameUI.sendMove(3, 4);
        const shown = Number(document.getElementById('tb-white-timer').textContent);

        // Move reaches the server, turn switches, post-move sync comes back —
        // by now the server has charged white for the pre-move transit + the
        // move's upload leg (~6s total).
        now += 6000;
        client.listeners['game:moved']({
          x: 3, y: 4, color: 'WHITE', nextTurn: 'them', moveCount: 6,
          timer: { black: 60, white: 7 },
          timerSync: {
            black: 60, white: 7, activeColor: 'black', running: true,
            serverTime: now - 3000, deadline: now - 3000 + 60000,
          },
        });
        // updateBoardState() (stubbed here) is what repaints the clocks after
        // game:moved in production; call the real renderer directly.
        window.GameUI.renderTimers();
        const after = Number(document.getElementById('tb-white-timer').textContent);
        return Math.abs(shown - after);
      } finally { Date.now = realNow; }
    }

    const jumpUncompensated = run(0);
    const jumpCompensated = run(3000);
    expect(jumpCompensated).toBeLessThan(jumpUncompensated);
    // Uncompensated: 13 → 7 (≈2d). Compensated: 10 → 7 (≈d, the residual
    // move-upload leg #167 owns).
    expect(jumpUncompensated).toBe(6);
    expect(jumpCompensated).toBe(3);
  });
});

describe('#165 — RTT is measured from game:move acks', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  test('a resolved ack folds half its round-trip into halfRttMs (EMA)', () => {
    const { client, st } = loadRoomModules();
    let now = 1000;
    Date.now = () => now;

    window.GameUI.sendMove(3, 4);
    now = 5000;                       // 4s round trip
    client.respond(0, { ok: true, moveCount: 6 });
    expect(st.halfRttMs).toBe(2000);  // first sample: 4000 / 2

    window.GameUI.sendMove(5, 5);
    now = 13000;                      // 8s round trip
    client.respond(1, { ok: true, moveCount: 7 });
    expect(st.halfRttMs).toBe(3000);  // EMA: 2000·0.5 + 4000·0.5
  });

  test('a rejected move still measures — it is a full round trip', () => {
    const { client, st } = loadRoomModules();
    let now = 1000;
    Date.now = () => now;

    window.GameUI.sendMove(3, 4);
    now = 3000;
    client.respond(0, { error: 'Ô này đã có quân.', code: 'CELL_OCCUPIED' });

    expect(st.halfRttMs).toBe(1000);
  });

  test('an ack timeout is NOT a measurement (the clock read is the timeout, not the network)', () => {
    const { client, st } = loadRoomModules();
    let now = 1000;
    Date.now = () => now;

    window.GameUI.sendMove(3, 4);
    now = 20000;
    client.timeout(0);               // → retry, no measurement

    expect(st.halfRttMs).toBe(0);
  });

  test('an absurd sample (>30s) is discarded, not folded in', () => {
    const { client, st } = loadRoomModules();
    let now = 1000;
    Date.now = () => now;

    window.GameUI.sendMove(3, 4);
    now = 40000;
    client.respond(0, { ok: true, moveCount: 6 });

    expect(st.halfRttMs).toBe(0);
  });
});

describe('#165 — returning to the foreground pulls a fresh clock sync', () => {
  test('window focus during an ongoing game requests a resync', () => {
    const { client } = loadRoomModules();
    window.dispatchEvent(new Event('focus'));
    expect(client.plainEmits.filter(e => e.event === 'game:resync')).toHaveLength(1);
  });

  test('focus after the game has ended does not', () => {
    const { client } = loadRoomModules({ gameStatus: 'finished' });
    window.dispatchEvent(new Event('focus'));
    expect(client.plainEmits.filter(e => e.event === 'game:resync')).toHaveLength(0);
  });

  test('focus + visibilitychange firing together (tab return) resync only once', () => {
    const { client } = loadRoomModules();
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(client.plainEmits.filter(e => e.event === 'game:resync')).toHaveLength(1);
  });
});

// ── TODO.md #169 — the displayed clock must not stutter or bounce ───────────
//
// On a high-jitter link (measured: 200ms jitter on the China 3G /diag sample,
// vs 2-16ms on every VN sample) two display-only effects made the clock look
// broken:
//   1. displayShaveSec's Math.round flipped 0↔1 as the half-RTT EMA crossed
//      500ms, so the active clock "started" each turn a second high or low.
//   2. applyTimerSync wrote st.timerValues straight, so a fresh sync could
//      snap the visible number back UP mid-turn.
// The server clock is untouched — this is purely what the player sees.
describe('#169 — clock does not stutter or bounce on a high-jitter link', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  function syncAt(now, over) {
    return Object.assign({
      black: 60, white: 30, activeColor: 'white', running: true,
      serverTime: now, deadline: now + 30000,
    }, over);
  }

  test('a half-RTT EMA parked on the 500ms boundary gives a smooth 1-per-sync countdown', () => {
    const { client } = loadRoomModules();
    let now = 1_000_000;
    Date.now = () => now;

    const shown = [];
    let whiteSecs = 30;
    // Each sync: the EMA wobbles either side of 500ms, white legitimately has
    // one second less. Pre-#169 the shave alternated 0/1 and the displayed
    // value went 30, 28, 28, 26… — a visible 2-then-0 stutter every move.
    for (const halfRtt of [460, 540, 480, 520, 500, 470, 530]) {
      window.RoomState.halfRttMs = halfRtt;
      client.listeners['timer:sync'](syncAt(now, { white: whiteSecs, deadline: now + whiteSecs * 1000 }));
      shown.push(Number(document.getElementById('tb-white-timer').textContent));
      now += 1000;
      whiteSecs -= 1;
    }
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i - 1] - shown[i]).toBe(1);
    }
  });

  test('a delayed sync carrying a stale-high reading never bounces the visible clock up', () => {
    const { client } = loadRoomModules();
    let now = 2_000_000;
    Date.now = () => now;
    window.RoomState.halfRttMs = 0;

    client.listeners['timer:sync'](syncAt(now, { white: 18, deadline: now + 18000 }));
    expect(document.getElementById('tb-white-timer').textContent).toBe('18');

    // 3s pass; a reordered sync from 2s ago arrives — same turn, same deadline,
    // reporting white: 17 (higher than the ~15 the local countdown now shows).
    now += 3000;
    window.RoomSocket.refreshLocalTimer();
    const midTick = Number(document.getElementById('tb-white-timer').textContent);
    client.listeners['timer:sync'](syncAt(now - 2000, { white: 17, deadline: (now - 2000) + 17000 }));
    expect(Number(document.getElementById('tb-white-timer').textContent)).toBeLessThanOrEqual(midTick);
  });

  test('a turn change resets the clamp — the opponent gets their full fresh clock', () => {
    const { client } = loadRoomModules();
    let now = 3_000_000;
    Date.now = () => now;
    window.RoomState.halfRttMs = 200;

    client.listeners['timer:sync'](syncAt(now, { white: 5, activeColor: 'white', deadline: now + 5000 }));
    expect(document.getElementById('tb-white-timer').textContent).toBe('5');

    now += 1000;
    client.listeners['timer:sync'](syncAt(now, { black: 60, white: 5, activeColor: 'black', deadline: now + 60000 }));
    expect(document.getElementById('tb-black-timer').textContent).toBe('1:00');
  });

  test('bonus time (the deadline is pushed out) resets the clamp so the grant shows immediately', () => {
    const { client } = loadRoomModules();
    let now = 4_000_000;
    Date.now = () => now;
    window.RoomState.halfRttMs = 0;

    client.listeners['timer:sync'](syncAt(now, { white: 10, activeColor: 'white', deadline: now + 10000 }));
    now += 2000;
    window.RoomSocket.refreshLocalTimer();
    expect(Number(document.getElementById('tb-white-timer').textContent)).toBeLessThanOrEqual(10);

    // Admin adds 30s: same turn, same colour, deadline jumps 30s further out.
    client.listeners['timer:sync'](syncAt(now, { white: 38, activeColor: 'white', deadline: now + 38000 }));
    expect(document.getElementById('tb-white-timer').textContent).toBe('38');
  });

  test('the shave flipping 1→0 mid-turn does not jump the clock up (only down is allowed)', () => {
    const { client } = loadRoomModules();
    let now = 5_000_000;
    Date.now = () => now;

    // First sync: half-RTT 900 → shave 1, white 20 shown as 19.
    window.RoomState.halfRttMs = 900;
    client.listeners['timer:sync'](syncAt(now, { white: 20, deadline: now + 20000 }));
    expect(document.getElementById('tb-white-timer').textContent).toBe('19');

    // Same turn, 1s later, EMA drops to 300 → without hysteresis shave would be
    // 0 and the opening value would be 19 again (bounce from 18-ish back up).
    now += 1000;
    window.RoomState.halfRttMs = 300;
    window.RoomSocket.refreshLocalTimer();
    const beforeSync = Number(document.getElementById('tb-white-timer').textContent);
    client.listeners['timer:sync'](syncAt(now, { white: 19, deadline: now + 19000 }));
    expect(Number(document.getElementById('tb-white-timer').textContent)).toBeLessThanOrEqual(beforeSync);
  });
});
