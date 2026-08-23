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
  document.body.innerHTML = '<div id="board-area"></div><div id="chat-messages"></div>';

  const client = makeClientStub();
  window.RoomClient = client;

  const systemMessages = [];
  window.ChatUI = {
    appendSystemMessage: (text) => systemMessages.push(text),
    appendChatMessage: jest.fn(),
    showFloatMessage: jest.fn(),
  };

  window.RoomUI = { updateUI: jest.fn() };

  const boardRenderer = withBoardRenderer ? makeBoardRendererStub() : null;

  window.RoomState = {
    myUser: { userId: 'me' },
    roomData: { roomId: 'r1' },
    boardRenderer,
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

    onCellClick(7, 7); // second click, same in-flight window
    expect(client.ackCalls).toHaveLength(1);              // no second emit
    expect(boardRenderer.optimisticStone.x).toBe(3);       // original stone untouched

    // Once resolved, clicking again works normally.
    boardRenderer.setOptimisticStone(null);
    onCellClick(7, 7);
    expect(client.ackCalls).toHaveLength(2);
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
    const { boardRenderer, client } = loadRoomModules();
    boardRenderer.setOptimisticStone({ x: 1, y: 2, color: 'BLACK', warning: true });

    client.listeners['room:joined']({ roomId: 'r1', users: [], gameState: baseGameState() });

    expect(boardRenderer.optimisticStone).toBeNull();
  });

  test('the very first room:joined (no boardRenderer yet) does not throw', () => {
    const { client } = loadRoomModules({ withBoardRenderer: false });
    expect(() => client.listeners['room:joined']({ roomId: 'r1', users: [], gameState: baseGameState() }))
      .not.toThrow();
  });
});
