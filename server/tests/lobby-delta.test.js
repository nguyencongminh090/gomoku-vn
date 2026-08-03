'use strict';

/**
 * lobby-delta.test.js — Unit tests for the lobby delta broadcast in
 * server/socket/state.js.
 *
 * The real state.js is used here, not a mock. Both existing suites that touch
 * it (LobbyHandler.test.js, DisconnectHandler.test.js) `jest.mock` the module
 * wholesale, so until now none of this logic was covered by anything.
 *
 * Only RoomManager is mocked, so listRooms() can be driven room by room.
 */

jest.useFakeTimers();

const mockRoomManager = {
  on: jest.fn(),
  listRooms: jest.fn(() => []),
  getRoom: jest.fn(),
  bothSeated: jest.fn(() => false),
  serializeRoomUpdate: jest.fn(room => ({ roomId: room.roomId })),
  registerReadyMiss: jest.fn(() => ({ kicked: null, missCount: 0 })),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { broadcastLobbyUpdate, sendLobbySnapshot } = require('../socket/state');

const DEBOUNCE_MS = 300;

/** Minimal room-list entry, matching RoomManager.listRooms()'s shape. */
function entry(roomId, overrides = {}) {
  return {
    roomId,
    roomName: `Phòng ${roomId}`,
    hostName: 'Host',
    playerCount: 0,
    userCount: 1,
    state: 'idle',
    boardSize: 17,
    ruleWall: true,
    rulePortal: false,
    winningRule: 'freestyle',
    ruleSwap2: false,
    timerMode: 'per_move',
    timerSeconds: 60,
    timerIncrementSeconds: 0,
    ...overrides,
  };
}

/** Fresh io double. A new object per test also means a fresh delta baseline. */
function makeIo() {
  const io = {
    emitted: [],
    to: jest.fn(room => ({
      emit: (event, data) => io.emitted.push({ room, event, data }),
    })),
  };
  return io;
}

function makeSocket() {
  const socket = { emitted: [], emit: (event, data) => socket.emitted.push({ event, data }) };
  return socket;
}

/** Run a broadcast and let the debounce window elapse. */
function flush(io) {
  broadcastLobbyUpdate(io);
  jest.advanceTimersByTime(DEBOUNCE_MS);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoomManager.listRooms.mockReturnValue([]);
});

describe('lobby delta — a new room', () => {
  test('is sent as a full entry, not just an id', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);

    flush(io);

    expect(io.emitted).toHaveLength(1);
    const { event, data, room } = io.emitted[0];
    expect(room).toBe('lobby');
    expect(event).toBe('lobby:patch');
    expect(data.upserts).toHaveLength(1);
    expect(data.upserts[0]).toEqual(entry('#AAA'));
    expect(data.removed).toEqual([]);
  });
});

describe('lobby delta — a changed room', () => {
  test('only the room that changed is sent', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB'), entry('#CCC')]);
    flush(io);
    io.emitted.length = 0;

    // Someone sits down in #BBB only.
    mockRoomManager.listRooms.mockReturnValue([
      entry('#AAA'), entry('#BBB', { playerCount: 1 }), entry('#CCC'),
    ]);
    flush(io);

    expect(io.emitted).toHaveLength(1);
    const { data } = io.emitted[0];
    expect(data.upserts).toHaveLength(1);
    expect(data.upserts[0].roomId).toBe('#BBB');
    expect(data.upserts[0].playerCount).toBe(1);
    expect(data.removed).toEqual([]);
  });

  test('the patch is much smaller than the full list it replaces', () => {
    const io = makeIo();
    const many = Array.from({ length: 10 }, (_, i) => entry(`#R${i}`));
    mockRoomManager.listRooms.mockReturnValue(many);
    flush(io);
    io.emitted.length = 0;

    const changed = many.map((r, i) => (i === 3 ? { ...r, playerCount: 2 } : r));
    mockRoomManager.listRooms.mockReturnValue(changed);
    flush(io);

    const patchSize = JSON.stringify(io.emitted[0].data).length;
    const fullListSize = JSON.stringify({ rooms: changed }).length;
    expect(patchSize).toBeLessThan(fullListSize / 5);
  });
});

describe('lobby delta — a destroyed room', () => {
  test('is sent as a removal, carrying only its id', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB')]);
    flush(io);
    io.emitted.length = 0;

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    flush(io);

    expect(io.emitted).toHaveLength(1);
    const { data } = io.emitted[0];
    expect(data.removed).toEqual(['#BBB']);
    expect(data.upserts).toEqual([]);
  });

  test('a room that is destroyed and recreated with the same id is upserted, not left removed', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    flush(io);
    io.emitted.length = 0;

    // Gone and back with different contents inside one window.
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { hostName: 'Someone Else' })]);
    flush(io);

    const { data } = io.emitted[0];
    expect(data.removed).toEqual([]);
    expect(data.upserts[0].hostName).toBe('Someone Else');
  });
});

describe('lobby delta — no change', () => {
  test('nothing is emitted at all when the room list is identical', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    flush(io);
    io.emitted.length = 0;

    flush(io); // same state, called again
    expect(io.emitted).toHaveLength(0);
  });

  test('an empty lobby that stays empty emits nothing', () => {
    const io = makeIo();
    flush(io);
    expect(io.emitted).toHaveLength(0);
  });
});

describe('lobby delta — debounce', () => {
  test('a burst of calls produces one patch, carrying the net change', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    flush(io);
    io.emitted.length = 0;

    // Three mutations land inside one window; only the final state matters.
    broadcastLobbyUpdate(io);
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { playerCount: 1 })]);
    broadcastLobbyUpdate(io);
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { playerCount: 2 })]);
    broadcastLobbyUpdate(io);
    jest.advanceTimersByTime(DEBOUNCE_MS);

    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data.upserts).toHaveLength(1);
    expect(io.emitted[0].data.upserts[0].playerCount).toBe(2);
  });

  test('a later, separate call gets its own independent broadcast', () => {
    // Second half of the scenario from backend fix #12 (docs/fix-log.md): a
    // burst collapses to one broadcast, but a call arriving after that window
    // must not be swallowed by it.
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    flush(io);
    expect(io.emitted).toHaveLength(1);

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB')]);
    flush(io);

    expect(io.emitted).toHaveLength(2);
    expect(io.emitted[1].data.upserts.map(r => r.roomId)).toEqual(['#BBB']);
  });

  test('four changes inside one window collapse into a single broadcast', () => {
    // Stronger than counting calls: the room list changes between each call,
    // so without the debounce guard each would flush its own distinct patch.
    // This is what actually fails if the coalescing is removed — with the
    // delta in place, repeated calls over *unchanged* state emit nothing
    // anyway and would not notice.
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    flush(io);
    io.emitted.length = 0;

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB')]);
    broadcastLobbyUpdate(io);
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB'), entry('#CCC')]);
    broadcastLobbyUpdate(io);
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB'), entry('#CCC'), entry('#DDD')]);
    broadcastLobbyUpdate(io);
    mockRoomManager.listRooms.mockReturnValue([
      entry('#AAA', { playerCount: 1 }), entry('#BBB'), entry('#CCC'), entry('#DDD'),
    ]);
    broadcastLobbyUpdate(io);

    jest.advanceTimersByTime(DEBOUNCE_MS);

    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data.upserts.map(r => r.roomId).sort())
      .toEqual(['#AAA', '#BBB', '#CCC', '#DDD']);
  });

  test('a burst schedules exactly one timer, not one per call', () => {
    // What the debounce guard still guarantees after the delta landed.
    //
    // Worth stating plainly, because it is easy to over-claim here: with the
    // delta in place, *removing* the guard no longer changes how many packets
    // go out. Extra flushes over unchanged state diff to nothing and emit
    // nothing, so packet count alone cannot detect the regression. What the
    // guard still prevents is a timer per call — 15 call sites firing during
    // one busy moment would otherwise queue 15 timeouts, each re-running
    // listRooms() and a full diff.
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);

    const before = jest.getTimerCount();
    broadcastLobbyUpdate(io);
    broadcastLobbyUpdate(io);
    broadcastLobbyUpdate(io);
    broadcastLobbyUpdate(io);

    expect(jest.getTimerCount() - before).toBe(1);

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(1);
  });

  test('four calls in one tick produce zero immediate emissions and exactly one after the window', () => {
    // The review's 4-packets-to-1 scenario, as reproduced when fix #12 was made.
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);

    broadcastLobbyUpdate(io);
    broadcastLobbyUpdate(io);
    broadcastLobbyUpdate(io);
    broadcastLobbyUpdate(io);
    expect(io.emitted).toHaveLength(0);

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(1);
  });

  test('nothing is sent before the window elapses', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);

    broadcastLobbyUpdate(io);
    jest.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(io.emitted).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(io.emitted).toHaveLength(1);
  });
});

describe('lobby snapshot — a client joining mid-stream', () => {
  test('receives the full list, not a patch', () => {
    const io = makeIo();
    const socket = makeSocket();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB')]);

    sendLobbySnapshot(io, socket);

    expect(socket.emitted).toHaveLength(1);
    expect(socket.emitted[0].event).toBe('lobby:update');
    expect(socket.emitted[0].data.rooms).toHaveLength(2);
  });

  test('a later change reaches it as a patch it can apply to that snapshot', () => {
    const io = makeIo();
    const socket = makeSocket();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    sendLobbySnapshot(io, socket);

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB')]);
    flush(io);

    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data.upserts.map(r => r.roomId)).toEqual(['#BBB']);
  });

  test('the snapshot does not clobber an existing baseline mid-stream', () => {
    // A second viewer subscribing must not make the server think everyone is
    // caught up — the baseline tracks what the lobby room as a whole was sent.
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    flush(io);
    io.emitted.length = 0;

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { playerCount: 1 })]);
    sendLobbySnapshot(io, makeSocket());
    flush(io);

    // The change still goes out to the lobby, even though a snapshot was sent
    // in between.
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data.upserts[0].playerCount).toBe(1);
  });
});

describe('lobby delta — client-side replay', () => {
  // Mirrors what client/js/lobby.js does: keep a Map, apply removals then
  // upserts. Proves a client fed snapshot + patches ends up matching the
  // server exactly, which is what "the list is wrong until F5" would violate.
  function applyPatch(map, patch) {
    for (const roomId of patch.removed || []) map.delete(roomId);
    for (const room of patch.upserts || []) map.set(room.roomId, room);
    return map;
  }

  test('snapshot plus a sequence of patches reproduces the server list exactly', () => {
    const io = makeIo();
    const socket = makeSocket();

    const states = [
      [entry('#AAA')],
      [entry('#AAA'), entry('#BBB')],
      [entry('#AAA', { playerCount: 2, state: 'playing' }), entry('#BBB')],
      [entry('#BBB')],                                   // #AAA destroyed
      [entry('#BBB'), entry('#CCC'), entry('#DDD')],
      [entry('#CCC', { userCount: 9 })],                  // two more destroyed
    ];

    mockRoomManager.listRooms.mockReturnValue(states[0]);
    sendLobbySnapshot(io, socket);
    const client = new Map(socket.emitted[0].data.rooms.map(r => [r.roomId, r]));

    for (const state of states.slice(1)) {
      io.emitted.length = 0;
      mockRoomManager.listRooms.mockReturnValue(state);
      flush(io);
      if (io.emitted.length) applyPatch(client, io.emitted[0].data);
    }

    expect(Array.from(client.values())).toEqual(states[states.length - 1]);
  });

  test('a client that applies a patch twice still matches (patches are idempotent)', () => {
    const io = makeIo();
    const socket = makeSocket();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA')]);
    sendLobbySnapshot(io, socket);
    const client = new Map(socket.emitted[0].data.rooms.map(r => [r.roomId, r]));

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA'), entry('#BBB')]);
    flush(io);
    const patch = io.emitted[0].data;

    applyPatch(client, patch);
    applyPatch(client, patch);

    expect(Array.from(client.keys())).toEqual(['#AAA', '#BBB']);
  });
});
