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
 *
 * Since TODO.md #148 the 1s window is rolled lazily on the events themselves
 * instead of by a per-socket setInterval, so `advanceTimersByTime` here only
 * moves the (faked) clock — a boundary is settled by the next event that
 * arrives after it, which is why the streak tests below poke the socket once
 * after advancing.
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
  cancelEmptyRoomGrace: jest.fn(() => false),
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

describe('flood protection — the MAX_EVENTS_PER_SECOND boundary', () => {
  test.each([
    ['one under the limit', MAX_EVENTS_PER_SECOND - 1, MAX_EVENTS_PER_SECOND - 1, 0],
    ['exactly at the limit', MAX_EVENTS_PER_SECOND, MAX_EVENTS_PER_SECOND, 0],
    ['one over the limit', MAX_EVENTS_PER_SECOND + 1, MAX_EVENTS_PER_SECOND, 1],
  ])('%s: %i events → %i delivered, %i warnings', (_label, sent, delivered, warned) => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, sent);

    expect(socket.delivered).toHaveLength(delivered);
    expect(warnings(socket)).toHaveLength(warned);
    expect(socket.disconnected).toBe(false);
  });

  test('the warning carries the RATE_LIMITED code the client switches on', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND + 1);

    expect(warnings(socket)[0].data).toMatchObject({ code: 'RATE_LIMITED' });
  });

  test('a burst spread across two windows is not throttled at all', () => {
    // MAX per window, twice — the counter must reset on the boundary even
    // though no timer fires any more.
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND);
    jest.advanceTimersByTime(1000);
    send(socket, MAX_EVENTS_PER_SECOND);

    expect(socket.delivered).toHaveLength(MAX_EVENTS_PER_SECOND * 2);
    expect(warnings(socket)).toHaveLength(0);
  });

  test('the window does not roll a millisecond early', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    send(socket, MAX_EVENTS_PER_SECOND);
    jest.advanceTimersByTime(999);
    send(socket, 1);

    expect(socket.delivered).toHaveLength(MAX_EVENTS_PER_SECOND);
    expect(warnings(socket)).toHaveLength(1);
  });

  test('the packet reaches the original onevent unchanged, with `this` intact', () => {
    // The middleware wraps socket.onevent while SocketHandler wraps socket.on
    // elsewhere; breaking `this` or the packet here would break that layer in
    // a way that is hard to trace back.
    const socket = makeSocket();
    const packet = { data: ['room:sit', { seat: 1 }] };
    let seenThis = null;
    socket.onevent = function(p) { seenThis = this; this.delivered.push(p); };
    middleware(socket, jest.fn());

    socket.onevent(packet);

    expect(socket.delivered).toEqual([packet]);
    expect(socket.delivered[0]).toBe(packet);
    expect(seenThis).toBe(socket);
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
    send(socket, 1); // settles the final boundary

    expect(socket.disconnected).toBe(true);
  });

  test('one window short of the streak does not disconnect', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    for (let window = 0; window < FLOOD_DISCONNECT_STREAK - 1; window++) {
      send(socket, MAX_EVENTS_PER_SECOND + 5);
      jest.advanceTimersByTime(1000);
    }
    send(socket, 1);

    expect(socket.disconnected).toBe(false);
  });

  test('the event that trips the disconnect is not delivered', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    for (let window = 0; window < FLOOD_DISCONNECT_STREAK; window++) {
      send(socket, MAX_EVENTS_PER_SECOND + 5);
      jest.advanceTimersByTime(1000);
    }
    const deliveredBefore = socket.delivered.length;
    send(socket, 1);

    expect(socket.disconnected).toBe(true);
    expect(socket.delivered).toHaveLength(deliveredBefore);
  });

  test('windows the socket sat out silently break the streak', () => {
    // The lazy roll must charge only the window that actually recorded events
    // and treat every window skipped in between as clean.
    const socket = makeSocket();
    middleware(socket, jest.fn());

    for (let window = 0; window < FLOOD_DISCONNECT_STREAK - 1; window++) {
      send(socket, MAX_EVENTS_PER_SECOND + 5);
      jest.advanceTimersByTime(1000);
    }
    jest.advanceTimersByTime(10 * 1000); // silent
    send(socket, MAX_EVENTS_PER_SECOND + 5);
    jest.advanceTimersByTime(1000);
    send(socket, 1);

    expect(socket.disconnected).toBe(false);
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
    send(socket, 1);

    expect(socket.disconnected).toBe(false);
  });

  test('a socket that never floods is never disconnected', () => {
    const socket = makeSocket();
    middleware(socket, jest.fn());

    for (let window = 0; window < FLOOD_DISCONNECT_STREAK + 2; window++) {
      send(socket, MAX_EVENTS_PER_SECOND);
      jest.advanceTimersByTime(1000);
    }
    send(socket, 1);

    expect(socket.disconnected).toBe(false);
  });

  test('the middleware always calls next() so the connection proceeds', () => {
    const socket = makeSocket();
    const next = jest.fn();

    middleware(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('a connection leaves no timer behind to clean up', () => {
    // TODO.md #148: the per-socket setInterval is gone, so there is nothing a
    // disconnect handler could forget to clear. Guards against a future
    // "optimisation" quietly reintroducing a timer (or leaking one).
    const before = jest.getTimerCount();

    const sockets = [];
    for (let i = 0; i < 10; i++) {
      const socket = makeSocket();
      middleware(socket, jest.fn());
      send(socket, MAX_EVENTS_PER_SECOND + 5);
      sockets.push(socket);
    }

    expect(jest.getTimerCount()).toBe(before);
    expect(sockets.every(s => s.delivered.length === MAX_EVENTS_PER_SECOND)).toBe(true);
  });

  test('per-socket window state is not shared between connections', () => {
    const flooder = makeSocket();
    const innocent = makeSocket();
    middleware(flooder, jest.fn());
    middleware(innocent, jest.fn());

    for (let window = 0; window < FLOOD_DISCONNECT_STREAK; window++) {
      send(flooder, MAX_EVENTS_PER_SECOND + 5);
      send(innocent, 1);
      jest.advanceTimersByTime(1000);
    }
    send(flooder, 1);
    send(innocent, 1);

    expect(flooder.disconnected).toBe(true);
    expect(innocent.disconnected).toBe(false);
    expect(warnings(innocent)).toHaveLength(0);
  });
});
