'use strict';

/**
 * LobbyHandler.test.js — Unit tests for the LobbyHandler socket domain.
 *
 * Strategy: use lightweight mock io/socket objects instead of a real
 * Socket.io server. This keeps tests fast and I/O-free.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────

// Mock RoomManager before requiring LobbyHandler
const mockRoomManager = {
  listRooms: jest.fn(() => []),
  createRoom: jest.fn(),
  joinRoom:   jest.fn(),
  serializeRoom: jest.fn((room) => ({ roomId: room.roomId, roomName: room.roomName })),
  getRoomIdByUser: jest.fn(() => null),
  getRoom:    jest.fn(() => null),
};

jest.mock('../managers/RoomManager', () => mockRoomManager);

// Mock logger (suppress output during tests)
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock state module
const mockState = {
  timerMap: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  getOnlineUsersList: jest.fn(() => []),
};
jest.mock('../socket/state', () => mockState);

const LobbyHandler = require('../socket/handlers/LobbyHandler');

// ── Socket / IO factory helpers ────────────────────────────────────────────

function makeSocket(userId = 'u1', displayName = 'User 1') {
  const socket = {
    user: { userId, displayName, isGuest: false },
    rooms: new Set(),
    _emitted: [],
    join: jest.fn(function(room) { this.rooms.add(room); }),
    leave: jest.fn(function(room) { this.rooms.delete(room); }),
    emit: jest.fn(function(event, data) { this._emitted.push({ event, data }); }),
    on: jest.fn(),
    to: jest.fn(() => socket),
  };
  return socket;
}

function makeIo() {
  const io = {
    _toEmitted: {},
    to: jest.fn(function(room) {
      return {
        emit: jest.fn((event, data) => {
          if (!io._toEmitted[room]) io._toEmitted[room] = [];
          io._toEmitted[room].push({ event, data });
        }),
      };
    }),
    sockets: { sockets: new Map() },
  };
  return io;
}

/** Find an event emitted directly on the socket */
function sockEmit(socket, event) {
  return socket._emitted.find(e => e.event === event);
}

// ---------------------------------------------------------------------------
// 1. lobby:subscribe
// ---------------------------------------------------------------------------
describe('LobbyHandler — lobby:subscribe', () => {
  beforeEach(() => {
    mockRoomManager.listRooms.mockReturnValue([{ id: 'room1', name: 'Room 1' }]);
    jest.clearAllMocks();
  });

  test('joins socket to lobby room', () => {
    const io = makeIo();
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    LobbyHandler.register(io, socket);

    socket.emit.mockClear();
    handlers['lobby:subscribe']();
    expect(socket.join).toHaveBeenCalledWith('lobby');
  });

  test('emits lobby:update with current room list on subscribe', () => {
    const io = makeIo();
    const socket = makeSocket();

    // Capture registered handlers
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    LobbyHandler.register(io, socket);
    handlers['lobby:subscribe']();

    const updateEmit = socket._emitted.find(e => e.event === 'lobby:update');
    expect(socket.join).toHaveBeenCalledWith('lobby');
    expect(updateEmit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. lobby:unsubscribe
// ---------------------------------------------------------------------------
describe('LobbyHandler — lobby:unsubscribe', () => {
  test('leaves lobby room on unsubscribe', () => {
    const io = makeIo();
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    LobbyHandler.register(io, socket);
    handlers['lobby:subscribe']();   // join first
    handlers['lobby:unsubscribe'](); // now leave

    expect(socket.leave).toHaveBeenCalledWith('lobby');
  });
});

// ---------------------------------------------------------------------------
// 3. room:create
// ---------------------------------------------------------------------------
describe('LobbyHandler — room:create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('emits room:joined on successful room creation', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    const mockRoom = { roomId: 'room-xyz', roomName: 'Test Room' };
    mockRoomManager.createRoom.mockReturnValue({ room: mockRoom });

    LobbyHandler.register(io, socket);
    handlers['room:create']({ settings: {} });

    const joined = socket._emitted.find(e => e.event === 'room:joined');
    expect(joined).toBeDefined();
    expect(socket.join).toHaveBeenCalledWith('room-xyz');
    expect(mockState.broadcastLobbyUpdate).toHaveBeenCalled();
  });

  test('emits room:error when createRoom returns an error', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    mockRoomManager.createRoom.mockReturnValue({ error: 'Bạn đã ở trong phòng khác.' });

    LobbyHandler.register(io, socket);
    handlers['room:create']({ settings: {} });

    const errEmit = socket._emitted.find(e => e.event === 'room:error');
    expect(errEmit).toBeDefined();
    expect(errEmit.data.message).toBe('Bạn đã ở trong phòng khác.');
  });

  test('handles missing payload gracefully (uses empty settings)', () => {
    const io = makeIo();
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    const mockRoom = { roomId: 'r1', roomName: 'R1' };
    mockRoomManager.createRoom.mockReturnValue({ room: mockRoom });

    LobbyHandler.register(io, socket);
    // Call with no payload (undefined)
    handlers['room:create']();

    expect(mockRoomManager.createRoom).toHaveBeenCalledWith(
      expect.any(Object),
      {} // empty settings default
    );
  });
});

// ---------------------------------------------------------------------------
// 4. room:join
// ---------------------------------------------------------------------------
describe('LobbyHandler — room:join', () => {
  beforeEach(() => jest.clearAllMocks());

  test('emits room:error when no roomId provided', () => {
    const io = makeIo();
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    LobbyHandler.register(io, socket);
    handlers['room:join']({});  // missing roomId

    const err = socket._emitted.find(e => e.event === 'room:error');
    expect(err).toBeDefined();
  });

  test('emits room:joined and notifies room members on success', () => {
    const io = makeIo();
    const socket = makeSocket('u2', 'Bob');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    const mockRoom = { roomId: 'room-abc', roomName: 'Alpha' };
    mockRoomManager.joinRoom.mockReturnValue({ room: mockRoom });

    LobbyHandler.register(io, socket);
    handlers['room:join']({ roomId: 'room-abc' });

    const joined = socket._emitted.find(e => e.event === 'room:joined');
    expect(joined).toBeDefined();
    expect(socket.join).toHaveBeenCalledWith('room-abc');
  });

  test('emits room:error when joinRoom fails', () => {
    const io = makeIo();
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    mockRoomManager.joinRoom.mockReturnValue({ error: 'Phòng không tồn tại.' });

    LobbyHandler.register(io, socket);
    handlers['room:join']({ roomId: 'nonexistent' });

    const err = socket._emitted.find(e => e.event === 'room:error');
    expect(err).toBeDefined();
    expect(err.data.message).toBe('Phòng không tồn tại.');
  });

  test('includes gameState in room:joined payload when game is active', () => {
    const io = makeIo();
    const socket = makeSocket('u3', 'Carol');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    const mockGameState = { serialize: jest.fn(() => ({ boardSize: 15 })), status: 'ongoing' };
    const mockRoom = { roomId: 'room-live', roomName: 'Live', gameState: mockGameState };
    mockRoomManager.joinRoom.mockReturnValue({ room: mockRoom });
    mockState.timerMap.set('room-live', { getTimers: () => ({ black: 30, white: 45 }) });

    LobbyHandler.register(io, socket);
    handlers['room:join']({ roomId: 'room-live' });

    const joined = socket._emitted.find(e => e.event === 'room:joined');
    expect(joined).toBeDefined();
    expect(joined.data.gameState).toBeDefined();
    expect(joined.data.timer).toBeDefined();

    mockState.timerMap.delete('room-live');
  });
});
