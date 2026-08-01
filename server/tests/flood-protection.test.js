'use strict';

/**
 * flood-protection.test.js — Unit tests for the socket flood-protection
 * middleware in server/socket/SocketHandler.js.
 *
 * Restores the test that was written and discarded when backend fix #7 was
 * made (see docs/fix-log.md): the middleware body is otherwise reachable by
 * nothing in the suite, and the verification pass confirmed the whole fix
 * could be deleted with 145/145 still green.
 *
 * The middleware is not exported, so it is captured the way it is registered:
 * init(io) calls io.use(fn), and this grabs that fn.
 */

const MAX_EVENTS_PER_SECOND = 5;
const FLOOD_DISCONNECT_STREAK = 3;

jest.mock('../config', () => ({
  MAX_EVENTS_PER_SECOND: 5,
  FLOOD_DISCONNECT_STREAK: 3,
}));

const mockRoomManager = {
  on: jest.fn(),
  getRoom: jest.fn(() => null),
  getRoomByUser: jest.fn(() => null),
  listRooms: jest.fn(() => []),
  serializeRoom: jest.fn(() => ({})),
  serializeRoomUpdate: jest.fn(() => ({})),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../socket/handlers/LobbyHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/RoomHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/GameHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/ChatHandler', () => ({ register: jest.fn() }));
jest.mock('../socket/handlers/DisconnectHandler', () => ({
  cancelDisconnectGrace: jest.fn(() => false),
  handleDisconnect: jest.fn(),
}));
jest.mock('../managers/ChatHandler', () => ({ cleanupUser: jest.fn() }));

const { init } = require('../socket/SocketHandler');

/** Capture the flood middleware the way SocketHandler registers it. */
function captureMiddleware() {
  let middleware = null;
  const io = {
    on: jest.fn(),
    use: jest.fn(fn => { middleware = fn; }),
    engine: { on: jest.fn() },
    sockets: { sockets: new Map() },
    to: jest.fn(() => ({ emit: jest.fn() })),
    in: jest.fn(() => ({ socketsLeave: jest.fn() })),
  };
  init(io);
  return middleware;
}

/** A socket double with the onevent hook the middleware wraps. */
function makeSocket() {
  const socket = {
    id: 'sock1',
    user: { userId: 'u1', displayName: 'Alice' },
    delivered: [],
    emitted: [],
    disconnected: false,
    _listeners: {},
    onevent(packet) { this.delivered.push(packet); },
    emit(event, data) { this.emitted.push({ event, data }); },
    on(event, cb) { (this._listeners[event] = this._listeners[event] || []).push(cb); },
    disconnect(force) { this.disconnected = force; },
  };
  return socket;
}

function send(socket, n) {
  for (let i = 0; i < n; i++) socket.onevent({ data: ['room:sit', {}] });
}

function warnings(socket) {
  return socket.emitted.filter(e => e.event === 'room:error');
}

let middleware;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  middleware = captureMiddleware();
});

afterEach(() => jest.useRealTimers());

describe('flood protection — warning amplification', () => {
  test('a flooded window emits exactly one warning, not one per dropped event', () => {
    // The bug fix #7 addressed: every event past the limit sent its own
    // room:error, so flooding amplified the server's own outbound traffic.
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND + 50);

    expect(warnings(socket)).toHaveLength(1);
  });

  test('events within the limit are delivered untouched', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND);

    expect(socket.delivered).toHaveLength(MAX_EVENTS_PER_SECOND);
    expect(warnings(socket)).toHaveLength(0);
  });

  test('events past the limit are dropped, not delivered', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND + 10);

    expect(socket.delivered).toHaveLength(MAX_EVENTS_PER_SECOND);
  });

  test('a new window allows a fresh warning', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND + 5);
    jest.advanceTimersByTime(1000);
    send(socket, MAX_EVENTS_PER_SECOND + 5);

    expect(warnings(socket)).toHaveLength(2);
  });
});

describe('flood protection — repeat offenders', () => {
  test('consecutive flooded windows eventually force a disconnect', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    for (let window = 0; window < FLOOD_DISCONNECT_STREAK; window++) {
      send(socket, MAX_EVENTS_PER_SECOND + 5);
      jest.advanceTimersByTime(1000);
    }

    expect(socket.disconnected).toBe(true);
  });

  test('a clean window resets the streak, so non-consecutive floods do not disconnect', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND + 5);   // flooded window 1
    jest.advanceTimersByTime(1000);
    send(socket, 1);                            // behaving
    jest.advanceTimersByTime(1000);
    send(socket, MAX_EVENTS_PER_SECOND + 5);   // flooded window 2
    jest.advanceTimersByTime(1000);

    expect(socket.disconnected).toBe(false);
  });

  test('a socket that never floods is never disconnected', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    for (let window = 0; window < FLOOD_DISCONNECT_STREAK + 2; window++) {
      send(socket, MAX_EVENTS_PER_SECOND);
      jest.advanceTimersByTime(1000);
    }

    expect(socket.disconnected).toBe(false);
  });

  test('the middleware always calls next() so the connection proceeds', () => {
    const socket = makeSocket();
    const next = jest.fn();

    middleware(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('the window interval is cleared when the socket disconnects', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());
    const clearSpy = jest.spyOn(global, 'clearInterval');

    for (const cb of socket._listeners['disconnect'] || []) cb();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
