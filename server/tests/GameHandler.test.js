'use strict';

/**
 * GameHandler.test.js — Unit tests for the game:time_accept/game:time_decline
 * player-membership guard (TODO.md Phần B #34).
 *
 * Strategy: mock RoomManager and the shared state module, matching the
 * lightweight mock-io/mock-socket approach used in DisconnectHandler.test.js.
 * A fake socket captures registered `socket.on(event, handler)` callbacks so
 * individual events can be invoked directly.
 */

const mockRoomManager = {
  getRoomByUser: jest.fn(),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Not exercised by these tests (only used by handleGameEnd) — mocked to avoid
// opening a real SQLite handle that keeps the process alive after tests finish.
jest.mock('../db/database', () => ({
  saveGame: jest.fn(),
}));

const mockState = {
  timerMap: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(),
  cleanupRoomTimer: jest.fn(),
  cleanupReadyTimer: jest.fn(),
};
jest.mock('../socket/state', () => mockState);

const GameHandler = require('../socket/handlers/GameHandler');

function makeIo() {
  const io = {
    _toEmitted: {},
    to: jest.fn(function (room) {
      return {
        emit: jest.fn((event, data) => {
          if (!io._toEmitted[room]) io._toEmitted[room] = [];
          io._toEmitted[room].push({ event, data });
        }),
      };
    }),
  };
  return io;
}

function makeSocket(userId, displayName) {
  const handlers = {};
  return {
    user: { userId, displayName },
    handlers,
    _emitted: [],
    on: jest.fn((event, cb) => { handlers[event] = cb; }),
    emit: jest.fn(function (event, data) { this._emitted.push({ event, data }); }),
  };
}

function fire(socket, event, payload) {
  return socket.handlers[event](payload);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.timerMap.clear();
});

describe('GameHandler — game:time_accept player-membership guard', () => {
  test('spectator (not in engine.players) cannot accept a pending time request', () => {
    const io = makeIo();
    const socket = makeSocket('spectator-1', 'Ghost');
    GameHandler.register(io, socket);

    const room = {
      roomId: 'room1',
      gameState: {
        status: 'ongoing',
        players: [
          { userId: 'p1', color: 'BLACK' },
          { userId: 'p2', color: 'WHITE' },
        ],
      },
      _timeRequestPending: { from: 'p1', fromName: 'P1', bonus: 30 },
    };
    mockRoomManager.getRoomByUser.mockReturnValue(room);

    fire(socket, 'game:time_accept');

    expect(socket.emit).toHaveBeenCalledWith('game:error', { message: 'Bạn không phải người chơi.', code: 'NOT_A_PLAYER' });
    // Request must survive — a spectator's call must not consume/clear it.
    expect(room._timeRequestPending).toMatchObject({ from: 'p1' });
    expect(mockState.timerMap.size).toBe(0);
  });

  test('a real opponent player can still accept a pending time request', () => {
    const io = makeIo();
    const socket = makeSocket('p2', 'P2');
    GameHandler.register(io, socket);

    const room = {
      roomId: 'room1',
      gameState: {
        status: 'ongoing',
        players: [
          { userId: 'p1', color: 'BLACK' },
          { userId: 'p2', color: 'WHITE' },
        ],
      },
      _timeRequestPending: { from: 'p1', fromName: 'P1', bonus: 30 },
    };
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    mockState.timerMap.set('room1', { addTime: jest.fn(), getSync: jest.fn(() => ({})) });

    fire(socket, 'game:time_accept');

    expect(socket.emit).not.toHaveBeenCalledWith('game:error', { message: 'Bạn không phải người chơi.' });
    expect(room._timeRequestPending).toBeNull();
  });
});

describe('GameHandler — game:undo_accept in Swap2 opening (TODO.md #156)', () => {
  test('accepting an opening-mode undo emits game:swap2_state with undoCancelled so the client clears its popup', () => {
    const io = makeIo();
    const socket = makeSocket('p2', 'P2');
    GameHandler.register(io, socket);

    const engine = {
      undoOffer: { from: 'p1', mode: 'opening' },
      colorsAssigned: false,
      firstPlayerId: 'p1',
      secondPlayerId: 'p2',
      currentTurn: 'p1',
      openingPhase: 'place3',
      board: [[0]],
      moveCount: 2,
      moveHistory: [],
      players: [
        { userId: 'p1', displayName: 'P1', color: null },
        { userId: 'p2', displayName: 'P2', color: null },
      ],
      serialize: jest.fn(() => ({ swap2: { openingPhase: 'place3' } })),
      acceptUndo: jest.fn(() => ({ accepted: true, mode: 'opening', currentTurn: 'p1', nextColor: 'BLACK' })),
    };
    const room = { roomId: 'room1', gameState: engine };
    mockRoomManager.getRoomByUser.mockReturnValue(room);

    fire(socket, 'game:undo_accept');

    expect(engine.acceptUndo).toHaveBeenCalledWith('p2');
    const swap2Emit = io._toEmitted.room1.find((e) => e.event === 'game:swap2_state');
    expect(swap2Emit).toBeDefined();
    // This is the field the client's game:swap2_state handler (room-socket.js)
    // checks to clear `undoOfferPending` — without it the accept-undo popup
    // in the Swap2 opening phase never disappears, though the rollback
    // itself (board/turn/color) still applies correctly.
    expect(swap2Emit.data.undoCancelled).toBe(true);
  });

  test('accepting a play-mode undo still emits game:undo_applied (unaffected by the opening-mode fix)', () => {
    const io = makeIo();
    const socket = makeSocket('p2', 'P2');
    GameHandler.register(io, socket);

    const engine = {
      undoOffer: { from: 'p1', mode: 'play', targetIndex: 3 },
      players: [
        { userId: 'p1', displayName: 'P1', color: 'BLACK' },
        { userId: 'p2', displayName: 'P2', color: 'WHITE' },
      ],
      acceptUndo: jest.fn(() => ({
        accepted: true, mode: 'play', cleared: [{ x: 1, y: 1 }], currentTurn: 'p1', moveCount: 3,
      })),
    };
    const room = { roomId: 'room1', gameState: engine };
    mockRoomManager.getRoomByUser.mockReturnValue(room);

    fire(socket, 'game:undo_accept');

    const applied = io._toEmitted.room1.find((e) => e.event === 'game:undo_applied');
    expect(applied).toBeDefined();
    expect(applied.data).toMatchObject({ currentTurn: 'p1', moveCount: 3 });
    expect(io._toEmitted.room1.some((e) => e.event === 'game:swap2_state')).toBe(false);
  });
});

describe('GameHandler — game:time_decline player-membership guard', () => {
  test('spectator (not in engine.players) cannot decline a pending time request', () => {
    const io = makeIo();
    const socket = makeSocket('spectator-1', 'Ghost');
    GameHandler.register(io, socket);

    const room = {
      roomId: 'room1',
      gameState: {
        status: 'ongoing',
        players: [
          { userId: 'p1', color: 'BLACK' },
          { userId: 'p2', color: 'WHITE' },
        ],
      },
      _timeRequestPending: { from: 'p1', fromName: 'P1', bonus: 30 },
    };
    mockRoomManager.getRoomByUser.mockReturnValue(room);

    fire(socket, 'game:time_decline');

    expect(socket.emit).toHaveBeenCalledWith('game:error', { message: 'Bạn không phải người chơi.', code: 'NOT_A_PLAYER' });
    expect(room._timeRequestPending).toMatchObject({ from: 'p1' });
  });

  test('a real opponent player can still decline a pending time request', () => {
    const io = makeIo();
    const socket = makeSocket('p2', 'P2');
    GameHandler.register(io, socket);

    const room = {
      roomId: 'room1',
      gameState: {
        status: 'ongoing',
        players: [
          { userId: 'p1', color: 'BLACK' },
          { userId: 'p2', color: 'WHITE' },
        ],
      },
      _timeRequestPending: { from: 'p1', fromName: 'P1', bonus: 30 },
    };
    mockRoomManager.getRoomByUser.mockReturnValue(room);

    fire(socket, 'game:time_decline');

    expect(socket.emit).not.toHaveBeenCalledWith('game:error', { message: 'Bạn không phải người chơi.' });
    expect(room._timeRequestPending).toBeNull();
  });
});
