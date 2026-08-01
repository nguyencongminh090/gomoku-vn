'use strict';

/**
 * SocketHandler.test.js — Unit tests for single-device-per-token enforcement.
 *
 * Strategy: use lightweight mock io/socket objects (matching the convention
 * in LobbyHandler.test.js / DisconnectHandler.test.js) instead of a real
 * Socket.io server. Domain handlers (Lobby/Room/Game/Chat) are mocked as
 * no-op register() calls since this file only exercises the connection
 * lifecycle in SocketHandler.js itself — not each handler's own events.
 *
 * The real socket/state.js module is used (not mocked) so the interaction
 * between the eviction logic in SocketHandler.js and the shared `sessions`
 * registry (userId → live Socket) is actually verified end-to-end.
 */

const mockRoomManager = {
  on: jest.fn(),
  getRoom: jest.fn(() => null),
  getRoomByUser: jest.fn(() => null),
  listRooms: jest.fn(() => []),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);

jest.mock('../config', () => ({ MAX_EVENTS_PER_SECOND: 50 }));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../socket/handlers/LobbyHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/RoomHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/GameHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/ChatHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/DisconnectHandler', () => ({
  cancelDisconnectGrace: jest.fn(() => false),
  handleDisconnect: jest.fn(),
}));
jest.mock('../managers/ChatHandler', () => ({ cleanupUser: jest.fn() }));

const { sessions } = require('../socket/state');
const { init } = require('../socket/SocketHandler');

// ── Socket / IO factory helpers ────────────────────────────────────────────

function makeIo() {
  const io = {
    _connectionHandler: null,
    _toEmitted: {},
    sockets: { sockets: new Map() },
    engine: { on: jest.fn() },
    use: jest.fn(),
    on: jest.fn(function (event, cb) {
      if (event === 'connection') io._connectionHandler = cb;
    }),
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

function makeSocket(io, id, userId, displayName = 'User') {
  const socket = {
    id,
    user: { userId, displayName },
    _listeners: {},
    _emitted: [],
    disconnected: false,
    join: jest.fn(),
    emit: jest.fn(function (event, data) { this._emitted.push({ event, data }); }),
    on: jest.fn(function (event, cb) {
      (this._listeners[event] = this._listeners[event] || []).push(cb);
    }),
    disconnect: jest.fn(function () {
      // Mirrors real Socket.io ordering: the socket is removed from the
      // sockets map synchronously, but its own 'disconnect' listeners fire
      // asynchronously (next tick) — tests trigger them explicitly via
      // fireDisconnect() to control that ordering.
      this.disconnected = true;
      io.sockets.sockets.delete(id);
    }),
  };
  return socket;
}

/** Register a socket in io.sockets.sockets and run the captured connection handler. */
function connectSocket(io, socket) {
  io.sockets.sockets.set(socket.id, socket);
  io._connectionHandler(socket);
}

/** Simulate the socket's deferred 'disconnect' event firing. */
function fireDisconnect(socket, reason = 'client namespace disconnect') {
  const listeners = socket._listeners['disconnect'] || [];
  for (const cb of listeners) cb(reason);
}

function sockEmit(socket, event) {
  return socket._emitted.find(e => e.event === event);
}

beforeEach(() => {
  jest.clearAllMocks();
  sessions.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SocketHandler — single-device-per-token enforcement', () => {
  test('a second connection for the same userId kicks the first socket', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);
    expect(a.disconnect).not.toHaveBeenCalled();

    const b = makeSocket(io, 'sockB', 'u1', 'Alice');
    connectSocket(io, b);

    expect(sockEmit(a, 'session:kicked')).toBeDefined();
    expect(a.disconnect).toHaveBeenCalledWith(true);
    expect(b.disconnect).not.toHaveBeenCalled();
  });

  test('a connection for a different userId does not kick anyone', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);

    const c = makeSocket(io, 'sockC', 'u2', 'Carol');
    connectSocket(io, c);

    expect(a.disconnect).not.toHaveBeenCalled();
    expect(sockEmit(a, 'session:kicked')).toBeUndefined();
  });

  test('a lone connection (no prior stale socket, e.g. after a real page refresh) is never kicked', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);

    expect(a.disconnect).not.toHaveBeenCalled();
    expect(sockEmit(a, 'session:kicked')).toBeUndefined();
  });

  test("the kicked socket's later disconnect does not erase the new session's online presence", () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);
    expect(sessions.get('u1')).toBe(a);

    const b = makeSocket(io, 'sockB', 'u1', 'Alice');
    connectSocket(io, b);
    // By the time connectSocket(io, b) returns, the new session is already
    // tracked — this mirrors production where socket.disconnect(true) only
    // fires 'disconnect' asynchronously, after the new connection's
    // synchronous setup has completed.
    expect(sessions.get('u1')).toBe(b);

    // Now simulate socket A's deferred 'disconnect' event finally arriving.
    fireDisconnect(a);

    expect(sessions.get('u1')).toBe(b);
  });

  test('lobby:online_users is broadcast once when a user first connects, and again when they fully disconnect', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);
    expect((io._toEmitted['lobby'] || []).filter(e => e.event === 'lobby:online_users')).toHaveLength(1);

    fireDisconnect(a);
    expect((io._toEmitted['lobby'] || []).filter(e => e.event === 'lobby:online_users')).toHaveLength(2);
    expect(sessions.has('u1')).toBe(false);
  });

  test('eviction is an O(1) session-registry lookup, not a scan of io.sockets.sockets', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);

    // Poison io.sockets.sockets with decoys for other users, and even remove
    // the true socket's own entry from it — the O(1) path must not depend on
    // enumerating this collection at all, only on the sessions registry.
    for (let i = 0; i < 25; i++) {
      io.sockets.sockets.set(`decoy${i}`, { id: `decoy${i}`, user: { userId: `other${i}` } });
    }
    io.sockets.sockets.delete('sockA');

    const b = makeSocket(io, 'sockB', 'u1', 'Alice');
    connectSocket(io, b);

    expect(sockEmit(a, 'session:kicked')).toBeDefined();
    expect(a.disconnect).toHaveBeenCalledWith(true);
    expect(b.disconnect).not.toHaveBeenCalled();
    expect(sessions.get('u1')).toBe(b);
  });

  test('near-simultaneous connections for the same userId: exactly one socket ends up kicked, never zero, never both', () => {
    for (let trial = 0; trial < 5; trial++) {
      const io = makeIo();
      init(io);
      sessions.clear();

      const a = makeSocket(io, `sockA${trial}`, 'u1', 'Alice');
      const b = makeSocket(io, `sockB${trial}`, 'u1', 'Alice');

      // Both "arrive" back-to-back, as they would under near-simultaneous
      // dual connections — the event loop still serializes them one at a
      // time, so this exercises the same ordering the server actually sees.
      connectSocket(io, a);
      connectSocket(io, b);

      const kicked = [a, b].filter(s => s.disconnect.mock.calls.length > 0);
      expect(kicked).toHaveLength(1);
      expect(sessions.get('u1')).toBe(kicked[0] === a ? b : a);
    }
  });
});
