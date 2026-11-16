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
  // #382: the diff reads raw rooms (rooms / getRoom / lobbyStat) and builds entries with lobbyEntry.
  // Here a "room" IS its lobby entry, so every test keeps driving the list through listRooms().
  get rooms() { return new Map(mockRoomManager.listRooms().map((e) => [e.roomId, e])); },
  getRoom: jest.fn((id) => mockRoomManager.listRooms().find((e) => e.roomId === id)),
  lobbyEntry: jest.fn((room) => room),
  lobbyStat: jest.fn((room) => ({ state: room.state, playerCount: room.playerCount || 0, userCount: room.userCount || 0 })),
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

// B225: every lobby change also pokes the dashboard feed — its own timer, tested in home-feed.test.js.
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn() }));

const LobbyMoves = require('../../client/js/lobby-moves');
const { broadcastLobbyUpdate, sendLobbySnapshot, scheduleLobbyBoardUpdate, LOBBY_BOARD_THROTTLE_MS, LOBBY_ROOM_PAGE_SIZE: PAGE, queryLobbyRooms } = require('../socket/state');
const homeFeed = require('../socket/home-feed');

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

test('broadcastLobbyUpdate pokes the home feed (B225: playing count + live list)', () => {
  homeFeed.scheduleHomeUpdate.mockClear();
  const io = { to: () => ({ emit: () => {} }) };
  broadcastLobbyUpdate(io);
  expect(homeFeed.scheduleHomeUpdate).toHaveBeenCalledWith(io);
});

describe('lobby mini-board throttle (#364)', () => {
  test('a burst of moves yields one patch after the throttle window, with only the moved room', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [7, 7] }), entry('#BBB')]);
    flush(io);
    io.emitted.length = 0;

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [7, 7, 8, 8, 6, 6] }), entry('#BBB')]);
    for (let i = 0; i < 5; i++) scheduleLobbyBoardUpdate(io); // five moves
    jest.advanceTimersByTime(LOBBY_BOARD_THROTTLE_MS - 1);
    expect(io.emitted).toHaveLength(0); // nothing per move
    jest.advanceTimersByTime(1 + DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data.upserts.map((r) => r.roomId)).toEqual(['#AAA']);
  });

  // #389: one move can land anywhere in the board window; its card must update within 1 s either way
  // (was 0.3–2.8 s: 2.5 s window + the 300 ms seat debounce on top).
  const BOUND_MS = 1000;
  /** ms from now until a lobby:patch carrying `roomId` is emitted (stepping fake time 10 ms). */
  function msUntilPatchFor(io, roomId, limit = 5000) {
    for (let t = 0; t <= limit; t += 10) {
      if (io.emitted.some((e) => e.event === 'lobby:patch' && e.data.upserts.some((r) => r.roomId === roomId))) return t;
      jest.advanceTimersByTime(10);
    }
    return Infinity;
  }
  test.each([0, 10, 500, 990])('a move %i ms into an open window reaches the lobby within 1 s', (offset) => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [7, 7] }), entry('#BBB', { moves: [3, 3] })]);
    flush(io);
    io.emitted.length = 0;

    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [7, 7] }), entry('#BBB', { moves: [3, 3, 4, 4] })]);
    scheduleLobbyBoardUpdate(io, '#BBB'); // opens the window
    jest.advanceTimersByTime(offset);
    io.emitted.length = 0;
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [7, 7, 8, 8] }), entry('#BBB', { moves: [3, 3, 4, 4] })]);
    scheduleLobbyBoardUpdate(io, '#AAA');
    expect(msUntilPatchFor(io, '#AAA')).toBeLessThanOrEqual(BOUND_MS);
  });

  test('a move made while a seat-change flush is pending still lands within 1 s', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [7, 7] }), entry('#BBB')]);
    flush(io);
    io.emitted.length = 0;
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [7, 7, 8, 8] }), entry('#BBB', { playerCount: 1 })]);
    broadcastLobbyUpdate(io, '#BBB');
    scheduleLobbyBoardUpdate(io, '#AAA');
    expect(msUntilPatchFor(io, '#AAA')).toBeLessThanOrEqual(BOUND_MS);
  });

  test('a stream of moves still coalesces: at most one board patch per window, never one per move', () => {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [] })]);
    flush(io);
    io.emitted.length = 0;
    const moves = [];
    for (let i = 0; i < 100; i++) { // a move every 100 ms for 10 s
      moves.push(i % 15, 0);
      mockRoomManager.listRooms.mockReturnValue([entry('#AAA', { moves: [...moves] })]);
      scheduleLobbyBoardUpdate(io, '#AAA');
      jest.advanceTimersByTime(100);
    }
    jest.advanceTimersByTime(BOUND_MS);
    const patches = io.emitted.filter((e) => e.event === 'lobby:patch').length;
    expect(patches).toBeLessThanOrEqual(Math.ceil(10_000 / LOBBY_BOARD_THROTTLE_MS) + 1);
    expect(patches).toBeGreaterThan(1);
  });

  test('does not poke the home feed (its counts do not change on a move)', () => {
    homeFeed.scheduleHomeUpdate.mockClear();
    const io = makeIo();
    scheduleLobbyBoardUpdate(io);
    jest.advanceTimersByTime(LOBBY_BOARD_THROTTLE_MS + DEBOUNCE_MS);
    expect(homeFeed.scheduleHomeUpdate).not.toHaveBeenCalled();
  });
});

describe('moves delta (#377)', () => {
  const playing = (moves, startedAt = 1000) => entry('#AAA', { state: 'playing', playerCount: 2, startedAt, moves });

  function upsertAfter(before, after) {
    const io = makeIo();
    mockRoomManager.listRooms.mockReturnValue([before]);
    flush(io);
    io.emitted.length = 0;
    mockRoomManager.listRooms.mockReturnValue([after]);
    flush(io);
    return io.emitted.length ? io.emitted[0].data.upserts[0] : undefined;
  }

  test('a continued game, nothing else changed: only roomId, startedAt and the new moves', () => {
    const u = upsertAfter(playing([7, 7, 8, 8]), playing([7, 7, 8, 8, 6, 6, 9, 9]));
    expect(u).toEqual({ roomId: '#AAA', startedAt: 1000, movesFrom: 4, moves: [6, 6, 9, 9] });
  });

  test('a continued game with another change: the whole entry, moves still as a delta', () => {
    const u = upsertAfter(playing([7, 7]), { ...playing([7, 7, 8, 8]), userCount: 5 });
    expect(u).toMatchObject({ roomName: 'Phòng #AAA', userCount: 5, movesFrom: 2, moves: [8, 8] });
  });

  test('undo sends the shared prefix length and the (shorter) tail', () => {
    const u = upsertAfter(playing([7, 7, 8, 8, 6, 6]), playing([7, 7, 8, 8]));
    expect(u).toMatchObject({ movesFrom: 4, moves: [] });
  });

  test.each([
    ['a game starts (moves were null)', entry('#AAA'), playing([7, 7])],
    ['a new game in the same room (startedAt changed)', playing([7, 7, 8, 8], 1000), playing([7, 7], 2000)],
    ['the game ends (moves → null)', playing([7, 7]), entry('#AAA', { moves: null })],
  ])('full entry, no movesFrom: %s', (_, before, after) => {
    const u = upsertAfter(before, after);
    expect(u).toEqual(after);
    expect(u).not.toHaveProperty('movesFrom');
  });

  test('a static change with the same moves is still sent (without a moves delta cost)', () => {
    const u = upsertAfter(playing([7, 7]), { ...playing([7, 7]), userCount: 5 });
    expect(u.userCount).toBe(5);
    expect(u.movesFrom).toBe(2);
    expect(u.moves).toEqual([]);
  });

  test('the patch shrinks: 100-move game, one new move → bytes of one move, not 100', () => {
    const long = Array.from({ length: 200 }, (_, i) => i % 15);
    const u = upsertAfter(playing(long), playing([...long, 3, 4]));
    expect(u.moves).toEqual([3, 4]);
    expect(JSON.stringify(u).length).toBeLessThan(80);
  });

  test('snapshot + delta patches (with a mid-stream newer snapshot) reproduce the server state', () => {
    const io = makeIo();
    const states = [
      [playing([1, 1])],
      [playing([1, 1, 2, 2, 3, 3])],
      [playing([1, 1, 2, 2])],              // undo
      [playing([1, 1, 2, 2, 4, 4, 5, 5])],
      [playing([6, 6], 2000)],              // rematch
      [playing([6, 6, 7, 7], 2000)],
    ];
    mockRoomManager.listRooms.mockReturnValue(states[0]);
    const s1 = makeSocket();
    sendLobbySnapshot(io, s1);
    let early = new Map(s1.emitted[0].data.rooms.map((r) => [r.roomId, r]));
    let late = null;
    const apply = (map, patch) => {
      for (const id of patch.removed) map.delete(id);
      for (const r of patch.upserts) map.set(r.roomId, LobbyMoves.applyDelta(map.get(r.roomId), r));
    };
    states.slice(1).forEach((state, i) => {
      io.emitted.length = 0;
      mockRoomManager.listRooms.mockReturnValue(state);
      if (i === 2) { // a second viewer subscribes between flushes: its snapshot is newer than the baseline
        const s2 = makeSocket();
        sendLobbySnapshot(io, s2);
        late = new Map(s2.emitted[0].data.rooms.map((r) => [r.roomId, r]));
      }
      flush(io);
      for (const m of [early, late]) if (m && io.emitted.length) apply(m, io.emitted[0].data);
      expect([...early.values()]).toEqual(state);
      if (late) expect([...late.values()]).toEqual(state);
    });
  });
});

// #380: a flush used to rebuild every room (listRooms) on each move throttle / room change. Call
// sites now name the room; the flush builds that room's entry only.
describe('dirty rooms (#380)', () => {
  const { LOBBY_FULL_RECONCILE_MS } = require('../socket/state');
  let world;
  const set = (roomId, overrides) => world.set(roomId, entry(roomId, overrides));

  beforeEach(() => {
    world = new Map();
    mockRoomManager.listRooms.mockImplementation(() => [...world.values()]);
  });
  afterEach(() => {
    mockRoomManager.listRooms.mockReset();
    mockRoomManager.listRooms.mockReturnValue([]);
  });

  /** io with a baseline of `n` playing rooms, emissions and call counts cleared. */
  function seeded(n) {
    const io = makeIo();
    world.clear();
    for (let i = 0; i < n; i++) set('#R' + i, { state: 'playing', startedAt: 5, moves: [7, 7] });
    flush(io);
    io.emitted.length = 0;
    mockRoomManager.lobbyEntry.mockClear();
    mockRoomManager.lobbyStat.mockClear();
    return io;
  }

  test('a move in one of 50 rooms builds one entry, not the whole list', () => {
    const io = seeded(50);
    set('#R3', { state: 'playing', startedAt: 5, moves: [7, 7, 8, 8] });
    scheduleLobbyBoardUpdate(io, '#R3');
    jest.advanceTimersByTime(LOBBY_BOARD_THROTTLE_MS + DEBOUNCE_MS);

    expect(mockRoomManager.lobbyStat).toHaveBeenCalledTimes(1); // no pass over the 50 rooms
    expect(mockRoomManager.lobbyEntry).toHaveBeenCalledTimes(1);
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data.upserts).toEqual([{ roomId: '#R3', startedAt: 5, movesFrom: 2, moves: [8, 8] }]);
    expect(io.emitted[0].data.removed).toEqual([]);
  });

  test('the dirty patch equals what a full diff sends for the same change', () => {
    const change = () => {
      set('#R1', { state: 'playing', startedAt: 5, moves: [7, 7, 9, 9] }); // moved
      set('#R2', { state: 'idle', userCount: 3 });                         // game over + head-count
      world.delete('#R4');                                                 // destroyed
      set('#NEW');                                                         // created
    };
    const strip = (e) => e.map(({ data }) => ({ upserts: data.upserts, removed: data.removed }));

    const a = seeded(6); change();
    for (const id of ['#R1', '#R2', '#R4', '#NEW']) broadcastLobbyUpdate(a, id);
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(mockRoomManager.lobbyEntry).toHaveBeenCalledTimes(3); // #R1, #R2, #NEW — not all six

    const b = seeded(6); change();
    flush(b); // no room named → full diff

    expect(strip(a.emitted)).toEqual(strip(b.emitted));
    expect(a.emitted[0].data.removed).toEqual(['#R4']);
  });

  test('a room created and destroyed inside one window emits nothing', () => {
    const io = seeded(2);
    broadcastLobbyUpdate(io, '#GONE');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(0);
  });

  test('a call that names no room falls back to the full diff, even next to named ones', () => {
    const io = seeded(3);
    set('#R0', { userCount: 9 });
    set('#R2', { userCount: 9 });
    broadcastLobbyUpdate(io, '#R0');
    broadcastLobbyUpdate(io);
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[0].data.upserts.map((r) => r.roomId).sort()).toEqual(['#R0', '#R2']);
  });

  test('the first flush (no baseline) is a full diff', () => {
    const io = makeIo();
    set('#A'); set('#B');
    broadcastLobbyUpdate(io, '#A');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[0].data.upserts.map((r) => r.roomId)).toEqual(['#A', '#B']);
  });

  test('an unannounced change (rating, avatar) is caught by the periodic full reconcile', () => {
    const io = seeded(3);
    set('#R1', { state: 'playing', startedAt: 5, moves: [7, 7], hostName: 'Renamed' }); // nobody names #R1
    set('#R0', { userCount: 2 });
    broadcastLobbyUpdate(io, '#R0');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[0].data.upserts.map((r) => r.roomId)).toEqual(['#R0']);

    jest.advanceTimersByTime(LOBBY_FULL_RECONCILE_MS);
    set('#R0', { userCount: 3 });
    broadcastLobbyUpdate(io, '#R0');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[1].data.upserts.map((r) => r.roomId).sort()).toEqual(['#R0', '#R1']);
  });

  test('moves marked dirty are not lost when a lifecycle flush lands first', () => {
    const io = seeded(3);
    set('#R2', { state: 'playing', startedAt: 5, moves: [7, 7, 1, 1] });
    scheduleLobbyBoardUpdate(io, '#R2');
    set('#R0', { userCount: 4 });
    broadcastLobbyUpdate(io, '#R0');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[0].data.upserts.map((r) => r.roomId).sort()).toEqual(['#R0', '#R2']);
    jest.advanceTimersByTime(LOBBY_BOARD_THROTTLE_MS + DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(1); // the throttle flush finds nothing left to send
  });
});

// #382: every lobby subscriber used to get every room with all its moves (3 MB at 5 000 games).
// The lobby now mirrors one page; counts over all rooms ride along as `stats`.
describe('room list page (#382)', () => {
  const { LOBBY_FULL_RECONCILE_MS } = require('../socket/state');
  let world;
  const set = (roomId, overrides) => world.set(roomId, entry(roomId, overrides));
  const open = (id) => set(id, { state: 'idle', playerCount: 1, userCount: 1 });
  const live = (id, watchers = 0) => set(id, { state: 'playing', playerCount: 2, userCount: 2 + watchers, startedAt: 5, moves: [7, 7] });
  const upsertIds = (e) => e.data.upserts.map((r) => r.roomId);

  beforeEach(() => {
    world = new Map();
    mockRoomManager.listRooms.mockImplementation(() => [...world.values()]);
  });
  afterEach(() => {
    mockRoomManager.listRooms.mockReset();
    mockRoomManager.listRooms.mockReturnValue([]);
  });

  /** A lobby with `n` live games already flushed; emissions and call counts cleared. */
  function seeded(n, watchersOf = () => 0) {
    const io = makeIo();
    for (let i = 0; i < n; i++) live('#L' + i, watchersOf(i));
    flush(io);
    io.emitted.length = 0;
    mockRoomManager.lobbyEntry.mockClear();
    return io;
  }
  const snapshot = (io) => { const s = makeSocket(); sendLobbySnapshot(io, s); return s.emitted[0].data; };

  test('exactly one page of rooms: all of them, no stats — the payload is what it always was', () => {
    const io = makeIo();
    for (let i = 0; i < PAGE; i++) live('#L' + i);
    const data = snapshot(io);
    expect(data.rooms.map((r) => r.roomId)).toEqual([...world.keys()]);
    expect(Object.keys(data).sort()).toEqual(['rooms', 'serverTime']);
    live('#L3', 4);
    broadcastLobbyUpdate(io, '#L3');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(Object.keys(io.emitted[0].data).sort()).toEqual(['removed', 'serverTime', 'upserts']);
  });

  test('more rooms than a page: snapshot = one page + counts over all rooms', () => {
    const io = makeIo();
    for (let i = 0; i < PAGE + 100; i++) live('#L' + i, i % 3);
    open('#O1'); open('#O2');
    const data = snapshot(io);
    expect(data.rooms).toHaveLength(PAGE);
    expect(data.stats).toEqual({ rooms: PAGE + 102, open: 2, live: PAGE + 100, watch: [...world.values()].reduce((a, r) => a + r.userCount - r.playerCount, 0) });
  });

  test('snapshot bytes and entries built stop growing with the room count', () => {
    const run = (n) => {
      world.clear();
      const io = makeIo();
      for (let i = 0; i < n; i++) live('#L' + i);
      mockRoomManager.lobbyEntry.mockClear();
      const bytes = JSON.stringify(snapshot(io)).length;
      return { bytes, built: mockRoomManager.lobbyEntry.mock.calls.length };
    };
    const small = run(PAGE); const big = run(3000);
    expect(big.bytes).toBeLessThan(small.bytes + 200);
    expect(big.built).toBeLessThanOrEqual(2 * PAGE); // baseline + snapshot, not 3000
  });

  test('the page is picked by rank: open tables first, then the most watched', () => {
    const io = makeIo();
    for (let i = 0; i < PAGE + 20; i++) live('#L' + i, i); // #L49 is the most watched
    open('#O1');
    const ids = snapshot(io).rooms.map((r) => r.roomId);
    expect(ids[0]).toBe('#O1');
    expect(ids).toContain('#L' + (PAGE + 19));
    expect(ids).not.toContain('#L0');
  });

  test('a move in a room outside the page sends nothing and builds nothing', () => {
    const io = seeded(PAGE + 10, (i) => i);
    live('#L0', 0); world.get('#L0').moves = [7, 7, 8, 8];
    scheduleLobbyBoardUpdate(io, '#L0');
    jest.advanceTimersByTime(LOBBY_BOARD_THROTTLE_MS + DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(0);
    expect(mockRoomManager.lobbyEntry).not.toHaveBeenCalled();
  });

  test('a change outside the page that moves the counts sends a stats-only patch', () => {
    const io = seeded(PAGE + 10, (i) => i);
    live('#L0', 5); // five people start watching a game nobody has on screen
    broadcastLobbyUpdate(io, '#L0');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data).toMatchObject({ upserts: [], removed: [] });
    expect(io.emitted[0].data.stats.watch).toBe([...world.values()].reduce((a, r) => a + r.userCount - r.playerCount, 0));
  });

  test('a new open table takes the place of the least-watched game on a full page', () => {
    const io = seeded(PAGE + 10, (i) => i); // page = #L10..#L39; least watched on it: #L10
    open('#NEW');
    broadcastLobbyUpdate(io, '#NEW');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    const { upserts, removed, stats } = io.emitted[0].data;
    expect(upserts.map((r) => r.roomId)).toEqual(['#NEW']);
    expect(removed).toEqual(['#L10']);
    expect(stats).toMatchObject({ rooms: PAGE + 11, open: 1 });
  });

  test('a new game (not open) does not push anything off a full page', () => {
    const io = seeded(PAGE + 10, (i) => i);
    live('#G', 99);
    broadcastLobbyUpdate(io, '#G');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[0].data).toMatchObject({ upserts: [], removed: [] });
  });

  test('a page full of open tables keeps them: a newer open table waits outside', () => {
    const io = makeIo();
    for (let i = 0; i < PAGE + 1; i++) open('#O' + i);
    flush(io); io.emitted.length = 0;
    open('#LATE');
    broadcastLobbyUpdate(io, '#LATE');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[0].data).toMatchObject({ upserts: [], removed: [] });
  });

  test('a card whose room is destroyed is replaced by the best room waiting outside', () => {
    const io = seeded(PAGE + 10, (i) => i); // outside: #L0..#L9, best = #L9
    world.delete('#L20');
    broadcastLobbyUpdate(io, '#L20');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    const { upserts, removed, stats } = io.emitted[0].data;
    expect(removed).toEqual(['#L20']);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ roomId: '#L9', hostName: 'Host' }); // a full entry: clients never held it
    expect(stats.rooms).toBe(PAGE + 9);
  });

  test('dropping to one page: everything is on it and stats stop (one last patch without them)', () => {
    const io = seeded(PAGE + 1, (i) => i); // outside: #L0
    world.delete('#L5');
    broadcastLobbyUpdate(io, '#L5');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    const data = io.emitted[0].data;
    expect(upsertIds(io.emitted[0])).toEqual(['#L0']);
    expect(data.stats).toBeUndefined();
    world.delete('#L6');
    broadcastLobbyUpdate(io, '#L6');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(Object.keys(io.emitted[1].data).sort()).toEqual(['removed', 'serverTime', 'upserts']);
  });

  test('a card that changes stays on the page whatever its new rank (no reshuffle)', () => {
    const io = seeded(PAGE + 10, (i) => i);
    live('#L39', 0); // the most watched game loses all its watchers
    broadcastLobbyUpdate(io, '#L39');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(upsertIds(io.emitted[0])).toEqual(['#L39']);
    expect(io.emitted[0].data.removed).toEqual([]);
  });

  test('the periodic full pass lets an open table that was waiting outside onto the page', () => {
    const io = makeIo();
    for (let i = 0; i < PAGE; i++) open('#O' + i);
    open('#WAIT');
    flush(io); io.emitted.length = 0;       // page = #O0..#O29, #WAIT outside
    for (let i = 0; i < PAGE; i++) live('#O' + i, i); // every card on the page starts a game
    for (let i = 0; i < PAGE; i++) broadcastLobbyUpdate(io, '#O' + i);
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(io.emitted[0].data.removed).toEqual([]); // dirty pass: nobody named #WAIT
    jest.advanceTimersByTime(LOBBY_FULL_RECONCILE_MS);
    broadcastLobbyUpdate(io, '#O1');
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(upsertIds(io.emitted[1])).toContain('#WAIT');
    expect(io.emitted[1].data.removed).toEqual(['#O0']); // least watched non-open card
  });

  test('snapshot + patches replay to exactly the server page (create, move, destroy, evict)', () => {
    const io = makeIo();
    for (let i = 0; i < PAGE + 15; i++) live('#L' + i, i);
    const client = new Map(snapshot(io).rooms.map((r) => [r.roomId, r]));
    const apply = () => {
      for (const { data } of io.emitted.splice(0)) {
        for (const id of data.removed) client.delete(id);
        for (const raw of data.upserts) { const r = LobbyMoves.applyDelta(client.get(raw.roomId), raw); expect(r).toBeTruthy(); client.set(r.roomId, r); }
      }
    };
    const steps = [
      () => { open('#N1'); return ['#N1']; },
      () => { world.get('#L40').moves = [7, 7, 8, 8]; return ['#L40']; },
      () => { world.delete('#L41'); world.delete('#L42'); return ['#L41', '#L42']; },
      () => { live('#N1', 3); open('#N2'); return ['#N1', '#N2']; },
    ];
    for (const step of steps) {
      for (const id of step()) broadcastLobbyUpdate(io, id);
      jest.advanceTimersByTime(DEBOUNCE_MS);
      apply();
      const page = snapshot(io).rooms; // what a fresh subscriber is given now
      expect([...client.keys()].sort()).toEqual(page.map((r) => r.roomId).sort());
      for (const r of page) expect(client.get(r.roomId)).toEqual(r);
      expect(client.size).toBe(PAGE);
    }
  });

  describe('queryLobbyRooms (the rooms beyond the page)', () => {
    beforeEach(() => { for (let i = 0; i < 2 * PAGE + 5; i++) live('#L' + i, i); open('#O'); });

    test('pages through every room once, in rank order, with the counts', () => {
      const pages = [0, PAGE, 2 * PAGE].map((offset) => queryLobbyRooms({ offset }));
      expect(pages.map((p) => p.rooms.length)).toEqual([PAGE, PAGE, 6]);
      const ids = pages.flatMap((p) => p.rooms.map((r) => r.roomId));
      expect(new Set(ids).size).toBe(2 * PAGE + 6);
      expect(ids[0]).toBe('#O');
      expect(ids[1]).toBe('#L' + (2 * PAGE + 4));
      expect(ids.at(-1)).toBe('#L0');
      expect(pages[0].stats).toMatchObject({ rooms: 2 * PAGE + 6, open: 1 });
    });

    test.each([[{ offset: -3 }, PAGE], [{ offset: 'x' }, PAGE], [{ offset: 1e9 }, 0], [undefined, PAGE], [{}, PAGE]])(
      'bad offset %j is clamped', (input, n) => { expect(queryLobbyRooms(input).rooms).toHaveLength(n); });
  });
});
