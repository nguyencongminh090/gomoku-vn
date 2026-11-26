'use strict';

/**
 * presence-emit-baseline.test.js — #486 (features/presence-status planning §5).
 *
 * Pins how many broadcasts each presence transition sends TODAY, through the real state.js, RoomManager,
 * RoomHandler presence handler and DisconnectHandler. The presence refactor (#487-#496) may lower these
 * numbers, never raise them. Counts are per target (one `io.to(x).emit` = one broadcast to everyone in x),
 * after every debounce has flushed.
 */

jest.useFakeTimers();

jest.mock('../utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const mockHome = { scheduleHomeUpdate: jest.fn(), register: jest.fn() };
jest.mock('../socket/home-feed', () => mockHome);
jest.mock('../managers/rank-cache', () => ({ standingOf: () => null, ratingsOf: () => ({}), onChange: () => {} }));
jest.mock('../socket/handlers/GameHandler', () => ({ handleGameEnd: jest.fn() }));

const state = require('../socket/state');
const roomManager = require('../managers/RoomManager');
const RoomHandler = require('../socket/handlers/RoomHandler');
const DisconnectHandler = require('../socket/handlers/DisconnectHandler');

const SETTLE_MS = Math.max(state.ONLINE_USERS_DEBOUNCE_MS, 80) + 50;

function makeIo() {
  const log = [];
  return {
    log,
    to: (target) => ({ emit: (event) => log.push(`${target} ${event}`) }),
    in: () => ({ socketsLeave: () => {} }),
  };
}

function makeSocket(userId, data) {
  const handlers = {};
  const sent = [];
  return {
    id: `s-${userId}-${Math.random()}`,
    user: { userId, displayName: userId.toUpperCase(), isGuest: false },
    data: data || {},
    handlers,
    sent,
    on: (ev, fn) => { handlers[ev] = fn; },
    emit: (event) => sent.push(event),
    join: () => {},
    leave: () => {},
    to: (target) => ({ emit: (event) => sent.push(`to:${target} ${event}`) }),
  };
}

/** Same three lines as SocketHandler's connect / disconnect blocks (session registry + online list). */
function connect(io, socket) {
  state.sessions.set(socket.user.userId, socket);
  state.awayUsers.delete(socket.user.userId);
  state.broadcastOnlineUsers(io);
  RoomHandler.register(io, socket);
}
function disconnect(io, socket) {
  if (state.sessions.get(socket.user.userId) === socket) {
    state.sessions.delete(socket.user.userId);
    state.awayUsers.delete(socket.user.userId);
    state.broadcastOnlineUsers(io);
  }
  DisconnectHandler.handleDisconnect(io, socket);
}

const count = (io, target, event) => io.log.filter((l) => l === `${target} ${event}`).length;
const settle = () => jest.advanceTimersByTime(SETTLE_MS);

let io; let room; let sockets;

beforeEach(() => {
  io = makeIo();
  mockHome.scheduleHomeUpdate.mockClear();
  // A seated game a (slot 1) vs b (slot 2), spectator c, lobby user d — all on their pages.
  const a = { userId: 'a', displayName: 'A', isGuest: false };
  room = roomManager.createRoom(a, { roomName: 'baseline' }).room;
  roomManager.joinRoom({ userId: 'b', displayName: 'B', isGuest: false }, room.roomId);
  roomManager.joinRoom({ userId: 'c', displayName: 'C', isGuest: false }, room.roomId);
  roomManager.sitDown('a', 1);
  roomManager.sitDown('b', 2);
  room.state = 'playing';
  room.gameState = {
    status: 'ongoing',
    players: [{ userId: 'a' }, { userId: 'b' }],
    serialize: () => ({}),
  };
  state.timerMap.set(room.roomId, { stop: jest.fn(), start: jest.fn(), getSync: () => ({}), getTimers: () => ({}) });

  sockets = {};
  for (const id of ['a', 'b', 'c']) { sockets[id] = makeSocket(id, { roomPageId: room.roomId }); connect(io, sockets[id]); }
  sockets.d = makeSocket('d'); connect(io, sockets.d);
  state.sendOnlineSnapshot(io, makeSocket('lobby-viewer'));
  settle();
  io.log.length = 0;
  mockHome.scheduleHomeUpdate.mockClear();
});

afterEach(() => {
  for (const t of [state.disconnectTimers, state.spectatorGraceTimers, state.emptyRoomGraceTimers]) {
    for (const e of t.values()) { clearTimeout(e.timeout); if (e.countdown) clearInterval(e.countdown); }
    t.clear();
  }
  state.timerMap.clear();
  for (const id of [...roomManager.rooms.keys()]) roomManager._destroyRoom(id);
  roomManager.userRoomMap.clear();
  state.sessions.clear();
  state.awayUsers.clear();
  state.setHideOnline('d', false);
  jest.clearAllTimers();
});

describe('#486 presence emit baseline (today, before the refactor)', () => {
  test('room-page tab switch: 1 inbound report → 1 room:updated + 1 lobby patch', () => {
    // #492: room-socket.js is the room page's one reporter (before: socket-client.js sent presence:set too, F1;
    // the duplicate was a server no-op, so the outbound counts below did not change).
    sockets.a.handlers['room:presence']({ presence: 'away' });
    settle();
    expect(count(io, room.roomId, 'room:updated')).toBe(1);
    expect(count(io, 'lobby', 'lobby:online_patch')).toBe(1);
    expect(io.log).toHaveLength(2);
    expect(mockHome.scheduleHomeUpdate).toHaveBeenCalledTimes(1); // home-feed debounces itself
    expect(room.users.get('a').presence).toBe('away');
  });

  test('lobby-page tab switch: 1 report → 1 lobby patch, no room traffic', () => {
    sockets.d.handlers['presence:set']({ presence: 'away' });
    settle();
    expect(io.log).toEqual(['lobby lobby:online_patch']);
  });

  test('repeat report: nothing is sent', () => {
    sockets.d.handlers['presence:set']({ presence: 'active' });
    sockets.a.handlers['room:presence']({ presence: 'active' });
    settle();
    expect(io.log).toEqual([]);
  });

  test('socket drop mid-game: game:interrupted + room:updated to the room, 1 lobby patch', () => {
    disconnect(io, sockets.a);
    settle();
    expect(count(io, room.roomId, 'game:interrupted')).toBe(1);
    expect(count(io, room.roomId, 'room:updated')).toBe(1);
    expect(count(io, 'lobby', 'lobby:online_patch')).toBe(1);
    expect(io.log).toHaveLength(3);
    expect(room.users.get('a').presence).toBe('disconnected');
  });

  test('reconnect mid-game: game:resumed to the others, game:init to the returner, room:updated, lobby patch', () => {
    disconnect(io, sockets.a);
    settle();
    io.log.length = 0;
    const back = makeSocket('a', { roomPageId: room.roomId });
    connect(io, back);
    expect(DisconnectHandler.cancelDisconnectGrace(io, back)).toBe(true);
    settle();
    expect(back.sent).toEqual([`to:${room.roomId} game:resumed`, 'game:init']);
    expect(count(io, room.roomId, 'room:updated')).toBe(1);
    expect(count(io, 'lobby', 'lobby:online_patch')).toBe(1);
    expect(io.log).toHaveLength(2);
  });

  test('hide_online flip: 1 lobby patch, no room traffic', () => {
    state.setHideOnline('d', true);
    settle();
    expect(io.log).toEqual(['lobby lobby:online_patch']);
  });

  test('F3 fixed (#492): a fresh room-page load names its room at connect → stays watching, no room:updated', () => {
    // The handshake carries auth.roomId from the URL, so SocketHandler marks the socket as the room page at once
    // (modelled here by roomPageId), and socket-client.js no longer reports presence on the room page.
    const fresh = makeSocket('c', { roomPageId: room.roomId });
    connect(io, fresh);
    expect(room.users.get('c').presence).toBe('active');
    settle();
    expect(count(io, room.roomId, 'room:updated')).toBe(0);
  });

  test('old cached client (pre-#492) still works: its early presence:set reads away for one room:updated', () => {
    const fresh = makeSocket('c'); // no roomPageId: an old page whose handshake had no roomId
    connect(io, fresh);
    fresh.handlers['presence:set']({ presence: 'active' });
    expect(room.users.get('c').presence).toBe('away');
    settle();
    expect(count(io, room.roomId, 'room:updated')).toBe(1);
  });
});
