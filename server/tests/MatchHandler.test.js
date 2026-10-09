'use strict';

/**
 * MatchHandler.test.js — quick match socket flow (B197, R3).
 * Real RoomManager (so the pair really becomes a seated room); mocked sockets, DB and broadcasts.
 */

jest.useFakeTimers();
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({
  getUserRanking: jest.fn((userId) => ({ m1: { rating: 1500 }, m2: { rating: 1560 }, far: { rating: 2400 } })[userId] || null),
}));
jest.mock('../socket/state', () => ({
  broadcastLobbyUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(),
  getClientIp: (s) => s.handshake.address,
}));

const roomManager = require('../managers/RoomManager');
const MatchHandler = require('../socket/handlers/MatchHandler');
const database = require('../db/database');

let io;
function makeSocket(userId, { isGuest = false, id = 'sock-' + userId, ip = '203.0.113.' + (userId.length) } = {}) {
  const handlers = {};
  const s = {
    id, user: { userId, displayName: 'N_' + userId, isGuest }, handshake: { address: ip, headers: {} },
    emitted: [], joined: new Set(),
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, data) { this.emitted.push([ev, data]); },
    join(r) { this.joined.add(r); }, leave(r) { this.joined.delete(r); },
    fire(ev, data) { (handlers[ev] || []).forEach((fn) => fn(data)); },
    last(ev) { const all = this.emitted.filter((e) => e[0] === ev); return all.length ? all[all.length - 1][1] : undefined; },
  };
  io.sockets.sockets.set(id, s);
  MatchHandler.register(io, s);
  return s;
}

beforeEach(() => {
  MatchHandler._reset();
  for (const id of [...roomManager.rooms.keys()]) roomManager._destroyRoom(id);
  io = { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) };
  database.getUserRanking.mockClear();
});
afterAll(() => MatchHandler._reset());

const join = (s, p) => s.fire('match:join', { rule: 'caro', time: '5+3', rated: true, ...p });

describe('match:join validation', () => {
  it.each([
    [{ rule: 'renju' }, 'BAD_RULE'],
    [{ time: '2+1' }, 'BAD_TIME'],
  ])('%j → %s', (p, code) => {
    const s = makeSocket('m1');
    join(s, p);
    expect(s.last('match:error').code).toBe(code);
    expect(MatchHandler._queue.size()).toBe(0);
  });

  it('guest cannot queue rated, can queue casual (rating not looked up)', () => {
    const g = makeSocket('guest_1', { isGuest: true });
    join(g);
    expect(g.last('match:error').code).toBe('RATED_NEEDS_ACCOUNT');
    join(g, { rated: false });
    expect(g.last('match:status')).toMatchObject({ waiting: true, inBucket: 1, rated: false });
    expect(database.getUserRanking).not.toHaveBeenCalled();
  });

  it('already in a room → refused', () => {
    const s = makeSocket('m1');
    roomManager.createRoom({ userId: 'm1', displayName: 'x', ip: '198.51.100.1' }, {});
    join(s);
    expect(s.last('match:error').code).toBe('ALREADY_IN_ANOTHER_ROOM');
  });

  it('rated entry carries the pool rating; unrated member defaults to 1200', () => {
    const a = makeSocket('m1');
    const n = makeSocket('newbie');
    join(a); join(n);
    expect(database.getUserRanking).toHaveBeenCalledWith('m1', 'caro');
    expect(MatchHandler._queue.get('m1').rating).toBe(1500);
    expect(MatchHandler._queue.get('newbie').rating).toBe(1200); // 300 apart → both still waiting
    expect(roomManager.rooms.size).toBe(0);
  });
});

describe('pairing → seated room', () => {
  it('two close members: one room, A in slot 1, B in slot 2, blitz 5+3, ranked, caro; both told', () => {
    const a = makeSocket('m1');
    const b = makeSocket('m2');
    join(a);
    expect(roomManager.rooms.size).toBe(0);
    join(b); // pairs immediately
    expect(roomManager.rooms.size).toBe(1);
    const room = [...roomManager.rooms.values()][0];
    expect(room.users.get('m1').slot).toBe(1);
    expect(room.users.get('m2').slot).toBe(2);
    expect(room.settings).toMatchObject({ timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3, winningRule: 'caro', ranked: true });
    expect(room.state).not.toBe('playing'); // the ready check still runs
    for (const s of [a, b]) {
      expect(s.last('match:found')).toEqual({ roomId: room.roomId });
      expect(s.last('room:joined').roomId).toBe(room.roomId);
      expect(s.joined.has(room.roomId)).toBe(true);
      expect(s.joined.has('lobby')).toBe(false);
    }
    expect(MatchHandler._queue.size()).toBe(0);
  });

  it('casual guests pair FIFO into an unranked room', () => {
    const a = makeSocket('guest_a', { isGuest: true });
    const b = makeSocket('guest_b', { isGuest: true });
    join(a, { rated: false, time: '1+0', rule: 'freestyle' });
    join(b, { rated: false, time: '1+0', rule: 'freestyle' });
    const room = [...roomManager.rooms.values()][0];
    expect(room.settings).toMatchObject({ ranked: false, timerSeconds: 60, timerIncrementSeconds: 0, winningRule: 'freestyle' });
  });

  it('far ratings wait, then pair once the window opens (30 s of ticks)', () => {
    const a = makeSocket('m1');
    const f = makeSocket('far');
    join(a); join(f);
    expect(roomManager.rooms.size).toBe(0);
    jest.advanceTimersByTime(29000);
    expect(roomManager.rooms.size).toBe(0);
    expect(a.last('match:status')).toMatchObject({ waiting: true, inBucket: 2 });
    jest.advanceTimersByTime(2000);
    expect(roomManager.rooms.size).toBe(1);
  });

  it('same user from two tabs never pairs with themself', () => {
    const t1 = makeSocket('m1', { id: 'tab1' });
    const t2 = makeSocket('m1', { id: 'tab2' });
    join(t1); join(t2);
    jest.advanceTimersByTime(40000);
    expect(roomManager.rooms.size).toBe(0);
    expect(MatchHandler._queue.get('m1').socketId).toBe('tab2');
  });

  it('a queued user who meanwhile entered a room is dropped, not paired', () => {
    const a = makeSocket('m1');
    join(a);
    roomManager.createRoom({ userId: 'm1', displayName: 'x', ip: '198.51.100.1' }, {});
    const b = makeSocket('m2');
    join(b);
    expect(MatchHandler._queue.get('m1')).toBeNull();
    expect(MatchHandler._queue.get('m2')).not.toBeNull();
    expect(roomManager.rooms.size).toBe(1); // only m1's own room
  });
});

describe('leaving the queue', () => {
  it('match:leave removes the entry and confirms', () => {
    const a = makeSocket('m1');
    join(a);
    a.fire('match:leave');
    expect(MatchHandler._queue.size()).toBe(0);
    expect(a.last('match:status')).toEqual({ waiting: false });
  });

  it('disconnect of the queued tab removes it; disconnect of an older tab does not', () => {
    const t1 = makeSocket('m1', { id: 'tab1' });
    const t2 = makeSocket('m1', { id: 'tab2' });
    join(t1); join(t2); // tab2's entry replaced tab1's
    t1.fire('disconnect');
    expect(MatchHandler._queue.get('m1')).not.toBeNull();
    t2.fire('disconnect');
    expect(MatchHandler._queue.get('m1')).toBeNull();
  });

  it('ticker stops once the queue is empty', () => {
    const a = makeSocket('m1');
    join(a);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    a.fire('match:leave');
    jest.advanceTimersByTime(1000);
    const before = jest.getTimerCount();
    jest.advanceTimersByTime(5000);
    expect(jest.getTimerCount()).toBe(before);
  });
});

