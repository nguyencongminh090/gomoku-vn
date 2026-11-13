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
  cancelEmptyRoomGrace: jest.fn(() => false),
  cancelSpectatorGrace: jest.fn(() => false),
  handleDisconnect: jest.fn(),
}));
// Mocked like every other domain handler above — otherwise each of this
// file's many init(io) calls would re-register real listeners on the
// TournamentManager singleton's EventEmitter (unlike RoomManager, which is
// itself mocked so its .on() calls are no-ops), tripping Node's
// MaxListenersExceededWarning.
jest.mock('../socket/handlers/TournamentHandler', () => ({ init: jest.fn(), register: jest.fn() }));
jest.mock('../socket/handlers/TournamentMatchHandler', () => ({ register: jest.fn(), resyncOnConnect: jest.fn() }));
jest.mock('../managers/ChatHandler', () => ({ cleanupUser: jest.fn() }));
// #367 rejoin path broadcasts a lobby update; keep home-feed (DB-backed) out of this unit test.
jest.mock('../socket/home-feed', () => ({ register: jest.fn(), scheduleHomeUpdate: jest.fn() }));

const { sessions, ONLINE_USERS_DEBOUNCE_MS } = require('../socket/state');
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

function makeSocket(io, id, userId, displayName = 'User', auth = {}) {
  const socket = {
    id,
    user: { userId, displayName },
    handshake: { auth },
    _listeners: {},
    _emitted: [],
    disconnected: false,
    join: jest.fn(),
    leave: jest.fn(),
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

  test('a disconnect reason string (e.g. "ping timeout") reaches the log unmangled, not coerced to an object', () => {
    const logger = require('../utils/logger');
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);
    logger.info.mockClear();

    fireDisconnect(a, 'ping timeout');

    const disconnectLog = logger.info.mock.calls.find(call => call[0].includes('[Socket] Disconnected'));
    // The reason now rides in the structured fields bag (logger.js logfmt
    // support), still as a raw string — never coerced to an object/[object Object].
    const fields = disconnectLog[disconnectLog.length - 1];
    expect(typeof fields).toBe('object');
    expect(fields.reason).toBe('ping timeout');
    expect(JSON.stringify(disconnectLog)).not.toContain('[object Object]');
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

  test('lobby:online_patch is broadcast once when a user first connects, and again when they fully disconnect', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    expect((io._toEmitted['lobby'] || []).filter(e => e.event === 'lobby:online_patch')).toHaveLength(1);

    fireDisconnect(a);
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    expect((io._toEmitted['lobby'] || []).filter(e => e.event === 'lobby:online_patch')).toHaveLength(2);
    expect(sessions.has('u1')).toBe(false);
  });

  test('a burst of connects/disconnects within the debounce window collapses to one lobby:online_patch broadcast', () => {
    const io = makeIo();
    init(io);

    // Five distinct users connecting back-to-back (e.g. a connection burst)
    // used to each trigger their own full-list rebuild+broadcast — an O(n)
    // rebuild fired n times. Debouncing should coalesce all of this into a
    // single broadcast once the window elapses.
    for (let i = 0; i < 5; i++) {
      connectSocket(io, makeSocket(io, `sockBurst${i}`, `burst${i}`, `Burst${i}`));
    }
    expect((io._toEmitted['lobby'] || []).filter(e => e.event === 'lobby:online_patch')).toHaveLength(0);

    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    expect((io._toEmitted['lobby'] || []).filter(e => e.event === 'lobby:online_patch')).toHaveLength(1);
  });

  test('TODO.md #41: reconnect traffic spread 150-400ms apart (not a synchronized burst) still collapses to far fewer broadcasts than the old 300ms window managed', () => {
    const io = makeIo();
    init(io);

    // Mirrors review 12.5's real-world measurement: reconnects landing
    // 150-400ms apart (client/js/socket-client.js's reconnectionDelay is
    // randomized per socket, so many sockets' attempts interleave at this
    // spacing) rather than all at once. The old 300ms window only
    // collapsed this into ~28 broadcasts for 39 events (~28% reduction);
    // the new 1.5s window should do much better.
    const gaps = [150, 400, 200, 350, 180, 320, 250, 400, 150, 300, 220, 380];
    let elapsed = 0;
    gaps.forEach((gap, i) => {
      connectSocket(io, makeSocket(io, `sockGap${i}`, `gap${i}`, `Gap${i}`));
      jest.advanceTimersByTime(gap);
      elapsed += gap;
    });
    // Flush whatever window is still pending after the last event.
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);

    const broadcastCount = (io._toEmitted['lobby'] || []).filter(e => e.event === 'lobby:online_patch').length;
    // 12 events with no debounce at all would be 12 broadcasts; the old
    // 300ms window reduced that by well under half at this pace. The 1.5s
    // window should coalesce nearly all of them into very few broadcasts.
    expect(broadcastCount).toBeLessThanOrEqual(3);
    expect(broadcastCount).toBeGreaterThan(0);
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

  test('a reconnect of the same tab (auth.reconnect flag) evicts the stale socket silently, without a session:kicked notice', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);
    expect(sessions.get('u1')).toBe(a);

    // Same browser tab, socket.io internal reconnect after a transient
    // network drop (ping timeout / transport close) — the client flags this
    // via auth.reconnect (see socket-client.js reconnect_attempt listener).
    const b = makeSocket(io, 'sockB', 'u1', 'Alice', { reconnect: true });
    connectSocket(io, b);

    expect(sockEmit(a, 'session:kicked')).toBeUndefined();
    expect(a.disconnect).toHaveBeenCalledWith(true);
    expect(sessions.get('u1')).toBe(b);
  });

  test('a genuine second-device login (no reconnect flag) still emits session:kicked to the first socket', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);

    const b = makeSocket(io, 'sockB', 'u1', 'Alice');
    connectSocket(io, b);

    expect(sockEmit(a, 'session:kicked')).toBeDefined();
    expect(a.disconnect).toHaveBeenCalledWith(true);
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

describe('SocketHandler — connection with no surviving room (restart-hang)', () => {
  /** A connection that replaces an earlier one — the client sets this auth flag. */
  const RECONNECT = { reconnect: true };

  test('a reconnect whose room no longer exists is told, instead of being left waiting', () => {
    const io = makeIo();
    init(io);

    // Default mockRoomManager.getRoomByUser returns null — i.e. the room the
    // client was in is gone (server restarted, or idle cleanup ran).
    const a = makeSocket(io, 'sockA', 'u1', 'Alice', RECONNECT);
    connectSocket(io, a);

    const destroyed = sockEmit(a, 'room:destroyed');
    expect(destroyed).toBeDefined();
    expect(typeof destroyed.data.message).toBe('string');
    expect(sockEmit(a, 'room:joined')).toBeUndefined();
  });

  // #367: a room page whose user lost their place while offline (seat grace ran
  // out, or was removed) sends the room it shows; the server puts them back in.
  test('a reconnect naming a room that still exists rejoins it silently instead of ROOM_GONE (#367)', () => {
    const io = makeIo();
    init(io);
    const room = { roomId: 'MLC', gameState: null, users: new Map(), memberIds: new Set(['u1']) };
    mockRoomManager.getRoom.mockImplementation((id) => (id === 'MLC' ? room : null));
    mockRoomManager.joinRoom = jest.fn(() => ({ room }));
    mockRoomManager.serializeRoom = jest.fn(() => ({ roomId: 'MLC' }));

    const a = makeSocket(io, 'sockA', 'u1', 'Alice', { reconnect: true, roomId: 'MLC' });
    connectSocket(io, a);

    expect(mockRoomManager.joinRoom).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), 'MLC');
    expect(a.join).toHaveBeenCalledWith('MLC');
    expect(sockEmit(a, 'room:joined')).toBeDefined();
    expect(sockEmit(a, 'room:destroyed')).toBeUndefined();
    // Silent: nobody gets a "đã vào phòng" chat line.
    expect((io._toEmitted.MLC || []).some(e => e.event === 'chat:message')).toBe(false);
    mockRoomManager.getRoom.mockReset().mockReturnValue(null);
  });

  test.each([
    ['the room is gone', null, {}],
    ['the user was kicked from it', { kicked: true }, {}],
    ['the user was never a member (arbitrary roomId)', { stranger: true }, {}],
    ['joinRoom refuses (full)', {}, { error: 'full', code: 'ROOM_FULL' }],
  ])('a reconnect naming a room still gets ROOM_GONE when %s (#367)', (_label, roomShape, joinResult) => {
    const io = makeIo();
    init(io);
    const room = roomShape && {
      roomId: 'MLC', gameState: null, users: new Map(),
      memberIds: new Set(roomShape.kicked || roomShape.stranger ? [] : ['u1']),
    };
    mockRoomManager.getRoom.mockImplementation((id) => (id === 'MLC' ? room : null));
    mockRoomManager.joinRoom = jest.fn(() => (joinResult.error ? joinResult : { room }));

    const a = makeSocket(io, 'sockA', 'u1', 'Alice', { reconnect: true, roomId: 'MLC' });
    connectSocket(io, a);

    expect(sockEmit(a, 'room:destroyed')).toBeDefined();
    expect(sockEmit(a, 'room:joined')).toBeUndefined();
    if (roomShape && (roomShape.kicked || roomShape.stranger)) expect(mockRoomManager.joinRoom).not.toHaveBeenCalled();
    mockRoomManager.getRoom.mockReset().mockReturnValue(null);
  });

  test('a FIRST connect naming a room does not auto-join it — only reconnects do (#367)', () => {
    const io = makeIo();
    init(io);
    mockRoomManager.joinRoom = jest.fn();
    const a = makeSocket(io, 'sockA', 'u1', 'Alice', { roomId: 'MLC' });
    connectSocket(io, a);
    expect(mockRoomManager.joinRoom).not.toHaveBeenCalled();
    expect(sockEmit(a, 'room:destroyed')).toBeUndefined();
  });

  test('a FIRST connect is never told the room is gone — it has not asked for one yet', () => {
    // Regression guard: the room page opens a socket *before* it sends
    // room:create / room:join, so a roomless first connect is the normal case,
    // not a lost room. Emitting here bounced every visitor straight back to
    // the lobby and destroyed the room they were creating.
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice'); // no auth.reconnect
    connectSocket(io, a);

    expect(sockEmit(a, 'room:destroyed')).toBeUndefined();
  });

  test('an absent handshake/auth object is treated as a first connect, not a reconnect', () => {
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    delete a.handshake;
    connectSocket(io, a);

    expect(sockEmit(a, 'room:destroyed')).toBeUndefined();
  });

  test('a reconnect whose room still exists gets room:joined and no room:destroyed', () => {
    const io = makeIo();
    init(io);

    mockRoomManager.getRoomByUser.mockReturnValueOnce({
      roomId: 'r1', gameState: null, users: new Map([['u1', { userId: 'u1', presence: 'active' }]]),
    });
    mockRoomManager.serializeRoom = jest.fn(() => ({ roomId: 'r1' }));

    const a = makeSocket(io, 'sockA', 'u1', 'Alice', RECONNECT);
    connectSocket(io, a);

    expect(sockEmit(a, 'room:joined')).toBeDefined();
    expect(sockEmit(a, 'room:destroyed')).toBeUndefined();
    expect(a.join).toHaveBeenCalledWith('r1');
  });

  // #373: a member of a room connecting from ANOTHER page (lobby, home…) is not watching the table.
  test.each([
    // [case, auth, presence before, presence after]
    ['other page, was disconnected', {}, 'disconnected', 'away'],
    ['other page, was active', {}, 'active', 'away'],
    ['other page reconnect naming no room', { reconnect: true }, 'active', 'away'],
    ['room page of a different room', { reconnect: true, roomId: 'r2' }, 'active', 'away'],
    ['room page reconnect, was disconnected', { reconnect: true, roomId: 'r1' }, 'disconnected', 'active'],
    ['room page reconnect, was away', { reconnect: true, roomId: 'r1' }, 'away', 'away'],
  ])('room member connect: %s → %s', (_c, auth, before, after) => {
    const io = makeIo();
    init(io);
    const me = { userId: 'u1', presence: before };
    mockRoomManager.getRoomByUser.mockReturnValueOnce({ roomId: 'r1', gameState: null, users: new Map([['u1', me]]) });
    mockRoomManager.serializeRoom = jest.fn(() => ({ roomId: 'r1' }));
    const a = makeSocket(io, 'sockA', 'u1', 'Alice', auth);
    connectSocket(io, a);
    expect(me.presence).toBe(after);
    expect(!!(a.data && a.data.roomPageId === 'r1')).toBe(auth.roomId === 'r1');
  });

  test('a reconnect that resumes a disconnect-grace game is not told the room is gone', () => {
    const DisconnectHandler = require('../socket/handlers/DisconnectHandler');
    DisconnectHandler.cancelDisconnectGrace.mockReturnValueOnce(true);

    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice', RECONNECT);
    connectSocket(io, a);

    expect(sockEmit(a, 'room:destroyed')).toBeUndefined();
    expect(mockRoomManager.getRoomByUser).not.toHaveBeenCalled();
  });

  // TODO.md #42 / instruction.md §42: the DisconnectHandler unit tests only
  // ever call cancelEmptyRoomGrace() directly, so they can't catch the call
  // site here in SocketHandler.js being dropped — confirmed by a mutation
  // check that removed this call site alone (leaving cancelEmptyRoomGrace()
  // itself intact) and re-ran the full suite: 393/393 still green. This test
  // asserts the call site itself, and its ordering relative to the rejoin
  // checks, so that same mutation now fails here.
  test('every connection cancels any pending empty-room/spectator grace for the user before the rejoin checks run', () => {
    const DisconnectHandler = require('../socket/handlers/DisconnectHandler');
    const io = makeIo();
    init(io);

    const a = makeSocket(io, 'sockA', 'u1', 'Alice');
    connectSocket(io, a);

    expect(DisconnectHandler.cancelEmptyRoomGrace).toHaveBeenCalledWith('u1');
    expect(DisconnectHandler.cancelSpectatorGrace).toHaveBeenCalledWith('u1');

    const graceCallOrder = DisconnectHandler.cancelEmptyRoomGrace.mock.invocationCallOrder[0];
    const spectatorGraceCallOrder = DisconnectHandler.cancelSpectatorGrace.mock.invocationCallOrder[0];
    const rejoinCheckCallOrder = mockRoomManager.getRoomByUser.mock.invocationCallOrder[0];

    expect(graceCallOrder).toBeLessThan(rejoinCheckCallOrder);
    expect(spectatorGraceCallOrder).toBeLessThan(rejoinCheckCallOrder);
  });
});

// #372 review: SocketHandler wires two different "online" predicates — they must not both be presence.
describe('presence hooks wiring (#372 review)', () => {
  const state = require('../socket/state');
  let challengeHooks, dmHooks;
  beforeAll(() => {
    const Challenge = require('../managers/ChallengeService');
    const Dm = require('../managers/DmService');
    const c = jest.spyOn(Challenge, 'setHooks');
    const d = jest.spyOn(Dm, 'setHooks');
    init(makeIo());
    challengeHooks = c.mock.calls.at(-1)[0];
    dmHooks = d.mock.calls.at(-1)[0];
    c.mockRestore(); d.mockRestore();
  });
  beforeEach(() => { sessions.clear(); state.awayUsers.clear(); state.heartbeats.clear(); });
  afterAll(() => { sessions.clear(); state.awayUsers.clear(); state.heartbeats.clear(); });
  const u = { userId: 'p1', displayName: 'P1', isGuest: false };

  test('challenge seat check = has a socket: an AWAY room tab keeps its seat', () => {
    sessions.set('p1', { user: u });
    state.awayUsers.add('p1');
    expect(challengeHooks.isOnline('p1')).toBe(true);
  });

  test('challenge seat check: a heartbeat from a socket-less page is not a socket in the room', () => {
    state.heartbeats.set('p1', { at: Date.now(), away: false, user: u });
    expect(challengeHooks.isOnline('p1')).toBe(false);
  });

  test('DM live-push = a visible socket: heartbeat-only or away recipient gets the bell entry', () => {
    state.heartbeats.set('p1', { at: Date.now(), away: false, user: u });
    expect(dmHooks.isOnline('p1')).toBe(false);
    sessions.set('p1', { user: u });
    expect(dmHooks.isOnline('p1')).toBe(true);
    state.awayUsers.add('p1');
    expect(dmHooks.isOnline('p1')).toBe(false);
    expect(dmHooks.hasSocket('p1')).toBe(true); // away tab still gets the live push
  });
});
