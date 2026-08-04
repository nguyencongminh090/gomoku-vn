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
