'use strict';

/**
 * seat-alert.test.js — #438 "Báo khi có bàn": the server pushes `lobby:seat_alert` once per matching table
 * that turns open. Real state.js, mocked RoomManager (a "room" IS its lobby entry, as in lobby-delta.test.js).
 */

jest.useFakeTimers();

const mockRoomManager = {
  on: jest.fn(),
  listRooms: jest.fn(() => []),
  get rooms() { return new Map(mockRoomManager.listRooms().map((e) => [e.roomId, e])); },
  getRoom: jest.fn((id) => mockRoomManager.listRooms().find((e) => e.roomId === id)),
  getRoomIdByUser: jest.fn(() => null),
  lobbyEntry: jest.fn((room) => room),
  lobbyStat: jest.fn((room) => ({ state: room.state, playerCount: room.playerCount || 0, userCount: room.userCount || 0,
    rule: room.winningRule, timerMode: room.timerMode, timerSeconds: room.timerSeconds, seatIds: room.seatIds || [] })),
  bothSeated: jest.fn(() => false),
  serializeRoomUpdate: jest.fn((room) => ({ roomId: room.roomId })),
  registerReadyMiss: jest.fn(() => ({ kicked: null, missCount: 0 })),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn() }));

const mockStandings = {};
jest.mock('../managers/rank-cache', () => ({
  standingOf: (userId, rule) => (mockStandings[rule] && mockStandings[rule][userId]) || null,
  ratingsOf: () => ({}),
}));

const { broadcastLobbyUpdate, setSeatAlert, clearSeatAlert } = require('../socket/state');

const DEBOUNCE_MS = 300;

function entry(roomId, o = {}) {
  return {
    roomId, roomName: `Phòng ${roomId}`, hostName: 'Host', playerCount: 1, userCount: 1, state: 'idle',
    boardSize: 17, winningRule: 'freestyle', timerMode: 'per_move', timerSeconds: 60, seatIds: [], ...o,
  };
}

/** io double with the adapter surface the alert fan-out reads (rooms → sids, sockets → socket). */
function makeIo() {
  const io = { emitted: [], to: jest.fn(() => ({ emit: () => {} })) };
  const rooms = new Map();
  io.sockets = { adapter: { rooms }, sockets: new Map() };
  io.addSocket = (userId = 'me', { isGuest = false } = {}) => {
    const sid = `s${io.sockets.sockets.size + 1}`;
    const socket = {
      id: sid, user: { userId, displayName: userId, isGuest }, data: {}, got: [],
      emit: (event, data) => socket.got.push({ event, data }),
      join: (r) => { if (!rooms.has(r)) rooms.set(r, new Set()); rooms.get(r).add(sid); },
      leave: (r) => { if (rooms.has(r)) rooms.get(r).delete(sid); },
    };
    io.sockets.sockets.set(sid, socket);
    return socket;
  };
  return io;
}

const alerts = (s) => s.got.filter((g) => g.event === 'lobby:seat_alert');
function flush(io) { broadcastLobbyUpdate(io); jest.advanceTimersByTime(DEBOUNCE_MS); }
function setRooms(list, io) { mockRoomManager.listRooms.mockReturnValue(list); if (io) flush(io); }

beforeEach(() => {
  jest.clearAllMocks();
  mockRoomManager.listRooms.mockReturnValue([]);
  mockRoomManager.getRoomIdByUser.mockReturnValue(null);
  for (const k of Object.keys(mockStandings)) delete mockStandings[k];
});

describe('seat alert — which tables alert', () => {
  test('a new open table of the armed rule alerts once, with its full entry', () => {
    const io = makeIo();
    const me = io.addSocket();
    flush(io);
    expect(setSeatAlert(me, { rule: 'freestyle' })).toBe(true);

    setRooms([entry('#AAA')], io);
    expect(alerts(me)).toHaveLength(1);
    expect(alerts(me)[0].data.room.roomId).toBe('#AAA');

    flush(io); // a later flush with the same room: not again
    expect(alerts(me)).toHaveLength(1);
  });

  test('tables already open when the alert is armed never alert (no replay of the lobby)', () => {
    const io = makeIo();
    const me = io.addSocket();
    setRooms([entry('#AAA')], io);
    setSeatAlert(me, { rule: 'freestyle' });
    io.emitted.length = 0;
    setRooms([entry('#AAA', { playerCount: 2, state: 'playing' })], io);
    setRooms([entry('#AAA')], io); // seat freed again: still the same table
    expect(alerts(me)).toHaveLength(0);
  });

  test('another rule, a full table and a running game do not alert', () => {
    const io = makeIo();
    const me = io.addSocket();
    flush(io);
    setSeatAlert(me, { rule: 'caro' });
    setRooms([
      entry('#AAA'), // freestyle
      entry('#BBB', { winningRule: 'caro', playerCount: 2 }),
      entry('#CCC', { winningRule: 'caro', playerCount: 2, state: 'playing' }),
    ], io);
    expect(alerts(me)).toHaveLength(0);
    setRooms([entry('#AAA'), entry('#BBB', { winningRule: 'caro', playerCount: 2 }),
      entry('#CCC', { winningRule: 'caro', playerCount: 2, state: 'playing' }), entry('#DDD', { winningRule: 'caro' })], io);
    expect(alerts(me).map((a) => a.data.room.roomId)).toEqual(['#DDD']);
  });

  test('a seat freed in a table that was full alerts', () => {
    const io = makeIo();
    const me = io.addSocket();
    setRooms([entry('#AAA', { playerCount: 2 })], io);
    setSeatAlert(me, { rule: 'freestyle' });
    setRooms([entry('#AAA', { playerCount: 1 })], io);
    // armed while the table was full → not in `notified`, so its freed seat is news
    expect(alerts(me)).toHaveLength(1);
  });

  test('one alert per table: closed and reopened does not alert again', () => {
    const io = makeIo();
    const me = io.addSocket();
    flush(io);
    setSeatAlert(me, { rule: 'freestyle' });
    setRooms([entry('#AAA')], io);
    setRooms([entry('#AAA', { playerCount: 2, state: 'playing' })], io);
    setRooms([entry('#AAA')], io);
    expect(alerts(me)).toHaveLength(1);
  });

  test('my own table never alerts me', () => {
    const io = makeIo();
    const me = io.addSocket('me');
    flush(io);
    setSeatAlert(me, { rule: 'freestyle' });
    mockRoomManager.getRoomIdByUser.mockImplementation((id) => (id === 'me' ? '#AAA' : null));
    setRooms([entry('#AAA')], io);
    expect(alerts(me)).toHaveLength(0);
  });
});

describe('seat alert — filters', () => {
  test('time buckets: only the chosen bucket (per-move clock is its own bucket)', () => {
    const io = makeIo();
    const me = io.addSocket();
    flush(io);
    setSeatAlert(me, { rule: 'freestyle', time: ['fast'] });
    setRooms([
      entry('#MOV'), // per_move 60 → 'move'
      entry('#MID', { timerMode: 'classic', timerSeconds: 300 }),
      entry('#FST', { timerMode: 'classic', timerSeconds: 180 }),
    ], io);
    expect(alerts(me).map((a) => a.data.room.roomId)).toEqual(['#FST']);
  });

  test('near: a seated member within 200 Elo of me, in the armed rule; boundary 200 in, 201 out', () => {
    const io = makeIo();
    const me = io.addSocket('me');
    flush(io);
    mockStandings.freestyle = { me: [1500, 5, false], in200: [1700, 1, false], out201: [1701, 1, false] };
    setSeatAlert(me, { rule: 'freestyle', near: true });
    setRooms([
      entry('#IN', { seatIds: ['in200'] }),
      entry('#OUT', { seatIds: ['out201'] }),
      entry('#NOBODY'), // no seated member: nothing to be near
    ], io);
    expect(alerts(me).map((a) => a.data.room.roomId)).toEqual(['#IN']);
  });

  test('near with no rating of mine in that rule alerts nothing', () => {
    const io = makeIo();
    const me = io.addSocket('me');
    flush(io);
    mockStandings.freestyle = { x: [1500, 1, false] };
    setSeatAlert(me, { rule: 'freestyle', near: true });
    setRooms([entry('#AAA', { seatIds: ['x'] })], io);
    expect(alerts(me)).toHaveLength(0);
  });

  test('a guest cannot use near: the flag is ignored, the rest still applies', () => {
    const io = makeIo();
    const guest = io.addSocket('g', { isGuest: true });
    flush(io);
    setSeatAlert(guest, { rule: 'freestyle', near: true });
    setRooms([entry('#AAA')], io);
    expect(alerts(guest)).toHaveLength(1);
  });
});

describe('seat alert — arming, clearing, fan-out', () => {
  test('clear and invalid payloads disarm; an unknown time bucket is dropped, not an error', () => {
    const io = makeIo();
    const me = io.addSocket();
    flush(io);
    expect(setSeatAlert(me, { rule: 'freestyle' })).toBe(true);
    clearSeatAlert(me);
    setRooms([entry('#AAA')], io);
    expect(alerts(me)).toHaveLength(0);

    for (const bad of [null, undefined, 'x', {}, { rule: 'nope' }, { rule: 5 }]) {
      expect(setSeatAlert(me, bad)).toBe(false);
      expect(me.data.seatAlert).toBeUndefined();
    }
    expect(setSeatAlert(me, { rule: 'freestyle', time: ['bogus', 'fast', 7] })).toBe(true);
    expect([...me.data.seatAlert.time]).toEqual(['fast']);
  });

  test('re-arming replaces the filter', () => {
    const io = makeIo();
    const me = io.addSocket();
    flush(io);
    setSeatAlert(me, { rule: 'caro' });
    setSeatAlert(me, { rule: 'freestyle' });
    setRooms([entry('#AAA'), entry('#BBB', { winningRule: 'caro' })], io);
    expect(alerts(me).map((a) => a.data.room.roomId)).toEqual(['#AAA']);
  });

  test('every armed socket gets its own alert; an unarmed one gets none', () => {
    const io = makeIo();
    const a = io.addSocket('a');
    const b = io.addSocket('b');
    const idle = io.addSocket('c');
    flush(io);
    setSeatAlert(a, { rule: 'freestyle' });
    setSeatAlert(b, { rule: 'freestyle' });
    setRooms([entry('#AAA')], io);
    expect([alerts(a).length, alerts(b).length, alerts(idle).length]).toEqual([1, 1, 0]);
  });

  test('a flush with nobody armed builds no entries', () => {
    const io = makeIo();
    flush(io);
    mockRoomManager.lobbyEntry.mockClear();
    setRooms([entry('#AAA')], io);
    expect(mockRoomManager.lobbyEntry).not.toHaveBeenCalled(); // no channel subscribed, nobody armed: no entry built
  });
});
