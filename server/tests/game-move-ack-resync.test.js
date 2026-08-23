'use strict';

/**
 * game-move-ack-resync.test.js — TODO.md #152.
 *
 * `game:move` used to be a bare fire-and-forget emit. If either that packet
 * or the `game:moved` broadcast answering it was dropped while the socket
 * itself stayed connected — the selective-loss pattern reported by players on
 * lossy networks — nothing on either side noticed: no ack, no timeout, no
 * retry. The board froze until the player reloaded.
 *
 * These tests cover the server half of the fix:
 *   - ack on success and on rejection, with the ack-less (old client) path
 *     still working
 *   - `moveId` idempotency, including the case that ruled out matching on
 *     move *content* instead: an opponent move landing between the original
 *     and its retry
 *   - `game:resync` as the client-pull escape hatch
 */

const mockRoomManager = {
  getRoomByUser: jest.fn(),
  serializeRoom: jest.fn((room) => ({ roomId: room.roomId, users: [] })),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({ saveGame: jest.fn() }));

const mockState = {
  timerMap: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(),
  cleanupRoomTimer: jest.fn(),
  cleanupReadyTimer: jest.fn(),
  buildRoomStatePayload: jest.fn((room) => ({ roomId: room.roomId, gameState: { fake: true } })),
};
jest.mock('../socket/state', () => mockState);

const GameHandler = require('../socket/handlers/GameHandler');

function makeIo() {
  const io = {
    _toEmitted: {},
    to: jest.fn(function (roomId) {
      return {
        emit: jest.fn((event, data) => {
          if (!io._toEmitted[roomId]) io._toEmitted[roomId] = [];
          io._toEmitted[roomId].push({ event, data });
        }),
      };
    }),
  };
  io.broadcastsOf = (roomId, event) =>
    (io._toEmitted[roomId] || []).filter(e => e.event === event).map(e => e.data);
  return io;
}

function makeSocket(userId, displayName = userId) {
  const handlers = {};
  return {
    user: { userId, displayName },
    handlers,
    _emitted: [],
    on: jest.fn((event, cb) => { handlers[event] = cb; }),
    emit: jest.fn(function (event, data) { this._emitted.push({ event, data }); }),
    emittedOf(event) { return this._emitted.filter(e => e.event === event).map(e => e.data); },
  };
}

/**
 * A stand-in GameEngine: enough real behaviour for the handler's branches
 * (turn order, occupied cells, moveCount) without dragging in the full engine.
 */
function makeEngine(players) {
  return {
    moveCount: 0,
    result: null,
    undoOffer: null,
    _board: new Map(),
    players,
    currentTurn: players[0].userId,
    makeMove(userId, x, y) {
      if (userId !== this.currentTurn) return { error: 'Chưa tới lượt.', code: 'NOT_YOUR_TURN' };
      const key = `${x},${y}`;
      if (this._board.has(key)) return { error: 'Ô đã có quân.', code: 'CELL_OCCUPIED' };
      const me = players.find(p => p.userId === userId);
      this._board.set(key, me.color);
      this.moveCount++;
      const next = players.find(p => p.userId !== userId).userId;
      this.currentTurn = next;
      return { color: me.color, nextTurn: next, won: false, draw: false };
    },
  };
}

function makeRoom() {
  const players = [
    { userId: 'p1', displayName: 'One', color: 'BLACK' },
    { userId: 'p2', displayName: 'Two', color: 'WHITE' },
  ];
  return {
    roomId: 'room1',
    state: 'playing',
    users: new Map(players.map(p => [p.userId, { ...p, ready: true }])),
    scoreTable: {},
    gameState: makeEngine(players),
  };
}

/** Register the handler for one user and return `{ socket, fire }`. */
function connect(io, userId) {
  const socket = makeSocket(userId);
  GameHandler.register(io, socket);
  return socket;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.timerMap.clear();
});

describe('game:move — ack contract', () => {
  test('valid move acks { ok, moveCount } and still broadcasts game:moved', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    const ack = jest.fn();
    socket.handlers['game:move']({ x: 7, y: 7, moveId: 'mv-1' }, ack);

    expect(ack).toHaveBeenCalledWith({ ok: true, moveCount: 1 });
    const moved = io.broadcastsOf('room1', 'game:moved');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ x: 7, y: 7, color: 'BLACK', moveCount: 1 });
  });

  test('broadcast goes out before the ack, so a lost ack still leaves one path home', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    const order = [];
    io.to = jest.fn(() => ({ emit: jest.fn(() => order.push('broadcast')) }));
    socket.handlers['game:move']({ x: 1, y: 1, moveId: 'mv-1' }, () => order.push('ack'));

    expect(order).toEqual(['broadcast', 'ack']);
  });

  test.each([
    ['no active game', null, 'NO_ACTIVE_GAME', { x: 1, y: 1 }],
    ['non-numeric coords', 'room', 'INVALID_COORDS', { x: 'abc', y: 1 }],
    ['not this player\'s turn', 'room', 'NOT_YOUR_TURN', { x: 1, y: 1 }],
  ])('rejected move (%s) acks { error, code } and emits no game:moved', (_label, roomKind, code, coords) => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(roomKind === null ? null : room);
    // NOT_YOUR_TURN: p2 moves while it is p1's turn.
    const socket = connect(io, code === 'NOT_YOUR_TURN' ? 'p2' : 'p1');

    const ack = jest.fn();
    socket.handlers['game:move']({ ...coords, moveId: 'mv-x' }, ack);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack.mock.calls[0][0]).toMatchObject({ code });
    expect(ack.mock.calls[0][0].ok).toBeUndefined();
    expect(io.broadcastsOf('room1', 'game:moved')).toHaveLength(0);
  });

  test('rejection with an ack does NOT also emit game:error (no duplicate notice)', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p2');

    socket.handlers['game:move']({ x: 1, y: 1, moveId: 'mv-x' }, jest.fn());

    expect(socket.emittedOf('game:error')).toHaveLength(0);
  });
});

describe('game:move — old clients that pass no ack', () => {
  test('valid move does not throw and still broadcasts', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    expect(() => socket.handlers['game:move']({ x: 3, y: 3 })).not.toThrow();
    expect(io.broadcastsOf('room1', 'game:moved')).toHaveLength(1);
  });

  test('rejected move falls back to the game:error event', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p2');

    socket.handlers['game:move']({ x: 1, y: 1 });

    expect(socket.emittedOf('game:error')[0]).toMatchObject({ code: 'NOT_YOUR_TURN' });
  });
});

describe('game:move — moveId idempotency', () => {
  test('resending the same moveId replays the stored payload instead of erroring', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    const ack1 = jest.fn();
    socket.handlers['game:move']({ x: 5, y: 5, moveId: 'mv-1' }, ack1);
    const ack2 = jest.fn();
    socket.handlers['game:move']({ x: 5, y: 5, moveId: 'mv-1' }, ack2);

    expect(ack2).toHaveBeenCalledWith({ ok: true, moveCount: 1, duplicate: true });
    // moveCount must not advance a second time, and the turn must not flip back.
    expect(room.gameState.moveCount).toBe(1);
    expect(room.gameState.currentTurn).toBe('p2');
    // The replay goes to the retrying socket only — re-broadcasting a stale
    // moveCount would read as a desync to the opponent.
    expect(socket.emittedOf('game:moved')).toHaveLength(1);
    expect(io.broadcastsOf('room1', 'game:moved')).toHaveLength(1);
  });

  test('dedupe survives an opponent move landing between the original and the retry', () => {
    // This is the scenario that ruled out matching on move content: by the
    // time the retry arrives, the original is no longer the last move in
    // history, so any "is this the latest move?" test stops matching.
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const p1 = connect(io, 'p1');
    const p2 = connect(io, 'p2');

    p1.handlers['game:move']({ x: 5, y: 5, moveId: 'mv-A' }, jest.fn());
    p2.handlers['game:move']({ x: 6, y: 6, moveId: 'mv-B' }, jest.fn());

    const retry = jest.fn();
    p1.handlers['game:move']({ x: 5, y: 5, moveId: 'mv-A' }, retry);

    expect(retry).toHaveBeenCalledWith({ ok: true, moveCount: 1, duplicate: true });
    expect(room.gameState.moveCount).toBe(2);
  });

  test('a genuinely new move onto an occupied cell is still CELL_OCCUPIED', () => {
    // Dedupe keys on the action's identity, not its coordinates — a fresh
    // moveId means a fresh intent, and it must be judged on the rules.
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const p1 = connect(io, 'p1');
    const p2 = connect(io, 'p2');

    p1.handlers['game:move']({ x: 5, y: 5, moveId: 'mv-A' }, jest.fn());

    const ack = jest.fn();
    p2.handlers['game:move']({ x: 5, y: 5, moveId: 'mv-DIFFERENT' }, ack);

    expect(ack.mock.calls[0][0]).toMatchObject({ code: 'CELL_OCCUPIED' });
  });

  test('a move sent without a moveId is never recorded for dedupe', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    socket.handlers['game:move']({ x: 2, y: 2 }, jest.fn());

    expect(room._moveAcks).toBeFalsy();
  });

  test('handleGameEnd clears the moveId set so a new game cannot inherit it', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    socket.handlers['game:move']({ x: 4, y: 4, moveId: 'mv-1' }, jest.fn());
    expect(room._moveAcks.has('mv-1')).toBe(true);

    GameHandler.handleGameEnd(io, room);

    expect(room._moveAcks).toBeNull();
  });
});

describe('game:resync', () => {
  test('sends the current room state to the requesting socket only', () => {
    const io = makeIo();
    const room = makeRoom();
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    socket.handlers['game:resync']();

    expect(mockState.buildRoomStatePayload).toHaveBeenCalledWith(room);
    // Reuses room:joined so the client has one state-rebuild path, not two.
    expect(socket.emittedOf('room:joined')).toHaveLength(1);
    expect(io.to).not.toHaveBeenCalled();
  });

  test('is a silent no-op when the user is not in a room', () => {
    const io = makeIo();
    mockRoomManager.getRoomByUser.mockReturnValue(null);
    const socket = connect(io, 'p1');

    expect(() => socket.handlers['game:resync']()).not.toThrow();
    expect(socket._emitted).toHaveLength(0);
  });

  test('works in a room with no game running (payload just has no gameState)', () => {
    const io = makeIo();
    const room = makeRoom();
    room.gameState = null;
    room.state = 'idle';
    mockState.buildRoomStatePayload.mockReturnValueOnce({ roomId: 'room1' });
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const socket = connect(io, 'p1');

    expect(() => socket.handlers['game:resync']()).not.toThrow();
    expect(socket.emittedOf('room:joined')[0]).toEqual({ roomId: 'room1' });
  });
});
