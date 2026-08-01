'use strict';

/**
 * DisconnectHandler.test.js — Unit tests for the reconnect-grace-period race guard.
 *
 * Focus (from audit finding #9): the "stale socket" race-condition guard in
 * handleDisconnect(), and the grace-period lifecycle in
 * startDisconnectGrace()/cancelDisconnectGrace() — the highest-risk untested
 * path in the real-time reconnect flow.
 *
 * Strategy: mock RoomManager, GameHandler, and the shared state module,
 * matching the lightweight mock-io/mock-socket approach used in
 * LobbyHandler.test.js. Uses Jest fake timers to control the 60s grace window.
 */

const mockRoomManager = {
  getRoomIdByUser: jest.fn(),
  getRoom: jest.fn(),
  leaveRoom: jest.fn(),
  serializeRoom: jest.fn((room) => ({ roomId: room.roomId })),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockHandleGameEnd = jest.fn();
jest.mock('../socket/handlers/GameHandler', () => ({
  handleGameEnd: (...args) => mockHandleGameEnd(...args),
}));

const mockState = {
  timerMap: new Map(),
  disconnectTimers: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  cleanupRoomTimer: jest.fn(),
  findSocketsByUserId: jest.fn(() => []),
  syncReadyWindow: jest.fn(),
};
jest.mock('../socket/state', () => mockState);

const DisconnectHandler = require('../socket/handlers/DisconnectHandler');

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

function makeSocket(userId = 'u1', displayName = 'Alice') {
  return {
    user: { userId, displayName },
    _emitted: [],
    join: jest.fn(),
    emit: jest.fn(function (event, data) { this._emitted.push({ event, data }); }),
  };
}

function toEmitted(io, room, event) {
  return (io._toEmitted[room] || []).find(e => e.event === event);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.timerMap.clear();
  mockState.disconnectTimers.clear();
  mockState.findSocketsByUserId.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// Stale-socket race guard
// ---------------------------------------------------------------------------
describe('DisconnectHandler — stale socket race guard', () => {
  test('skips leave/grace when user still has another active socket', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    mockRoomManager.getRoomIdByUser.mockReturnValue('room1');
    mockRoomManager.getRoom.mockReturnValue({ roomId: 'room1', gameState: null });
    // Simulate a duplicate tab: another live socket for this user still connected
    mockState.findSocketsByUserId.mockReturnValue([{ id: 'other-socket' }]);

    DisconnectHandler.handleDisconnect(io, socket);

    expect(mockRoomManager.leaveRoom).not.toHaveBeenCalled();
    expect(mockState.disconnectTimers.size).toBe(0);
  });

  test('proceeds with normal leave when no other active socket exists and not in a live game', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    mockRoomManager.getRoomIdByUser.mockReturnValue('room1');
    mockRoomManager.getRoom.mockReturnValue({ roomId: 'room1', gameState: null });
    mockRoomManager.leaveRoom.mockReturnValue({ room: { roomId: 'room1', users: new Map() } });

    DisconnectHandler.handleDisconnect(io, socket);

    expect(mockRoomManager.leaveRoom).toHaveBeenCalledWith('u1');
    expect(toEmitted(io, 'room1', 'room:updated')).toBeDefined();
  });

  test('does nothing when user is not in any room', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    mockRoomManager.getRoomIdByUser.mockReturnValue(null);

    DisconnectHandler.handleDisconnect(io, socket);

    expect(mockRoomManager.leaveRoom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Grace period lifecycle
// ---------------------------------------------------------------------------
describe('DisconnectHandler — grace period lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function activeGameRoom() {
    return {
      roomId: 'room1',
      state: 'interrupted',
      users: new Map([
        ['u1', { userId: 'u1', displayName: 'Alice' }],
        ['u2', { userId: 'u2', displayName: 'Bob' }],
      ]),
      gameState: {
        status: 'ongoing',
        players: [{ userId: 'u1', color: 'black' }, { userId: 'u2', color: 'white' }],
        serialize: jest.fn(() => ({ boardSize: 15 })),
      },
      scoreTable: {},
    };
  }

  test('starts a grace period instead of an immediate leave when the disconnecting user is an active player', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    const room = activeGameRoom();
    mockRoomManager.getRoomIdByUser.mockReturnValue('room1');
    mockRoomManager.getRoom.mockReturnValue(room);

    DisconnectHandler.handleDisconnect(io, socket);

    expect(mockRoomManager.leaveRoom).not.toHaveBeenCalled();
    expect(mockState.disconnectTimers.has('u1')).toBe(true);
    expect(toEmitted(io, 'room1', 'game:interrupted')).toBeDefined();
  });

  test('reconnecting within the grace window cancels the timer and resumes the game (no game-end)', () => {
    const io = makeIo();
    const disconnectSocket = makeSocket('u1', 'Alice');
    const room = activeGameRoom();
    mockRoomManager.getRoomIdByUser.mockReturnValue('room1');
    mockRoomManager.getRoom.mockReturnValue(room);

    DisconnectHandler.handleDisconnect(io, disconnectSocket);
    expect(mockState.disconnectTimers.has('u1')).toBe(true);

    // Reconnect halfway through the grace window
    jest.advanceTimersByTime(30_000);
    const reconnectSocket = makeSocket('u1', 'Alice');
    const resumed = DisconnectHandler.cancelDisconnectGrace(io, reconnectSocket);

    expect(resumed).toBe(true);
    expect(mockState.disconnectTimers.has('u1')).toBe(false);
    expect(reconnectSocket.join).toHaveBeenCalledWith('room1');
    expect(toEmitted(io, 'room1', 'game:resumed')).toBeDefined();

    // Advancing past the original 60s deadline must NOT end the game —
    // the timeout was cleared by cancelDisconnectGrace().
    jest.advanceTimersByTime(60_000);
    expect(mockHandleGameEnd).not.toHaveBeenCalled();
  });

  test('failing to reconnect before the grace period expires ends the game with no score', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    const room = activeGameRoom();
    mockRoomManager.getRoomIdByUser.mockReturnValue('room1');
    mockRoomManager.getRoom.mockReturnValue(room);
    mockRoomManager.leaveRoom.mockReturnValue({ room: { roomId: 'room1', users: new Map() } });

    DisconnectHandler.handleDisconnect(io, socket);
    expect(mockState.disconnectTimers.has('u1')).toBe(true);

    jest.advanceTimersByTime(60_000);

    expect(mockState.disconnectTimers.has('u1')).toBe(false);
    expect(mockHandleGameEnd).toHaveBeenCalledWith(io, room, { noScore: true });
    expect(room.gameState.status).toBe('finished');
    expect(toEmitted(io, 'room1', 'game:ended')).toBeDefined();
    expect(mockRoomManager.leaveRoom).toHaveBeenCalledWith('u1');
  });

  test('a second disconnect grace call for the same user clears the stale timer instead of stacking two', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    const room = activeGameRoom();
    mockRoomManager.getRoomIdByUser.mockReturnValue('room1');
    mockRoomManager.getRoom.mockReturnValue(room);

    DisconnectHandler.handleDisconnect(io, socket);
    const firstEntry = mockState.disconnectTimers.get('u1');

    // Simulate the same user disconnecting again before the first grace period ended
    // (e.g. flaky network bouncing the socket) — a stale timer must be replaced, not stacked.
    DisconnectHandler.handleDisconnect(io, makeSocket('u1', 'Alice'));
    const secondEntry = mockState.disconnectTimers.get('u1');

    expect(mockState.disconnectTimers.size).toBe(1);
    expect(secondEntry).not.toBe(firstEntry);

    // Only one game-end should ever fire once the (single, latest) timer expires.
    jest.advanceTimersByTime(60_000);
    expect(mockHandleGameEnd).toHaveBeenCalledTimes(1);
  });

  test('cancelDisconnectGrace returns false when there is no pending grace period for the user', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');

    const resumed = DisconnectHandler.cancelDisconnectGrace(io, socket);

    expect(resumed).toBe(false);
  });
});
