'use strict';

/**
 * room-update-delta.test.js — Unit tests for the room:updated delta broadcast
 * in server/socket/state.js (broadcastRoomUpdate).
 *
 * The real state.js is used here, not a mock — same approach as
 * lobby-delta.test.js, which this mirrors. Only RoomManager is mocked, so
 * serializeRoomUpdate() can be driven call by call to simulate a room's state
 * changing over time (a user sitting down, going ready, leaving, etc.)
 * without needing a real GameEngine/RoomManager instance.
 *
 * broadcastRoomUpdate() is now debounced per-room (ROOM_UPDATE_DEBOUNCE_MS in
 * state.js, TODO.md #22) — same coalescing technique as
 * broadcastLobbyUpdate()/broadcastOnlineUsers(), just scoped per roomId
 * instead of server-wide. Every test below drives the debounce explicitly via
 * flush(), mirroring lobby-delta.test.js's own flush() helper.
 */

jest.useFakeTimers();

const DEBOUNCE_MS = 80;

let currentFullState;

const mockRoomManager = {
  on: jest.fn(),
  getRoom: jest.fn((roomId) => ({ roomId })),
  serializeRoomUpdate: jest.fn(() => currentFullState),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { broadcastRoomUpdate, clearRoomUpdateSnapshot } = require('../socket/state');

/** Minimal user entry, matching RoomManager.serializeRoom()'s per-user shape. */
function user(userId, overrides = {}) {
  return {
    userId,
    displayName: userId,
    isGuest: true,
    slot: null,
    ready: false,
    role: 'guest',
    ...overrides,
  };
}

/** Full state RoomManager.serializeRoomUpdate() would return for a room. */
function fullState(overrides = {}) {
  return {
    roomName: 'Phòng Test',
    hostId: 'host-1',
    hostName: 'Host',
    users: [user('host-1', { role: 'host' })],
    state: 'idle',
    readyDeadline: null,
    scoreTable: {},
    ...overrides,
  };
}

/** io double that records every emit to a given room. */
function makeIo() {
  const io = {
    emitted: [],
    to: jest.fn(room => ({
      emit: (event, data) => io.emitted.push({ room, event, data }),
    })),
  };
  return io;
}

function lastPayload(io) {
  return io.emitted[io.emitted.length - 1].data;
}

/** Run a broadcast and let the debounce window elapse. */
function flush(io, room, opts) {
  broadcastRoomUpdate(io, room, opts);
  jest.advanceTimersByTime(DEBOUNCE_MS);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoomManager.getRoom.mockImplementation((roomId) => ({ roomId }));
});

describe('broadcastRoomUpdate — users delta', () => {
  test('first broadcast for a room upserts every current user, with no removed', () => {
    const io = makeIo();
    currentFullState = fullState({
      users: [user('host-1', { role: 'host' }), user('guest-1')],
    });

    flush(io, { roomId: 'r1' });

    const payload = lastPayload(io);
    expect(payload.users.upserts.map(u => u.userId).sort()).toEqual(['guest-1', 'host-1']);
    expect(payload.users.removed).toEqual([]);
  });

  test('a second broadcast with no user changes omits `users` entirely', () => {
    const io = makeIo();
    currentFullState = fullState({ users: [user('host-1', { role: 'host' })] });
    flush(io, { roomId: 'r1' });

    io.emitted.length = 0; // clear, only inspect the second broadcast
    flush(io, { roomId: 'r1' }); // same state again

    expect(lastPayload(io)).not.toHaveProperty('users');
  });

  test('only the user whose fields actually changed appears in upserts', () => {
    const io = makeIo();
    currentFullState = fullState({
      users: [user('host-1', { role: 'host', slot: 1 }), user('guest-1', { slot: 2 })],
    });
    flush(io, { roomId: 'r1' });

    io.emitted.length = 0;
    // Only guest-1 flips ready — host-1's entry is byte-for-byte identical.
    currentFullState = fullState({
      users: [user('host-1', { role: 'host', slot: 1 }), user('guest-1', { slot: 2, ready: true })],
    });
    flush(io, { roomId: 'r1' });

    const payload = lastPayload(io);
    expect(payload.users.upserts.map(u => u.userId)).toEqual(['guest-1']);
    expect(payload.users.removed).toEqual([]);
  });

  test('a user leaving appears in `removed`, not in `upserts`, and does not affect others', () => {
    const io = makeIo();
    currentFullState = fullState({
      users: [user('host-1', { role: 'host' }), user('guest-1')],
    });
    flush(io, { roomId: 'r1' });

    io.emitted.length = 0;
    currentFullState = fullState({ users: [user('host-1', { role: 'host' })] });
    flush(io, { roomId: 'r1' });

    const payload = lastPayload(io);
    expect(payload.users.removed).toEqual(['guest-1']);
    expect(payload.users.upserts).toEqual([]);
  });

  test('a host handover shows up as both the old and new host changing role', () => {
    const io = makeIo();
    currentFullState = fullState({
      hostId: 'host-1',
      users: [user('host-1', { role: 'host' }), user('guest-1', { role: 'guest' })],
    });
    flush(io, { roomId: 'r1' });

    io.emitted.length = 0;
    // host-1 left, guest-1 is promoted — RoomManager would recompute role for
    // every remaining user; simulated here by handing back the new roles.
    currentFullState = fullState({
      hostId: 'guest-1',
      users: [user('guest-1', { role: 'host' })],
    });
    flush(io, { roomId: 'r1' });

    const payload = lastPayload(io);
    expect(payload.users.removed).toEqual(['host-1']);
    expect(payload.users.upserts).toEqual([expect.objectContaining({ userId: 'guest-1', role: 'host' })]);
    expect(payload.hostId).toBe('guest-1');
  });

  test('rooms are diffed independently — one room changing does not affect another', () => {
    const io = makeIo();
    currentFullState = fullState({ users: [user('host-1', { role: 'host' })] });
    flush(io, { roomId: 'r1' });
    currentFullState = fullState({ users: [user('host-2', { role: 'host' })] });
    flush(io, { roomId: 'r2' });

    io.emitted.length = 0;
    // r1 unchanged, r2 gains a guest.
    currentFullState = fullState({ users: [user('host-1', { role: 'host' })] });
    flush(io, { roomId: 'r1' });
    currentFullState = fullState({
      users: [user('host-2', { role: 'host' }), user('guest-2')],
    });
    flush(io, { roomId: 'r2' });

    expect(io.emitted[0].data).not.toHaveProperty('users'); // r1: nothing changed
    expect(io.emitted[1].data.users.upserts.map(u => u.userId)).toEqual(['guest-2']); // r2: only the new guest
  });
});

describe('broadcastRoomUpdate — scoreTable delta', () => {
  test('unchanged scoreTable is omitted from the second broadcast', () => {
    const io = makeIo();
    currentFullState = fullState({ scoreTable: { 'host-1': { win: 1, loss: 0, draw: 0 } } });
    flush(io, { roomId: 'r1' });

    io.emitted.length = 0;
    flush(io, { roomId: 'r1' }); // same scoreTable again

    expect(lastPayload(io)).not.toHaveProperty('scoreTable');
  });

  test('a changed scoreTable is included in full', () => {
    const io = makeIo();
    currentFullState = fullState({ scoreTable: { 'host-1': { win: 0, loss: 0, draw: 0 } } });
    flush(io, { roomId: 'r1' });

    io.emitted.length = 0;
    currentFullState = fullState({ scoreTable: { 'host-1': { win: 1, loss: 0, draw: 0 } } });
    flush(io, { roomId: 'r1' });

    expect(lastPayload(io).scoreTable).toEqual({ 'host-1': { win: 1, loss: 0, draw: 0 } });
  });
});

describe('broadcastRoomUpdate — scalar fields and settings', () => {
  test('scalar fields (roomName, hostId, hostName, state, readyDeadline) are always included', () => {
    const io = makeIo();
    currentFullState = fullState();
    flush(io, { roomId: 'r1' });

    io.emitted.length = 0;
    flush(io, { roomId: 'r1' }); // nothing changed at all

    const payload = lastPayload(io);
    expect(payload.roomName).toBe('Phòng Test');
    expect(payload.hostId).toBe('host-1');
    expect(payload.hostName).toBe('Host');
    expect(payload.state).toBe('idle');
    expect(payload.readyDeadline).toBe(null);
  });

  test('settings is omitted unless explicitly requested', () => {
    const io = makeIo();
    currentFullState = fullState();
    mockRoomManager.getRoom.mockImplementation((roomId) => ({ roomId, settings: { boardSize: 19 } }));
    flush(io, { roomId: 'r1', settings: { boardSize: 19 } });

    expect(lastPayload(io)).not.toHaveProperty('settings');
  });

  test('settings is included, in full, when { settings: true } is passed', () => {
    const io = makeIo();
    currentFullState = fullState();
    mockRoomManager.getRoom.mockImplementation((roomId) => ({ roomId, settings: { boardSize: 19 } }));
    flush(io, { roomId: 'r1', settings: { boardSize: 19 } }, { settings: true });

    expect(lastPayload(io).settings).toEqual({ boardSize: 19 });
  });
});

describe('broadcastRoomUpdate — debounce', () => {
  test('a burst of calls for the same room produces a single room:updated emit', () => {
    const io = makeIo();
    currentFullState = fullState({ users: [user('host-1', { role: 'host' })] });

    broadcastRoomUpdate(io, { roomId: 'r1' });
    broadcastRoomUpdate(io, { roomId: 'r1' });
    broadcastRoomUpdate(io, { roomId: 'r1' });
    expect(io.emitted).toHaveLength(0);

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(1);
  });

  test('a burst schedules exactly one timer per room, not one per call', () => {
    const io = makeIo();
    currentFullState = fullState();

    const before = jest.getTimerCount();
    broadcastRoomUpdate(io, { roomId: 'r1' });
    broadcastRoomUpdate(io, { roomId: 'r1' });
    broadcastRoomUpdate(io, { roomId: 'r1' });
    expect(jest.getTimerCount() - before).toBe(1);

    jest.advanceTimersByTime(DEBOUNCE_MS);
  });

  test('bursts for different rooms flush independently, one timer each', () => {
    const io = makeIo();
    currentFullState = fullState();

    const before = jest.getTimerCount();
    broadcastRoomUpdate(io, { roomId: 'r1' });
    broadcastRoomUpdate(io, { roomId: 'r2' });
    expect(jest.getTimerCount() - before).toBe(2);

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted.map(e => e.room).sort()).toEqual(['r1', 'r2']);
  });

  test('a settings:true call inside a burst is not lost by a later call in the same burst omitting it', () => {
    const io = makeIo();
    currentFullState = fullState();
    mockRoomManager.getRoom.mockImplementation((roomId) => ({ roomId, settings: { boardSize: 19 } }));

    broadcastRoomUpdate(io, { roomId: 'r1' }, { settings: true });
    broadcastRoomUpdate(io, { roomId: 'r1' }); // same burst, no settings flag this time
    jest.advanceTimersByTime(DEBOUNCE_MS);

    expect(lastPayload(io).settings).toEqual({ boardSize: 19 });
  });

  test('nothing is sent before the window elapses', () => {
    const io = makeIo();
    currentFullState = fullState();

    broadcastRoomUpdate(io, { roomId: 'r1' });
    jest.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(io.emitted).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(io.emitted).toHaveLength(1);
  });

  test('a room destroyed before its debounce window elapses is skipped, not broadcast stale', () => {
    const io = makeIo();
    currentFullState = fullState();

    broadcastRoomUpdate(io, { roomId: 'r1' });
    mockRoomManager.getRoom.mockImplementation(() => null); // torn down mid-window
    jest.advanceTimersByTime(DEBOUNCE_MS);

    expect(io.emitted).toHaveLength(0);
  });
});

describe('clearRoomUpdateSnapshot', () => {
  test('resets the diff baseline, so the next broadcast upserts every current user again', () => {
    const io = makeIo();
    currentFullState = fullState({ users: [user('host-1', { role: 'host' })] });
    flush(io, { roomId: 'r1' });

    clearRoomUpdateSnapshot('r1');

    io.emitted.length = 0;
    flush(io, { roomId: 'r1' }); // same state, but baseline was cleared

    expect(lastPayload(io).users.upserts.map(u => u.userId)).toEqual(['host-1']);
  });

  test('clearing one room does not disturb another room\'s baseline', () => {
    const io = makeIo();
    currentFullState = fullState({ users: [user('host-1', { role: 'host' })] });
    flush(io, { roomId: 'r1' });
    currentFullState = fullState({ users: [user('host-2', { role: 'host' })] });
    flush(io, { roomId: 'r2' });

    clearRoomUpdateSnapshot('r1');

    io.emitted.length = 0;
    flush(io, { roomId: 'r2' }); // unaffected by r1's clear

    expect(lastPayload(io)).not.toHaveProperty('users');
  });

  test('cancels a pending debounced flush for that room, so it never fires after teardown', () => {
    const io = makeIo();
    currentFullState = fullState();

    broadcastRoomUpdate(io, { roomId: 'r1' }); // schedules a flush, does not fire yet
    clearRoomUpdateSnapshot('r1');
    jest.advanceTimersByTime(DEBOUNCE_MS);

    expect(io.emitted).toHaveLength(0);
  });
});
