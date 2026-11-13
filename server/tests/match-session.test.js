'use strict';

/**
 * match-session.test.js — #365 quick-match session: up to 3 games, a
 * "Chơi tiếp / Về trang chủ" decision window after each, then home.
 * Real RoomManager + state.js; DB mocked, fake timers.
 */

jest.useFakeTimers();
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../db/database', () => ({ saveGame: jest.fn() }));
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn() }));

const roomManager = require('../managers/RoomManager');
const state = require('../socket/state');
const { handleGameEnd } = require('../socket/handlers/GameHandler');

function makeIo() {
  const emitted = [];
  const left = [];
  return {
    emitted, left,
    to: (room) => ({ emit: (event, data) => emitted.push({ room, event, data }) }),
    in: (room) => ({ socketsLeave: () => left.push(room) }),
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  };
}

function seatedMatchRoom() {
  const { room } = roomManager.createRoom({ userId: 'a', displayName: 'A', ip: '198.51.100.1' }, {});
  roomManager.joinRoom({ userId: 'b', displayName: 'B', ip: '198.51.100.2' }, room.roomId);
  roomManager.sitDown('a', 1);
  roomManager.sitDown('b', 2);
  room.matchmade = true;
  room.matchGames = 0;
  room.matchMax = 3;
  room.matchPlayers = ['a', 'b'];
  return room;
}

function endGame(io, room, winner = 'a') {
  room.state = 'playing';
  room.gameState = {
    gameId: 'g' + Math.random(), roomId: room.roomId, ranked: false, settings: { winningRule: 'caro' },
    players: [
      { userId: 'a', displayName: 'A', color: 'BLACK', isGuest: false },
      { userId: 'b', displayName: 'B', color: 'WHITE', isGuest: false },
    ],
    result: { winner, reason: 'normal' }, boardSize: 15, walls: [], portals: [], moveHistory: [],
  };
  handleGameEnd(io, room);
}

const closed = (io) => io.emitted.filter((e) => e.event === 'room:destroyed').map((e) => e.data.code);

beforeEach(() => {
  for (const id of [...roomManager.rooms.keys()]) roomManager._destroyRoom(id);
  for (const id of [...state.readyTimers.keys()]) state.cleanupReadyTimer(id);
});

describe('#365 quick-match session', () => {
  test('a game end counts and opens the decision window (readyDeadline set)', () => {
    const io = makeIo();
    const room = seatedMatchRoom();
    endGame(io, room);
    expect(room.matchGames).toBe(1);
    expect(room.readyDeadline).toBeGreaterThan(Date.now());
    expect(roomManager.serializeRoom(room)).toMatchObject({ matchmade: true, matchGames: 1, matchMax: 3 });
  });

  test('nobody picks "Chơi tiếp" in time → room closes with MATCH_NO_REMATCH', () => {
    const io = makeIo();
    const room = seatedMatchRoom();
    endGame(io, room);
    jest.advanceTimersByTime(state.READY_WINDOW_MS - 1);
    expect(roomManager.getRoom(room.roomId)).toBeTruthy();
    jest.advanceTimersByTime(1);
    expect(closed(io)).toEqual(['MATCH_NO_REMATCH']);
    expect(roomManager.getRoom(room.roomId)).toBeFalsy();
    expect(roomManager.getRoomIdByUser('a')).toBeFalsy();
  });

  test('both pick "Chơi tiếp" → allReady, the first click does not open a second window', () => {
    const io = makeIo();
    const room = seatedMatchRoom();
    endGame(io, room);
    const deadline = room.readyDeadline;
    expect(roomManager.confirmStart('a').allReady).toBe(false);
    state.handleReadyClick(io, room);
    expect(room.readyDeadline).toBe(deadline);
    expect(roomManager.confirmStart('b').allReady).toBe(true);
  });

  test('after the 3rd game: room:ready refused, room closes after MATCH_END_CLOSE_MS', () => {
    const io = makeIo();
    const room = seatedMatchRoom();
    endGame(io, room);
    endGame(io, room, 'draw');
    endGame(io, room, 'b');
    expect(room.matchGames).toBe(3);
    expect(roomManager.confirmStart('a')).toMatchObject({ code: 'MATCH_LIMIT_REACHED' });
    jest.advanceTimersByTime(state.MATCH_END_CLOSE_MS);
    expect(closed(io)).toEqual(['MATCH_SESSION_DONE']);
    expect(roomManager.getRoom(room.roomId)).toBeFalsy();
  });

  test('a seated player leaving emits match_abandoned; a spectator leaving does not', () => {
    const room = seatedMatchRoom();
    roomManager.joinRoom({ userId: 'w', displayName: 'W', ip: '198.51.100.3' }, room.roomId);
    const seen = [];
    const onAbandon = (r, uid) => seen.push(uid);
    roomManager.on('match_abandoned', onAbandon);
    roomManager.leaveRoom('w');
    roomManager.leaveRoom('a');
    roomManager.off('match_abandoned', onAbandon);
    expect(seen).toEqual(['a']);
  });

  test('closeMatchRoom: closes with the given code, never mid-game', () => {
    const io = makeIo();
    const room = seatedMatchRoom();
    room.state = 'playing';
    state.closeMatchRoom(io, room.roomId, 'MATCH_OPPONENT_LEFT');
    expect(roomManager.getRoom(room.roomId)).toBeTruthy();
    room.state = 'idle';
    state.closeMatchRoom(io, room.roomId, 'MATCH_OPPONENT_LEFT');
    expect(closed(io)).toEqual(['MATCH_OPPONENT_LEFT']);
    expect(io.left).toEqual([room.roomId]);
    expect(roomManager.getRoom(room.roomId)).toBeFalsy();
  });

  test('manual rooms are untouched: no count, no window, ready not capped', () => {
    const io = makeIo();
    const room = seatedMatchRoom();
    room.matchmade = false;
    endGame(io, room);
    expect(room.matchGames).toBe(0);
    expect(room.readyDeadline).toBeNull();
    expect(roomManager.confirmStart('a').error).toBeUndefined();
  });
});

describe('#365 seat lock: the matched pair cannot be swapped', () => {
  test('a stranger cannot sit; the pair cannot stand up', () => {
    const room = seatedMatchRoom();
    roomManager.joinRoom({ userId: 'w', displayName: 'W', ip: '198.51.100.3' }, room.roomId);
    roomManager.leaveRoom('b');
    expect(roomManager.sitDown('w', 2)).toMatchObject({ code: 'MATCH_SEAT_LOCKED' });
    expect(roomManager.standUp('a')).toMatchObject({ code: 'MATCH_SEAT_LOCKED' });
    expect(room.users.get('a').slot).toBe(1);
  });

  test('manual rooms: anyone sits, players stand', () => {
    const room = seatedMatchRoom();
    room.matchmade = false;
    expect(roomManager.standUp('b').error).toBeUndefined();
    roomManager.joinRoom({ userId: 'w', displayName: 'W', ip: '198.51.100.3' }, room.roomId);
    expect(roomManager.sitDown('w', 2).error).toBeUndefined();
  });

  test('3rd ready miss vacates a seat → match_abandoned (session ends)', () => {
    const room = seatedMatchRoom();
    const seen = [];
    const on = (r, uid) => seen.push(uid);
    roomManager.on('match_abandoned', on);
    roomManager.confirmStart('a');
    for (let i = 0; i < 3; i++) { room.users.get('a').ready = true; roomManager.registerReadyMiss(room.roomId); }
    roomManager.off('match_abandoned', on);
    expect(seen).toEqual(['b']);
    expect(room.users.get('b').slot).toBeNull();
  });
});
