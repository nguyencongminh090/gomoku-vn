'use strict';

/**
 * home-feed.test.js — dashboard live push (B225).
 * Fake io/sockets; RoomManager, the match queue and the online list are stubs we mutate.
 */

jest.useFakeTimers();
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({}));
jest.mock('../managers/SessionManager', () => ({ getValidSession: () => null }));
jest.mock('../managers/tournament/TournamentManager', () => ({ pairings: new Map(), listTournaments: () => [], getTournament: () => null }));
jest.mock('../managers/RoomManager', () => ({ rooms: new Map(), getRoomByUser: () => null }));
jest.mock('../socket/handlers/MatchHandler', () => ({ queueCounts: jest.fn(() => ({})) }));
jest.mock('../socket/state', () => ({ getOnlineUsersList: jest.fn(() => []) }));

const roomManager = require('../managers/RoomManager');
const MatchHandler = require('../socket/handlers/MatchHandler');
const state = require('../socket/state');
const feed = require('../socket/home-feed');

function makeIo() {
  const rooms = new Map();
  const sent = [];
  return {
    sent,
    sockets: { adapter: { rooms } },
    to: (name) => ({ emit: (ev, d) => sent.push([name, ev, d]) }),
    _rooms: rooms,
  };
}
function makeSocket(io, id) {
  const handlers = {};
  return {
    id, got: [],
    on(ev, fn) { handlers[ev] = fn; },
    emit(ev, d) { this.got.push([ev, d]); },
    join(name) { if (!io._rooms.has(name)) io._rooms.set(name, new Set()); io._rooms.get(name).add(id); },
    leave(name) { const r = io._rooms.get(name); if (r) { r.delete(id); if (!r.size) io._rooms.delete(name); } },
    fire(ev, d) { handlers[ev](d); },
  };
}
function playing(roomId, black, white) {
  return { roomId, roomName: roomId, state: 'playing', users: new Map(), settings: { winningRule: 'caro' },
    gameState: { boardSize: 15, moveHistory: [], players: [{ color: 'BLACK', displayName: black, userId: 'id-' + black }, { color: 'WHITE', displayName: white, userId: 'id-' + white }] } };
}
const online = (n) => state.getOnlineUsersList.mockReturnValue(Array.from({ length: n }, (_, i) => ({ userId: 'u' + i })));
const settle = () => jest.advanceTimersByTime(feed.HOME_DEBOUNCE_MS);

let io;
beforeEach(() => {
  io = makeIo();
  roomManager.rooms.clear();
  MatchHandler.queueCounts.mockReturnValue({});
  online(0);
});
afterEach(() => feed._reset(io));

function subscribed(id = 's1') {
  const s = makeSocket(io, id);
  feed.register(io, s);
  s.fire('home:subscribe');
  return s;
}

describe('home:subscribe', () => {
  it('joins `home` and replies with the full snapshot', () => {
    online(3);
    MatchHandler.queueCounts.mockReturnValue({ 'caro|5+3': 2, 'gomoku|3+2': 1 });
    roomManager.rooms.set('#A', playing('#A', 'An', 'Binh'));
    const s = subscribed();
    expect(io._rooms.get('home').has('s1')).toBe(true);
    expect(s.got[0]).toEqual(['home:stats', { online: 3, playing: 1, searching: 3 }]);
    expect(s.got[1][0]).toBe('home:live');
    expect(s.got[1][1]).toEqual([expect.objectContaining({ roomId: '#A', black: 'An', white: 'Binh' })]);
  });

  it('payloads carry names only, never user ids', () => {
    roomManager.rooms.set('#A', playing('#A', 'An', 'Binh'));
    const s = subscribed();
    expect(JSON.stringify(s.got)).not.toMatch(/id-An|id-Binh/);
  });
});

describe('coalesced broadcast', () => {
  it('a burst of changes → one home:stats with absolute values after the window', () => {
    subscribed();
    online(1); feed.scheduleHomeUpdate(io);
    online(2); feed.scheduleHomeUpdate(io);
    MatchHandler.queueCounts.mockReturnValue({ 'caro|5+3': 1 }); feed.scheduleHomeUpdate(io);
    jest.advanceTimersByTime(feed.HOME_DEBOUNCE_MS - 1);
    expect(io.sent).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(io.sent).toEqual([['home', 'home:stats', { online: 2, playing: 0, searching: 1 }]]);
  });

  it('no change → no emit', () => {
    subscribed();
    feed.scheduleHomeUpdate(io); settle();
    expect(io.sent).toEqual([]);
  });

  it('a change that reverts inside the window → no emit', () => {
    online(1);
    subscribed();
    online(2); feed.scheduleHomeUpdate(io);
    online(1);
    settle();
    expect(io.sent).toEqual([]);
  });

  it('home:live goes out on game start/end only, not on moves', () => {
    subscribed();
    const g = playing('#A', 'An', 'Binh');
    roomManager.rooms.set('#A', g); feed.scheduleHomeUpdate(io); settle();
    expect(io.sent.map(([, ev]) => ev)).toEqual(['home:stats', 'home:live']);
    io.sent.length = 0;
    g.gameState.moveHistory.push({ x: 7, y: 7 }); feed.scheduleHomeUpdate(io); settle();
    expect(io.sent).toEqual([]);
    g.state = 'ended'; feed.scheduleHomeUpdate(io); settle();
    expect(io.sent).toEqual([['home', 'home:stats', { online: 0, playing: 0, searching: 0 }], ['home', 'home:live', []]]);
  });

  it('subscribing while a flush is pending forces that flush to emit (new socket may hold a newer value)', () => {
    online(1);
    subscribed('s1');
    online(2); feed.scheduleHomeUpdate(io);
    subscribed('s2'); // gets online: 2
    online(1); // back to the old baseline
    settle();
    expect(io.sent.find(([, ev]) => ev === 'home:stats')).toEqual(['home', 'home:stats', { online: 1, playing: 0, searching: 0 }]);
  });
});

describe('unsubscribe / disconnect', () => {
  it('home:unsubscribe leaves the room; nobody left → nothing emitted', () => {
    const s = subscribed();
    s.fire('home:unsubscribe');
    expect(io._rooms.has('home')).toBe(false);
    online(5); feed.scheduleHomeUpdate(io); settle();
    expect(io.sent).toEqual([]);
  });

  it('after an empty spell the next subscriber still gets later changes', () => {
    const s = subscribed();
    s.fire('home:unsubscribe');
    online(4); feed.scheduleHomeUpdate(io); settle(); // nobody listening
    subscribed('s2');
    online(0); feed.scheduleHomeUpdate(io); settle();
    expect(io.sent).toEqual([['home', 'home:stats', { online: 0, playing: 0, searching: 0 }]]);
  });
});
