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
  serializeRoom: jest.fn((room) => ({ roomId: room.roomId, roomName: room.roomName, settings: {} })),
  // room:updated carries everything serializeRoom does except settings.
  serializeRoomUpdate: jest.fn((room) => ({ roomId: room.roomId, roomName: room.roomName })),
  getRoomIdByUser: jest.fn(() => null),
  getRoom:    jest.fn(() => null),
};

jest.mock('../managers/RoomManager', () => mockRoomManager);

// F402: remembering the member's last room settings
const mockDb = { setLastRoomSettings: jest.fn() };
jest.mock('../db/database', () => mockDb);

// Mock logger (suppress output during tests)
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock state module — getClientIp is pulled from the real module rather than
// re-implemented here, so these tests exercise its actual loopback/forwarded
// logic instead of a hand-rolled stand-in that could drift from it.
const actualState = jest.requireActual('../socket/state');
const mockState = {
  timerMap: new Map(),
  emptyRoomGraceTimers: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  scheduleLobbyBoardUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(),
  // The real one sends the full room list and seeds the delta baseline; here
  // only the emit matters, which is what this suite asserts on.
  sendLobbySnapshot: jest.fn((io, socket) => {
    socket.emit('lobby:update', { rooms: mockRoomManager.listRooms() });
  }),
  sendOnlineSnapshot: jest.fn((io, socket) => {
    socket.emit('lobby:online_users', []);
  }),
  queryOnlineUsers: jest.fn((query) => (Array.isArray(query.ids) ? { online: [] } : { total: 0, matched: 0, users: [] })),
  queryLobbyRooms: jest.fn(() => ({ rooms: [], stats: { rooms: 0, open: 0, live: 0, watch: 0 } })),
  getClientIp: actualState.getClientIp,
};
jest.mock('../socket/state', () => mockState);

const LobbyHandler = require('../socket/handlers/LobbyHandler');

// ── Socket / IO factory helpers ────────────────────────────────────────────

function makeSocket(userId = 'u1', displayName = 'User 1', handshake = { address: '203.0.113.5', headers: {} }) {
  const socket = {
    user: { userId, displayName, isGuest: false },
    handshake,
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.emptyRoomGraceTimers.clear();
  });

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

  describe('F402 remembers the creator\'s settings', () => {
    const create = (socketUser, result) => {
      const io = makeIo();
      const socket = makeSocket('u1', 'Alice');
      Object.assign(socket.user, socketUser);
      const handlers = {};
      socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
      mockRoomManager.createRoom.mockReturnValue(result);
      LobbyHandler.register(io, socket);
      handlers['room:create']({ settings: {} });
      return socket;
    };
    const room = { roomId: 'r1', roomName: 'x', settings: { boardSize: 19, ranked: false } };

    test('member: the validated room.settings are saved for their user id', () => {
      create({}, { room });
      expect(mockDb.setLastRoomSettings).toHaveBeenCalledWith('u1', room.settings);
    });
    test('guest: nothing is saved', () => {
      create({ isGuest: true }, { room });
      expect(mockDb.setLastRoomSettings).not.toHaveBeenCalled();
    });
    test('failed create: nothing is saved', () => {
      create({}, { error: 'x', code: 'ROOM_LIMIT' });
      expect(mockDb.setLastRoomSettings).not.toHaveBeenCalled();
    });
    test('a throwing save never fails the create', () => {
      mockDb.setLastRoomSettings.mockImplementationOnce(() => { throw new Error('disk full'); });
      const socket = create({}, { room });
      expect(socket._emitted.find(e => e.event === 'room:joined')).toBeDefined();
    });
  });

  test('emits room:error when createRoom returns an error', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    mockRoomManager.createRoom.mockReturnValue({ error: 'Bạn đã ở trong phòng khác.', code: 'ALREADY_IN_ANOTHER_ROOM' });

    LobbyHandler.register(io, socket);
    handlers['room:create']({ settings: {} });

    const errEmit = socket._emitted.find(e => e.event === 'room:error');
    expect(errEmit).toBeDefined();
    expect(errEmit.data.message).toBe('Bạn đã ở trong phòng khác.');
    // `code` is the language-neutral field the client actually renders
    // (TODO #45) — a regression here silently reintroduces Vietnamese-only errors.
    expect(errEmit.data.code).toBe('ALREADY_IN_ANOTHER_ROOM');
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
      {}, // empty settings default
      new Set()
    );
  });

  test('uses the raw socket address as the room-quota IP for a direct connection', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice', { address: '203.0.113.5', headers: {} });
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    mockRoomManager.createRoom.mockReturnValue({ room: { roomId: 'r1', roomName: 'R1' } });

    LobbyHandler.register(io, socket);
    handlers['room:create']({ settings: {} });

    expect(mockRoomManager.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '203.0.113.5' }),
      {},
      new Set()
    );
  });

  test('uses the forwarded client IP, not the loopback proxy address, when behind a same-host proxy', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice', {
      address: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    mockRoomManager.createRoom.mockReturnValue({ room: { roomId: 'r1', roomName: 'R1' } });

    LobbyHandler.register(io, socket);
    handlers['room:create']({ settings: {} });

    expect(mockRoomManager.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '198.51.100.7' }),
      {},
      new Set()
    );
  });

  test('ignores a spoofed X-Forwarded-For from a connection that is not actually loopback', () => {
    const io = makeIo();
    const socket = makeSocket('u1', 'Alice', {
      address: '203.0.113.9', // a real remote peer, not the trusted local proxy
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    mockRoomManager.createRoom.mockReturnValue({ room: { roomId: 'r1', roomName: 'R1' } });

    LobbyHandler.register(io, socket);
    handlers['room:create']({ settings: {} });

    expect(mockRoomManager.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '203.0.113.9' }),
      {},
      new Set()
    );
  });

  // TODO.md #43 / instruction.md §43: emptyRoomGraceTimers is keyed by
  // userId, not roomId — every other test in this describe block leaves it
  // empty, so an empty Set is always the "correct" answer there and can't
  // catch a wiring bug in the `.roomId` extraction (e.g. collecting userIds
  // instead of roomIds by mistake). This test seeds real entries.
  test('collects the .roomId of every pending empty-room-grace entry into the graceRoomIds Set passed to createRoom', () => {
    mockState.emptyRoomGraceTimers.set('grace-user-1', { timeout: {}, roomId: 'room-A' });
    mockState.emptyRoomGraceTimers.set('grace-user-2', { timeout: {}, roomId: 'room-B' });

    const io = makeIo();
    const socket = makeSocket('u1', 'Alice');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    mockRoomManager.createRoom.mockReturnValue({ room: { roomId: 'r1', roomName: 'R1' } });

    LobbyHandler.register(io, socket);
    handlers['room:create']({ settings: {} });

    expect(mockRoomManager.createRoom).toHaveBeenCalledWith(
      expect.any(Object),
      {},
      new Set(['room-A', 'room-B'])
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
    expect(err.data.code).toBe('MISSING_ROOM_ID');
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

  test('#373: room:join from the room page marks the socket as the room page and a returning member as watching', () => {
    const io = makeIo();
    const socket = makeSocket('u2', 'Bob');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    const me = { userId: 'u2', presence: 'away' }; // set 'away' while they were on the lobby
    mockRoomManager.joinRoom.mockReturnValue({ room: { roomId: 'room-abc', users: new Map([['u2', me]]) } });

    LobbyHandler.register(io, socket);
    handlers['room:join']({ roomId: 'room-abc' });

    expect(me.presence).toBe('active');
    expect(socket.data.roomPageId).toBe('room-abc');
  });

  test('emits room:error when joinRoom fails', () => {
    const io = makeIo();
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    mockRoomManager.joinRoom.mockReturnValue({ error: 'Phòng không tồn tại.', code: 'ROOM_NOT_FOUND' });

    LobbyHandler.register(io, socket);
    handlers['room:join']({ roomId: 'nonexistent' });

    const err = socket._emitted.find(e => e.event === 'room:error');
    expect(err).toBeDefined();
    expect(err.data.message).toBe('Phòng không tồn tại.');
    expect(err.data.code).toBe('ROOM_NOT_FOUND');
  });

  test('includes gameState in room:joined payload when game is active', () => {
    const io = makeIo();
    const socket = makeSocket('u3', 'Carol');
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });

    const mockGameState = { serialize: jest.fn(() => ({ boardSize: 15 })), status: 'ongoing' };
    const mockRoom = { roomId: 'room-live', roomName: 'Live', gameState: mockGameState };
    mockRoomManager.joinRoom.mockReturnValue({ room: mockRoom });
    mockState.timerMap.set('room-live', {
      getTimers: () => ({ black: 30, white: 45 }),
      // Reconnect payloads now also carry the deadline the client counts from.
      getSync: () => ({ black: 30, white: 45, activeColor: 'black', deadline: 1000, serverTime: 0, running: true }),
    });

    LobbyHandler.register(io, socket);
    handlers['room:join']({ roomId: 'room-live' });

    const joined = socket._emitted.find(e => e.event === 'room:joined');
    expect(joined).toBeDefined();
    expect(joined.data.gameState).toBeDefined();
    expect(joined.data.timer).toBeDefined();

    mockState.timerMap.delete('room-live');
  });
});

// ---------------------------------------------------------------------------
// #381: on-demand online lookup (the snapshot carries one page only)
// ---------------------------------------------------------------------------
describe('LobbyHandler — lobby:online_query', () => {
  function setup() {
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    LobbyHandler.register(makeIo(), socket);
    mockState.queryOnlineUsers.mockClear();
    return handlers['lobby:online_query'];
  }
  afterEach(() => jest.useRealTimers());

  test('answers through the ack with what state.queryOnlineUsers returns', () => {
    const query = setup(); const ack = jest.fn();
    query({ q: 'minh' }, ack);
    expect(mockState.queryOnlineUsers).toHaveBeenCalledWith({ q: 'minh' });
    expect(ack).toHaveBeenCalledWith({ total: 0, matched: 0, users: [] });
  });

  test.each([[undefined], [null], ['x'], [42]])('payload %p is treated as an empty query, not a crash', (payload) => {
    const query = setup(); const ack = jest.fn();
    query(payload, ack);
    expect(mockState.queryOnlineUsers).toHaveBeenCalledWith({});
    expect(ack).toHaveBeenCalledTimes(1);
  });

  test('no ack callback → ignored (nothing to answer on)', () => {
    const query = setup();
    expect(() => query({ q: 'a' })).not.toThrow();
    expect(mockState.queryOnlineUsers).not.toHaveBeenCalled();
  });

  test('name searches faster than typing are refused; id lookups are never throttled', () => {
    jest.useFakeTimers();
    const query = setup(); const ack = jest.fn();
    query({ q: 'a' }, ack);
    query({ q: 'ab' }, ack);                 // same instant
    expect(ack).toHaveBeenLastCalledWith({ error: 'RATE_LIMITED' });
    expect(mockState.queryOnlineUsers).toHaveBeenCalledTimes(1);
    query({ ids: ['u9'] }, ack);
    query({ ids: ['u9'] }, ack);
    expect(mockState.queryOnlineUsers).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(200);
    query({ q: 'abc' }, ack);
    expect(mockState.queryOnlineUsers).toHaveBeenCalledTimes(4);
  });
});

// #382: "show more" — the next page of the room ranking
describe('LobbyHandler — lobby:rooms_query', () => {
  function setup() {
    const socket = makeSocket();
    const handlers = {};
    socket.on = jest.fn((event, fn) => { handlers[event] = fn; });
    LobbyHandler.register(makeIo(), socket);
    mockState.queryLobbyRooms.mockClear();
    return handlers['lobby:rooms_query'];
  }
  afterEach(() => jest.useRealTimers());

  test('answers through the ack; a missing/odd payload is an empty query; no ack → ignored', () => {
    const query = setup(); const ack = jest.fn();
    query({ offset: 30 }, ack);
    expect(mockState.queryLobbyRooms).toHaveBeenLastCalledWith({ offset: 30 });
    expect(ack).toHaveBeenCalledWith({ rooms: [], stats: { rooms: 0, open: 0, live: 0, watch: 0 } });
    expect(() => query({ offset: 30 })).not.toThrow();
    expect(mockState.queryLobbyRooms).toHaveBeenCalledTimes(1);
  });

  test('a second request inside 200 ms is refused, the next one after it is served', () => {
    jest.useFakeTimers();
    const query = setup(); const ack = jest.fn();
    query(null, ack);
    query({ offset: 30 }, ack);
    expect(ack).toHaveBeenLastCalledWith({ error: 'RATE_LIMITED' });
    jest.advanceTimersByTime(200);
    query({ offset: 30 }, ack);
    expect(mockState.queryLobbyRooms.mock.calls).toEqual([[{}], [{ offset: 30 }]]);
  });
});
