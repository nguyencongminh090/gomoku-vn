'use strict';

/**
 * presence-transitions.test.js — #487 transition rows (features/presence-status planning §2e/§2f) through
 * the real stores: state.js, RoomManager, RoomHandler presence handler, DisconnectHandler, presence adapter.
 * Row map: see presence-core.test.js header.
 */

jest.useFakeTimers();

jest.mock('../utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn(), register: jest.fn() }));
jest.mock('../managers/rank-cache', () => ({ standingOf: () => null, ratingsOf: () => ({}), onChange: () => {} }));
jest.mock('../socket/handlers/GameHandler', () => ({ handleGameEnd: jest.fn() }));

const config = require('../config');
const state = require('../socket/state');
const roomManager = require('../managers/RoomManager');
const RoomHandler = require('../socket/handlers/RoomHandler');
const DisconnectHandler = require('../socket/handlers/DisconnectHandler');
const presence = require('../presence');

const io = { to: () => ({ emit: () => {} }), in: () => ({ socketsLeave: () => {} }) };

function makeSocket(userId, data) {
  const handlers = {};
  return {
    id: `s-${userId}-${Math.random()}`, user: { userId, displayName: userId, isGuest: false },
    data: data || {}, handlers, on: (ev, fn) => { handlers[ev] = fn; },
    emit: () => {}, join: () => {}, leave: () => {}, to: () => ({ emit: () => {} }),
  };
}
function connect(socket) {
  state.sessions.set(socket.user.userId, socket);
  state.awayUsers.delete(socket.user.userId);
  RoomHandler.register(io, socket);
  return socket;
}
function disconnect(socket) {
  if (state.sessions.get(socket.user.userId) === socket) {
    state.sessions.delete(socket.user.userId);
    state.awayUsers.delete(socket.user.userId);
  }
  DisconnectHandler.handleDisconnect(io, socket);
}

let room;
function seatGame() {
  room = roomManager.createRoom({ userId: 'a', displayName: 'a', isGuest: false }, {}).room;
  roomManager.joinRoom({ userId: 'b', displayName: 'b', isGuest: false }, room.roomId);
  roomManager.joinRoom({ userId: 'v', displayName: 'v', isGuest: false }, room.roomId);
  roomManager.sitDown('a', 1);
  roomManager.sitDown('b', 2);
  room.state = 'playing';
  room.gameState = { status: 'ongoing', startedAt: 7, players: [{ userId: 'a' }, { userId: 'b' }], serialize: () => ({}) };
  state.timerMap.set(room.roomId, { stop: jest.fn(), start: jest.fn(), getSync: () => ({}), getTimers: () => ({}) });
}

afterEach(() => {
  for (const t of [state.disconnectTimers, state.spectatorGraceTimers, state.emptyRoomGraceTimers]) {
    for (const e of t.values()) { clearTimeout(e.timeout); if (e.countdown) clearInterval(e.countdown); }
    t.clear();
  }
  state.timerMap.clear();
  for (const id of [...roomManager.rooms.keys()]) roomManager._destroyRoom(id);
  roomManager.userRoomMap.clear();
  state.sessions.clear(); state.awayUsers.clear(); state.heartbeats.clear();
  for (const id of ['a', 'b', 'v', 'h']) state.setHideOnline(id, false);
  presence.setHooks({ isQueued: () => false, inTournament: () => false });
  jest.clearAllTimers();
});

describe('user scope through the live stores', () => {
  test('U4/U19 a report from an evicted (older) socket changes nothing', () => {
    const old = connect(makeSocket('a'));
    connect(makeSocket('a')); // newest socket wins the registry
    old.handlers['presence:set']({ presence: 'away' });
    expect(presence.statusOf('a', 'friend')).toEqual({ c: 'on', k: 'idle' });
  });

  test('U2/U3 away and back through the socket report', () => {
    const s = connect(makeSocket('a'));
    s.handlers['presence:set']({ presence: 'away' });
    expect(presence.statusOf('a', 'public')).toEqual({ c: 'off' }); // strangers: away = offline (#372)
    expect(presence.statusOf('a', 'friend')).toEqual({ c: 'on', a: 1, k: 'idle' });
    s.handlers['presence:set']({ presence: 'active' });
    expect(presence.statusOf('a', 'public')).toEqual({ c: 'on' });
  });

  test('U15 a client claiming "disconnected" is read as active', () => {
    const s = connect(makeSocket('a'));
    s.handlers['presence:set']({ presence: 'disconnected' });
    expect(presence.statusOf('a', 'public')).toEqual({ c: 'on' });
  });

  test('U11 / F2: two beat-only tabs — the hidden tab\'s away edge no longer hides the visible tab', () => {
    const u = { userId: 'h', displayName: 'h' };
    state.touchHeartbeat(u, 'active', Date.now(), 'tabA');
    state.touchHeartbeat(u, 'away', Date.now(), 'tabB');
    expect(state.isPresent('h')).toBe(true);
    expect(state.getOnlineUsersSorted().map((x) => x.userId)).toContain('h');
    state.touchHeartbeat(u, 'away', Date.now(), 'tabA');
    expect(state.isPresent('h')).toBe(false);
  });

  test('U11 control: a client without a tab id keeps the shared-slot behaviour', () => {
    const u = { userId: 'h', displayName: 'h' };
    state.touchHeartbeat(u, 'active');
    state.touchHeartbeat(u, 'away');
    expect(state.isPresent('h')).toBe(false);
  });

  test('beat tabs per member are bounded (extra ids fold into the shared slot)', () => {
    const u = { userId: 'h', displayName: 'h' };
    for (let i = 0; i < 40; i++) state.touchHeartbeat(u, 'active', Date.now(), `t${i}`);
    expect(state.heartbeats.get('h').tabs.size).toBeLessThanOrEqual(17);
  });

  test('U9 a beat page that stops beating goes offline after the TTL (prune)', () => {
    const u = { userId: 'h', displayName: 'h' };
    state.touchHeartbeat(u, 'active', Date.now() - state.BEAT_TTL_MS - 1, 'tabA');
    expect(presence.statusOf('h', 'public')).toEqual({ c: 'off' });
    expect(state.pruneHeartbeats()).toBe(true);
    expect(state.heartbeats.has('h')).toBe(false);
  });

  test('U12 hide-online: offline to friends/public, online to self', () => {
    connect(makeSocket('a'));
    state.setHideOnline('a', true);
    expect(presence.statusOf('a', 'friend')).toEqual({ c: 'off' });
    expect(presence.statusOf('a', 'public')).toEqual({ c: 'off' });
    expect(presence.statusOf('a', 'self').c).toBe('on');
  });

  test('U13 logout drops the beat at once', () => {
    state.touchHeartbeat({ userId: 'h', displayName: 'h' }, 'active', Date.now(), 'tabA');
    state.dropHeartbeat('h');
    expect(presence.statusOf('h', 'public')).toEqual({ c: 'off' });
  });

  test('U16/U18 activity from the match queue and tournament hooks', () => {
    connect(makeSocket('a'));
    presence.setHooks({ isQueued: (id) => id === 'a' });
    expect(presence.statusOf('a', 'friend')).toEqual({ c: 'on', k: 'search' });
    presence.setHooks({ inTournament: (id) => id === 'a' });
    expect(presence.statusOf('a', 'friend')).toEqual({ c: 'on', k: 'tour' });
  });

  test('U14 server restart: a fresh process knows nobody until they reconnect', () => {
    jest.isolateModules(() => {
      const fresh = require('../presence');
      expect(fresh.statusOf('a', 'self')).toEqual({ c: 'off' });
      require('../socket/state').sessions.set('a', makeSocket('a'));
      expect(fresh.statusOf('a', 'self')).toEqual({ c: 'on', k: 'idle' });
    });
  });
});

describe('seated game: drop, grace, return (U5-U8, M5-M9)', () => {
  beforeEach(() => {
    seatGame();
    for (const id of ['a', 'b', 'v']) connect(makeSocket(id, { roomPageId: room.roomId }));
  });

  test('U17 / problem 3: the waiting opponent reads "playing" while the other seat is in grace', () => {
    disconnect(state.sessions.get('a'));
    expect(room.state).toBe('interrupted');
    expect(presence.statusOf('b', 'friend')).toEqual({ c: 'on', k: 'play', r: room.roomId, t: 7 });
  });

  test('U6/M5 the dropped player is reconnecting (not offline) with a grace deadline', () => {
    const t0 = Date.now();
    disconnect(state.sessions.get('a'));
    expect(presence.statusOf('a', 'friend')).toEqual({ c: 're', k: 'play', r: room.roomId, t: 7 });
    expect(presence.graceUntil('a')).toBe(t0 + config.DISCONNECT_GRACE_MS);
    expect(room.users.get('a').presence).toBe('disconnected');
  });

  test('M9 a late report during the grace does not overwrite "disconnected"', () => {
    const s = state.sessions.get('a');
    disconnect(s);
    state.sessions.set('a', s); // pretend a stray report from it still arrives and passes the registry check
    s.handlers['room:presence']({ presence: 'active' });
    expect(room.users.get('a').presence).toBe('disconnected');
  });

  test('M6 a page bounce during the grace keeps the deadline (#422)', () => {
    disconnect(state.sessions.get('a'));
    const until = presence.graceUntil('a');
    jest.advanceTimersByTime(10_000);
    const lobbyPage = connect(makeSocket('a')); // a non-room page that never resumed the game
    disconnect(lobbyPage);
    expect(presence.graceUntil('a')).toBe(until);
  });

  test('U7/M7 back inside the grace: online, member active, no deadline', () => {
    disconnect(state.sessions.get('a'));
    const back = connect(makeSocket('a', { roomPageId: room.roomId }));
    expect(DisconnectHandler.cancelDisconnectGrace(io, back)).toBe(true);
    expect(presence.statusOf('a', 'friend').c).toBe('on');
    expect(room.users.get('a').presence).toBe('active');
    expect(presence.graceUntil('a')).toBeNull();
  });

  test('U8/M8 grace expires: offline, seat released, stays as viewer (#367)', () => {
    disconnect(state.sessions.get('a'));
    jest.advanceTimersByTime(config.DISCONNECT_GRACE_MS + 10);
    expect(presence.statusOf('a', 'friend')).toEqual({ c: 'off' });
    expect(room.users.get('a').slot).toBeNull();
    expect(room.users.get('a').presence).toBe('disconnected');
  });

  test('M2/M3 room page hidden / visible', () => {
    const s = state.sessions.get('v');
    s.handlers['room:presence']({ presence: 'away' });
    expect(room.users.get('v').presence).toBe('away');
    expect(presence.statusOf('v', 'friend')).toEqual({ c: 'on', a: 1, k: 'watch', r: room.roomId });
    s.handlers['room:presence']({ presence: 'active' });
    expect(room.users.get('v').presence).toBe('active');
  });

  test('M4 the member\'s socket is another page → away at the table, still online on the site', () => {
    const other = connect(makeSocket('v')); // lobby page, no roomPageId
    other.handlers['presence:set']({ presence: 'active' });
    expect(room.users.get('v').presence).toBe('away');
    expect(presence.statusOf('v', 'public')).toEqual({ c: 'on' });
  });

  test('M5/M10 a viewer who drops has no deadline and is not counted as watching', () => {
    disconnect(state.sessions.get('v'));
    expect(presence.graceUntil('v')).toBeNull();
    expect(presence.statusOf('v', 'friend')).toEqual({ c: 'off' });
    expect(roomManager.lobbyStat(room).userCount).toBe(2); // ghost viewer excluded (#158)
  });
});

describe('#488 wire: room members in grace carry graceUntil', () => {
  beforeEach(() => {
    seatGame();
    for (const id of ['a', 'b', 'v']) connect(makeSocket(id, { roomPageId: room.roomId }));
    roomManager.graceLookup = (id) => presence.graceUntil(id);
  });
  afterEach(() => { delete roomManager.graceLookup; });
  const member = (id) => roomManager.serializeRoom(room).users.find((u) => u.userId === id);

  test('absent while connected; the deadline while in grace; gone again after the return', () => {
    expect(member('a')).not.toHaveProperty('graceUntil');
    const t0 = Date.now();
    disconnect(state.sessions.get('a'));
    expect(member('a').graceUntil).toBe(t0 + config.DISCONNECT_GRACE_MS);
    const back = connect(makeSocket('a', { roomPageId: room.roomId }));
    DisconnectHandler.cancelDisconnectGrace(io, back);
    expect(member('a')).not.toHaveProperty('graceUntil');
  });

  test('a ghost viewer (no timeout, #115) carries no deadline', () => {
    disconnect(state.sessions.get('v'));
    expect(member('v').presence).toBe('disconnected');
    expect(member('v')).not.toHaveProperty('graceUntil');
  });
});

// #497 browser pass: after a mid-game return the next presence report marked the player 'away' — the resume path
// never marked the new socket as the room page (#373 roomPageId), so onPresence read it as "another page".
describe('#497 resume marks the returning socket as the room page', () => {
  beforeEach(() => {
    seatGame();
    for (const id of ['a', 'b', 'v']) connect(makeSocket(id, { roomPageId: room.roomId }));
  });

  test.each([
    ['room page handshake (roomPage true)', { roomPage: true }, 'active'],
    ['handshake naming this room', { roomPage: true, roomId: null }, 'active'],
  ])('%s → stays %s after the next report', (_c, auth, want) => {
    disconnect(state.sessions.get('a'));
    const back = makeSocket('a'); // fresh socket: no roomPageId yet
    back.handshake = { auth: { ...auth, roomId: auth.roomId === null ? room.roomId : auth.roomId } };
    connect(back);
    expect(DisconnectHandler.cancelDisconnectGrace(io, back)).toBe(true);
    back.handlers['room:presence']({ presence: 'active' });
    expect(room.users.get('a').presence).toBe(want);
    expect(back.data.roomPageId).toBe(room.roomId);
  });
});
