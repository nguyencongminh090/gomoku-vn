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
  getRoomIdByUser: jest.fn(() => null),
  lobbyEntry: jest.fn((room) => room),
  lobbyStat: jest.fn((room) => ({ state: room.state, playerCount: room.playerCount || 0, userCount: room.userCount || 0,
    rule: room.winningRule, timerMode: room.timerMode, timerSeconds: room.timerSeconds, seatIds: room.seatIds || [] })),
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

// #439: seat Elo for the rooms_query filters — `mockStandings[rule][userId] = [rating, rank|null, provisional]`.
const mockStandings = {};
jest.mock('../managers/rank-cache', () => ({
  standingOf: (userId, rule) => (mockStandings[rule] && mockStandings[rule][userId]) || null,
  ratingsOf: () => ({}),
}));

const { broadcastLobbyUpdate, sendLobbySnapshot, LOBBY_ROOM_PAGE_SIZE: PAGE, queryLobbyRooms, onRatingsChanged } = require('../socket/state');
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
    expect(room).toBe('lobby:all'); // #439: the every-rule channel (no rule subscribed)
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
    for (let i = 0; i < n; i++) set('#R' + i, { state: 'playing' });
    flush(io);
    io.emitted.length = 0;
    mockRoomManager.lobbyEntry.mockClear();
    mockRoomManager.lobbyStat.mockClear();
    return io;
  }

  test('a change in one of 50 rooms builds one entry, not the whole list', () => {
    const io = seeded(50);
    set('#R3', { state: 'playing', userCount: 6 });
    broadcastLobbyUpdate(io, '#R3');
    jest.advanceTimersByTime(DEBOUNCE_MS);

    expect(mockRoomManager.lobbyStat).toHaveBeenCalledTimes(1); // no pass over the 50 rooms
    expect(mockRoomManager.lobbyEntry).toHaveBeenCalledTimes(1);
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].data.upserts).toEqual([world.get('#R3')]);
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
    set('#R1', { state: 'playing', hostName: 'Renamed' }); // nobody names #R1
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
});

// #382: every lobby subscriber used to get every room with all its moves (3 MB at 5 000 games).
// The lobby now mirrors one page; counts over all rooms ride along as `stats`.
describe('room list page (#382)', () => {
  const { LOBBY_FULL_RECONCILE_MS } = require('../socket/state');
  let world;
  const set = (roomId, overrides) => world.set(roomId, entry(roomId, overrides));
  const open = (id) => set(id, { state: 'idle', playerCount: 1, userCount: 1 });
  const live = (id, watchers = 0) => set(id, { state: 'playing', playerCount: 2, userCount: 2 + watchers });
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
    expect(data.stats).toEqual({
      rooms: PAGE + 102, open: 2, live: PAGE + 100, watch: [...world.values()].reduce((a, r) => a + r.userCount - r.playerCount, 0),
      playing: 2 * (PAGE + 100), // #439 S6: seated players of running games
      byRule: { freestyle: { open: 2, total: PAGE + 102 }, standard: { open: 0, total: 0 }, caro: { open: 0, total: 0 }, renju: { open: 0, total: 0 } },
    });
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
    expect(big.bytes).toBeLessThan(small.bytes + 400); // + the fixed-size stats (with #439 byRule/playing), not per room
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

  test('a change in a room outside the page that moves no count sends nothing and builds nothing', () => {
    const io = seeded(PAGE + 10, (i) => i);
    world.get('#L0').roomName = 'Renamed';
    broadcastLobbyUpdate(io, '#L0');
    jest.advanceTimersByTime(DEBOUNCE_MS);
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
    const client = new Map(snapshot(io).rooms.map((r) => [r.roomId, JSON.parse(JSON.stringify(r))]));
    const apply = () => {
      for (const { data } of io.emitted.splice(0)) {
        for (const id of data.removed) client.delete(id);
        for (const r of data.upserts) client.set(r.roomId, JSON.parse(JSON.stringify(r)));
      }
    };
    const steps = [
      () => { open('#N1'); return ['#N1']; },
      () => { set('#L40', { ...world.get('#L40'), roomName: 'Renamed' }); return ['#L40']; },
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

// #439: one mirrored page per rule tab, counts per rule (tab badges), seated players, server-side filters.
describe('per-rule channels and stats (#439)', () => {
  let world;
  const set = (roomId, overrides) => world.set(roomId, entry(roomId, overrides));
  const table = (id, rule, over = {}) => set(id, { winningRule: rule, ...over });
  const liveT = (id, rule, over = {}) => table(id, rule, { state: 'playing', playerCount: 2, userCount: 2, ...over });
  const snap = (io, key) => { const s = makeSocket(); sendLobbySnapshot(io, s, key); return s.emitted[0].data; };
  const sentTo = (io, room) => io.emitted.filter((e) => e.room === room).map((e) => e.data);
  const step = (io, ...ids) => { for (const id of ids) broadcastLobbyUpdate(io, id); jest.advanceTimersByTime(DEBOUNCE_MS); };

  beforeEach(() => {
    world = new Map();
    mockRoomManager.listRooms.mockImplementation(() => [...world.values()]);
    for (const k of Object.keys(mockStandings)) delete mockStandings[k];
  });
  afterEach(() => {
    mockRoomManager.listRooms.mockReset();
    mockRoomManager.listRooms.mockReturnValue([]);
  });

  test('a rule snapshot holds only that rule, and always carries the counts of every rule', () => {
    const io = makeIo();
    table('#C1', 'caro', { playerCount: 1 }); liveT('#C2', 'caro', { userCount: 5 }); table('#R1', 'renju');
    liveT('#F1', 'freestyle', { playerCount: 1 }); // a game whose opponent left: one seated player
    const data = snap(io, 'caro');
    expect(data.rooms.map((r) => r.roomId)).toEqual(['#C1', '#C2']);
    expect(data.stats).toEqual({
      rooms: 2, open: 1, live: 1, watch: 3, playing: 3,
      byRule: { freestyle: { open: 0, total: 1 }, standard: { open: 0, total: 0 }, caro: { open: 1, total: 2 }, renju: { open: 1, total: 1 } },
    });
    expect(snap(io, 'standard')).toMatchObject({ rooms: [], stats: { rooms: 0, playing: 3 } });
    // The every-rule channel keeps the pre-#439 payload while everything fits one page.
    expect(Object.keys(snap(io, '')).sort()).toEqual(['rooms', 'serverTime']);
  });

  test('a change reaches its own rule channel (and the every-rule one); other tabs get counts only when they moved', () => {
    const io = makeIo();
    table('#C1', 'caro'); table('#R1', 'renju');
    for (const key of ['caro', 'renju', '']) snap(io, key);
    table('#C1', 'caro', { roomName: 'Renamed' }); // no count moves
    step(io, '#C1');
    expect(sentTo(io, 'lobby:caro').map((p) => p.upserts.map((r) => r.roomId))).toEqual([['#C1']]);
    expect(sentTo(io, 'lobby:all').map((p) => p.upserts.map((r) => r.roomId))).toEqual([['#C1']]);
    expect(sentTo(io, 'lobby:renju')).toEqual([]);
    io.emitted.length = 0;
    table('#C2', 'caro'); // caro badge 1 → 2
    step(io, '#C2');
    expect(sentTo(io, 'lobby:caro')[0].upserts.map((r) => r.roomId)).toEqual(['#C2']);
    const renju = sentTo(io, 'lobby:renju');
    expect(renju).toHaveLength(1);
    expect(renju[0]).toMatchObject({ upserts: [], removed: [], stats: { byRule: { caro: { open: 2, total: 2 } } } });
  });

  test('a table whose rule changes leaves the old tab and appears in the new one', () => {
    const io = makeIo();
    table('#X', 'caro'); table('#C', 'caro');
    snap(io, 'caro'); snap(io, 'renju');
    table('#X', 'renju');
    step(io, '#X');
    expect(sentTo(io, 'lobby:caro')[0]).toMatchObject({ upserts: [], removed: ['#X'] });
    expect(sentTo(io, 'lobby:renju')[0].upserts.map((r) => r.roomId)).toEqual(['#X']);
  });

  test('each rule has its own page: a full caro page leaves renju tables alone', () => {
    const io = makeIo();
    for (let i = 0; i < PAGE + 5; i++) liveT('#C' + i, 'caro', { userCount: 2 + i });
    table('#R1', 'renju'); table('#R2', 'renju');
    const caro = snap(io, 'caro');
    expect(caro.rooms).toHaveLength(PAGE);
    expect(caro.rooms.every((r) => r.winningRule === 'caro')).toBe(true);
    expect(caro.stats).toMatchObject({ rooms: PAGE + 5, live: PAGE + 5 });
    world.delete(caro.rooms[0].roomId);
    step(io, caro.rooms[0].roomId);
    const [patch] = sentTo(io, 'lobby:caro');
    expect(patch.removed).toEqual([caro.rooms[0].roomId]);
    expect(patch.upserts).toHaveLength(1);
    expect(patch.upserts[0].winningRule).toBe('caro'); // the free slot is not given to a renju table
    expect(snap(io, 'renju').rooms.map((r) => r.roomId)).toEqual(['#R1', '#R2']);
  });

  test('a channel nobody listens to is dropped at the next flush, and reseeded by its next subscriber', () => {
    const io = makeIo();
    const members = new Map([['lobby:caro', new Set(['s1'])]]);
    io.sockets = { adapter: { rooms: members } };
    table('#C1', 'caro'); table('#R1', 'renju');
    snap(io, 'caro'); snap(io, 'renju');
    table('#C2', 'caro'); table('#R2', 'renju');
    mockRoomManager.lobbyEntry.mockClear();
    step(io, '#C2', '#R2');
    expect(io.emitted.map((e) => e.room)).toEqual(['lobby:caro']); // renju + every-rule channels: empty
    expect(mockRoomManager.lobbyEntry.mock.calls.map(([r]) => r.roomId)).toEqual(['#C2']);
    members.set('lobby:renju', new Set(['s2']));
    expect(snap(io, 'renju').rooms.map((r) => r.roomId)).toEqual(['#R1', '#R2']);
  });

  test('a rating change re-sends the card of the room its member sits in, and only that one', () => {
    const io = makeIo();
    table('#S', 'caro', { playerCount: 1, players: [{ displayName: 'An', rating: 1500, provisional: false }, null] });
    table('#T', 'caro');
    snap(io, 'caro');
    world.get('#S').players[0].rating = 1520; // what lobbyEntry reads from the rebuilt cache
    mockRoomManager.getRoomIdByUser.mockImplementation((id) => (id === 'an' ? '#S' : null));
    onRatingsChanged(io, new Set(['an', 'not-seated']));
    jest.advanceTimersByTime(DEBOUNCE_MS);
    const [patch] = sentTo(io, 'lobby:caro');
    expect(patch.upserts.map((r) => [r.roomId, r.players[0].rating])).toEqual([['#S', 1520]]);
    mockRoomManager.getRoomIdByUser.mockReset();
  });

  describe('queryLobbyRooms filters and sorts (S5)', () => {
    const ids = (res) => res.rooms.map((r) => r.roomId);
    beforeEach(() => {
      // [id, state, playerCount, timer, seconds, seated members]
      const rows = [
        ['#A', 'idle', 1, 'per_game', 180, ['u1500']],
        ['#B', 'playing', 2, 'blitz', 300, ['u1900', 'u1100']],
        ['#C', 'idle', 0, 'per_game', 600, []],
        ['#D', 'idle', 1, 'per_move', 30, ['u2100']],
        ['#E', 'playing', 2, 'per_game', 900, ['u1650', 'g']],
      ];
      for (const [id, state, playerCount, timerMode, timerSeconds, seatIds] of rows) {
        table(id, 'caro', { state, playerCount, userCount: playerCount, timerMode, timerSeconds, seatIds });
      }
      table('#R', 'renju', { playerCount: 1, seatIds: ['u1500'] });
      mockStandings.caro = { u1500: [1500, 9, false], u1900: [1900, 2, false], u1100: [1100, 30, true], u2100: [2100, 1, false], u1650: [1650, 5, false] };
    });

    test('rule only: that tab, default order = open tables first (the page order)', () => {
      const res = queryLobbyRooms({ rule: 'caro' });
      expect(ids(res)).toEqual(['#A', '#C', '#D', '#B', '#E']);
      expect(res.matched).toBe(5);
      expect(res.stats).toMatchObject({ rooms: 5, open: 3, live: 2, byRule: { renju: { open: 1, total: 1 } } });
    });

    test('open: tables with a free seat only', () => {
      expect(ids(queryLobbyRooms({ rule: 'caro', open: true }))).toEqual(['#A', '#C', '#D']);
    });

    test.each([
      [['fast'], ['#A']],            // ≤ 3 min
      [['mid'], ['#B']],             // ≤ 5 min
      [['slow'], ['#C', '#E']],      // longer
      [['move'], ['#D']],            // per-move clock
      [['fast', 'move'], ['#A', '#D']],
      [['bogus'], ['#A', '#C', '#D', '#B', '#E']], // unknown buckets = no filter
      ['fast', ['#A', '#C', '#D', '#B', '#E']],    // not an array = no filter
    ])('time %j → %j', (time, want) => {
      expect(ids(queryLobbyRooms({ rule: 'caro', time }))).toEqual(want);
    });

    test('near: a seated member within 200 Elo of the asker, in the tab rule', () => {
      const me = { userId: 'me', isGuest: false };
      mockStandings.caro.me = [1700, 4, false];
      expect(ids(queryLobbyRooms({ rule: 'caro', near: true }, me))).toEqual(['#A', '#B', '#E']); // 1500, 1900, 1650
      // Ignored without a rule, for an unrated asker, a guest, or a truthy non-boolean.
      expect(queryLobbyRooms({ near: true }, me).matched).toBe(6);
      expect(queryLobbyRooms({ rule: 'caro', near: true }, { userId: 'new', isGuest: false }).matched).toBe(5);
      expect(queryLobbyRooms({ rule: 'caro', near: true }, { userId: 'me', isGuest: true }).matched).toBe(5);
      expect(queryLobbyRooms({ rule: 'caro', near: 'yes' }, me).matched).toBe(5);
    });

    test('sort rank: best seated Elo first, tables without a rated member last', () => {
      expect(ids(queryLobbyRooms({ rule: 'caro', sort: 'rank' }))).toEqual(['#D', '#B', '#E', '#A', '#C']);
    });

    test('sort time: shortest bucket first, then base time; per-move clocks last', () => {
      expect(ids(queryLobbyRooms({ rule: 'caro', sort: 'time' }))).toEqual(['#A', '#B', '#C', '#E', '#D']);
    });

    test('filters combine; offset pages the filtered order; unknown sort = default', () => {
      const res = queryLobbyRooms({ rule: 'caro', open: true, sort: 'rank', offset: 1 });
      expect(ids(res)).toEqual(['#A', '#C']);
      expect(res.matched).toBe(3);
      expect(ids(queryLobbyRooms({ rule: 'caro', sort: '__proto__' }))).toEqual(['#A', '#C', '#D', '#B', '#E']);
    });
  });
});
