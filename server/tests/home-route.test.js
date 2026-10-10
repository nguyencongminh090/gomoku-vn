'use strict';

/**
 * home-route.test.js — GET /api/home dashboard payload (B195, R2).
 * buildHome() gets fake managers; the route test checks optional session + no-store.
 */

jest.useFakeTimers();
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({}));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => (sid === 'good' ? { userId: 'u1', isGuest: false, displayName: 'Me' } : null),
}));
jest.mock('../managers/RoomManager', () => {
  const r = { roomId: 'r1', roomName: 'Mine', state: 'idle', settings: {}, gameState: null,
    users: new Map([['u1', { userId: 'u1', slot: 1, displayName: 'Me' }]]) };
  return { rooms: new Map([['r1', r]]), getRoomByUser: (id) => (id === 'u1' ? r : null) };
});
jest.mock('../managers/tournament/TournamentManager', () => ({
  pairings: new Map(), listTournaments: () => [], getTournament: () => null,
}));

const express = require('express');
const http = require('http');
const homeRouter = require('../routes/home');
const { buildHome } = homeRouter;

const user = (userId, slot, displayName = userId, presence = 'active') => [userId, { userId, slot, displayName, presence }];

function room(roomId, users, extra = {}) {
  return {
    roomId, roomName: 'R ' + roomId, state: 'idle', users: new Map(users), gameState: null,
    settings: { winningRule: 'caro', timerMode: 'per_game', timerSeconds: 300, timerIncrementSeconds: 3 },
    ...extra,
  };
}
function engine(black, white, moves, currentTurn) {
  return {
    boardSize: 15, currentTurn,
    players: [{ userId: black, displayName: black, color: 'BLACK' }, { userId: white, displayName: white, color: 'WHITE' }],
    moveHistory: moves.map(([x, y], i) => ({ x, y, color: i % 2 ? 'WHITE' : 'BLACK' })),
  };
}
function roomsOf(list, byUser = {}) {
  return { rooms: new Map(list.map((r) => [r.roomId, r])), getRoomByUser: (id) => (byUser[id] ? list.find((r) => r.roomId === byUser[id]) : null) };
}
function tmOf(tournaments = [], pairings = []) {
  const byId = new Map(tournaments.map((t) => [t.tournamentId, t]));
  return {
    pairings: new Map(pairings.map((p) => [p.pairingId, p])),
    getTournament: (id) => byId.get(id) || null,
    listTournaments: () => tournaments.map((t) => ({
      tournamentId: t.tournamentId, name: t.name, format: 'swiss', status: t.status, playerCount: t.entries.size,
      entryUserIds: [...t.entries.values()].map((e) => e.userId),
    })),
  };
}
const tour = (id, status, entries) => ({ tournamentId: id, name: 'T ' + id, status, entries: new Map(entries.map((e) => [e.entryId, e])) });
const ME = { userId: 'u1', isGuest: false };
const EMPTY_TM = tmOf();

describe('buildHome — myGame', () => {
  it('seated player in a playing room: opponent, rule, myTurn true on my turn', () => {
    const r = room('r1', [user('u1', 1), user('u2', 2, 'Bob'), user('s1', null)], { state: 'playing', gameState: engine('u1', 'u2', [[7, 7]], 'u1') });
    const h = buildHome(ME, roomsOf([r], { u1: 'r1' }), EMPTY_TM);
    expect(h.myGame).toEqual({ roomId: 'r1', roomName: 'R r1', state: 'playing', opponent: 'Bob', myTurn: true,
      winningRule: 'caro', timerMode: 'per_game', timerSeconds: 300, timerIncrementSeconds: 3 });
  });

  it.each([
    ['opponent to move', { state: 'playing', gameState: engine('u1', 'u2', [[7, 7]], 'u2') }, false],
    ['waiting room (idle, no engine)', {}, false],
  ])('%s → myTurn %s', (_n, extra, turn) => {
    const r = room('r1', [user('u1', 1), user('u2', 2)], extra);
    expect(buildHome(ME, roomsOf([r], { u1: 'r1' }), EMPTY_TM).myGame.myTurn).toBe(turn);
  });

  it('alone in a room → opponent null; spectating → no myGame; no room → null', () => {
    expect(buildHome(ME, roomsOf([room('r1', [user('u1', 1)])], { u1: 'r1' }), EMPTY_TM).myGame.opponent).toBeNull();
    expect(buildHome(ME, roomsOf([room('r1', [user('u1', null)])], { u1: 'r1' }), EMPTY_TM).myGame).toBeNull();
    expect(buildHome(ME, roomsOf([]), EMPTY_TM).myGame).toBeNull();
  });

  it('guest seated in a casual room still sees it; signed-out does not', () => {
    const r = room('r1', [user('guest_1', 1)]);
    expect(buildHome({ userId: 'guest_1', isGuest: true }, roomsOf([r], { guest_1: 'r1' }), EMPTY_TM).myGame.roomId).toBe('r1');
    expect(buildHome(null, roomsOf([r], { guest_1: 'r1' }), EMPTY_TM).myGame).toBeNull();
  });
});

describe('buildHome — myMatches', () => {
  const t = tour('t1', 'active', [{ entryId: 'e1', userId: 'u1', displayName: 'Me' }, { entryId: 'e2', userId: 'u2', displayName: 'Bob' }, { entryId: 'e3', userId: 'u3', displayName: 'Cy' }]);
  const pair = (pairingId, p1, p2, state = 'Ready') => ({ pairingId, tournamentId: 't1', player1EntryId: p1, player2EntryId: p2, state, roundIndex: 2, agreedTime: 'A', deadline: 'D' });

  it('lists my open pairings from either side; skips Completed, byes, others', () => {
    const tm = tmOf([t], [pair('p1', 'e1', 'e2'), pair('p2', 'e3', 'e1', 'Negotiating'), pair('p3', 'e1', 'e2', 'Completed'), pair('p4', 'e1', null), pair('p5', 'e2', 'e3')]);
    const m = buildHome(ME, roomsOf([]), tm).myMatches;
    expect(m.map((x) => [x.pairingId, x.opponent, x.state])).toEqual([['p1', 'Bob', 'Ready'], ['p2', 'Cy', 'Negotiating']]);
    expect(m[0]).toMatchObject({ tournamentId: 't1', tournamentName: 'T t1', roundIndex: 2, agreedTime: 'A', deadline: 'D' });
  });

  it('guests / signed-out get none; dangling tournament or entry is skipped', () => {
    const tm = tmOf([t], [pair('p1', 'e1', 'e2'), { ...pair('p9', 'e1', 'eX') }, { ...pair('p8', 'e1', 'e2'), tournamentId: 'gone' }]);
    expect(buildHome({ userId: 'u1', isGuest: true }, roomsOf([]), tm).myMatches).toEqual([]);
    expect(buildHome(null, roomsOf([]), tm).myMatches).toEqual([]);
    expect(buildHome(ME, roomsOf([]), tm).myMatches.map((x) => x.pairingId)).toEqual(['p1']);
  });
});

describe('buildHome — tournaments', () => {
  it('draft|active only, max 5, registered flag; no entryUserIds leaked', () => {
    const list = [tour('a', 'completed', []), ...[1, 2, 3, 4, 5, 6].map((i) => tour('t' + i, i % 2 ? 'draft' : 'active', i === 2 ? [{ entryId: 'e', userId: 'u1' }] : []))];
    const h = buildHome(ME, roomsOf([]), tmOf(list));
    expect(h.tournaments.map((x) => x.tournamentId)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(h.tournaments.map((x) => x.registered)).toEqual([false, true, false, false, false]);
    expect(h.tournaments[0]).not.toHaveProperty('entryUserIds');
    expect(buildHome(null, roomsOf([]), tmOf(list)).tournaments.every((x) => x.registered === false)).toBe(true);
  });
});

describe('buildHome — live', () => {
  it('playing rooms only, top 3 by viewers, stones as [x,y,1|2], ghost viewers not counted, no user ids', () => {
    const mk = (id, viewers, moves) => room(id, [user('b' + id, 1), user('w' + id, 2),
      ...Array.from({ length: viewers }, (_, i) => user(id + 's' + i, null)), user(id + 'ghost', null, 'g', 'disconnected')],
    { state: 'playing', gameState: engine('b' + id, 'w' + id, moves, 'b' + id) });
    const rooms = [mk('a', 1, [[1, 1]]), mk('b', 5, [[2, 2], [3, 3]]), mk('c', 0, []), mk('d', 3, []), room('idle', [user('x', 1)])];
    const live = buildHome(null, roomsOf(rooms), EMPTY_TM).live;
    expect(live.map((l) => [l.roomId, l.viewers])).toEqual([['b', 5], ['d', 3], ['a', 1]]);
    expect(live[0]).toMatchObject({ black: 'bb', white: 'wb', boardSize: 15, stones: [[2, 2, 1], [3, 3, 2]], winningRule: 'caro' });
    expect(JSON.stringify(live)).not.toMatch(/userId/);
  });

  it('caps stones at 400 (latest kept)', () => {
    const moves = Array.from({ length: 450 }, (_, i) => [i % 30, Math.floor(i / 30)]);
    const r = room('r', [user('b', 1), user('w', 2)], { state: 'playing', gameState: engine('b', 'w', moves, 'b') });
    const s = buildHome(null, roomsOf([r]), EMPTY_TM).live[0].stones;
    expect(s).toHaveLength(400);
    expect(s[399].slice(0, 2)).toEqual([449 % 30, 14]);
  });

  it('empty site → all empty', () => {
    expect(buildHome(null, roomsOf([]), EMPTY_TM)).toEqual({ myGame: null, myMatches: [], tournaments: [], live: [], queue: {}, queueEta: {} });
  });
});

describe('queue counts (B210)', () => {
  it('buildHome passes the quick-match waiters per rule|time through', () => {
    const h = buildHome(ME, roomsOf([]), EMPTY_TM, () => ({ 'caro|5+3': 214 }));
    expect(h.queue).toEqual({ 'caro|5+3': 214 });
  });
});

describe('GET /api/home', () => {
  let server; let base;
  beforeAll((done) => {
    const app = express();
    app.use('/api/home', homeRouter);
    server = http.createServer(app).listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; done(); });
  });
  afterAll((done) => { server.close(done); });
  const get = (cookie) => new Promise((resolve, reject) => {
    http.get(base + '/api/home', { headers: cookie ? { cookie } : {} }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, cc: res.headers['cache-control'], body: JSON.parse(b) }));
    }).on('error', reject);
  });

  it('works signed-out (200, no-store) and with a session cookie', async () => {
    jest.useRealTimers();
    const out = await get();
    expect(out.status).toBe(200);
    expect(out.cc).toBe('no-store');
    expect(out.body).toEqual({ myGame: null, myMatches: [], tournaments: [], live: [], queue: {}, queueEta: {} });
    const name = require('../config').SESSION_COOKIE_NAME;
    expect((await get(name + '=good')).body.myGame).toMatchObject({ roomId: 'r1', roomName: 'Mine' });
    expect((await get(name + '=forged')).body.myGame).toBeNull();
  });
});
