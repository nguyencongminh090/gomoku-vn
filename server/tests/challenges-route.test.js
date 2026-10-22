'use strict';

/**
 * challenges-route.test.js — /api/challenges (#198 slice 3): validation, accept → seated room, notifications, expiry.
 * Real SQL on an in-memory DB; session = raw cookie header = user id.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => ({ userId: sid === 'guest' ? null : sid }),
}));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = req.headers.cookie === 'guest' ? { userId: 'guest_abc', isGuest: true } : { userId: req.headers.cookie }; // realistic guest (#280): a guest_… id + isGuest, never a null id
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const challengesRouter = require('../routes/challenges');
const notif = require('../managers/NotificationService');
const svc = require('../managers/ChallengeService');
const roomManager = require('../managers/RoomManager');

const NOW = '2026-10-09T00:00:00.000Z';
const db = database.db;
const U = {};
let server, base;

function addUser(name, rating) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW);
  if (rating) {
    db.prepare(`INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, 'freestyle', ?, 100, 0.06, 20, ?)`)
      .run(id, rating, NOW);
  }
}

function call(method, urlPath, as, body) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (as) headers.cookie = U[as] || as;
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const send = (as, to, extra = {}) => call('POST', '/api/challenges', as, { to, rule: 'caro', time: '3+2', rated: false, ...extra });
const types = (id) => notif.list(id, 50).items.map((n) => n.type);
let seated;

beforeAll(async () => {
  addUser('ann'); addUser('bob'); addUser('cat');
  const app = express();
  app.use('/api/challenges', challengesRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  svc._reset();
  db.prepare('DELETE FROM notifications').run();
  for (const id of [...roomManager.userRoomMap.keys()]) roomManager.leaveRoom(id);
  seated = [];
  notif.setEmitter(() => {});
  svc.setHooks({ onSeated: (room, ids) => seated.push({ roomId: room.roomId, ids }), isOnline: () => false });
});

describe('send', () => {
  it('stores a challenge, notifies the target (with the challenge id), lists it on both sides', async () => {
    const r = await send('ann', 'bob', { rated: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ rule: 'caro', time: '3+2', rated: true });
    const n = notif.list(U.bob).items[0];
    expect(n).toMatchObject({ type: 'challenge', payload: { challengeId: r.body.id, rule: 'caro', time: '3+2', rated: true, from: { username: 'ann' } } });
    const bob = (await call('GET', '/api/challenges', 'bob')).body;
    expect(bob.incoming).toHaveLength(1);
    expect(bob.incoming[0].from.username).toBe('ann');
    expect((await call('GET', '/api/challenges', 'ann')).body.outgoing[0].to.username).toBe('bob');
  });

  it('rejects self, unknown user, bad rule, bad time; guests 403; logged-out 401', async () => {
    expect((await send('ann', 'ann')).body.code).toBe('CANNOT_CHALLENGE_SELF');
    expect((await send('ann', 'nobody')).status).toBe(404);
    expect((await send('ann', 'bob', { rule: 'renju' })).body.code).toBe('BAD_RULE');
    expect((await send('ann', 'bob', { time: '99+9' })).body.code).toBe('BAD_TIME');
    expect((await send('guest', 'bob')).status).toBe(403);
    expect((await send(undefined, 'bob')).status).toBe(401);
  });

  it('a re-send replaces the old challenge (one pending per pair, one notification)', async () => {
    const a = (await send('ann', 'bob')).body;
    const b = (await send('ann', 'bob', { time: '5+3' })).body;
    expect(b.id).not.toBe(a.id);
    expect((await call('GET', '/api/challenges', 'bob')).body.incoming.map((c) => c.time)).toEqual(['5+3']);
    expect(types(U.bob)).toEqual(['challenge']);
  });

  it('caps outgoing challenges', async () => {
    for (let i = 0; i < svc.MAX_OUTGOING; i++) { addUser(`t${i}`); expect((await send('ann', `t${i}`)).status).toBe(201); }
    expect((await send('ann', 'bob')).body.code).toBe('TOO_MANY_CHALLENGES');
  });
});

describe('accept', () => {
  it('seats challenger in slot 1 and accepter in slot 2 with the chosen rule/clock/ranked; both notified; hook fires', async () => {
    const c = (await send('ann', 'bob', { rule: 'standard', time: '5+3', rated: true })).body;
    const r = await call('POST', `/api/challenges/${c.id}/accept`, 'bob');
    expect(r.status).toBe(200);
    const room = roomManager.getRoom(r.body.roomId);
    expect(roomManager.getRoomByUser(U.ann)).toBe(room);
    expect(roomManager.getRoomByUser(U.bob)).toBe(room);
    expect(room.users.get(U.ann).slot).toBe(1);
    expect(room.users.get(U.bob).slot).toBe(2);
    expect(room.settings).toMatchObject({ winningRule: 'standard', ranked: true, timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3 });
    expect(types(U.bob)).toEqual([]); // request cleared from the accepter's bell
    const got = notif.list(U.ann).items[0];
    expect(got).toMatchObject({ type: 'challenge_accepted', payload: { roomId: room.roomId, from: { username: 'bob' } } });
    expect(seated).toEqual([{ roomId: room.roomId, ids: [U.ann, U.bob] }]);
    expect((await call('GET', '/api/challenges', 'bob')).body.incoming).toHaveLength(0);
  });

  it('only the recipient accepts; a used/unknown id is 404', async () => {
    const c = (await send('ann', 'bob')).body;
    expect((await call('POST', `/api/challenges/${c.id}/accept`, 'ann')).body.code).toBe('NOT_YOUR_CHALLENGE');
    expect((await call('POST', `/api/challenges/${c.id}/accept`, 'cat')).body.code).toBe('NOT_YOUR_CHALLENGE');
    expect((await call('POST', '/api/challenges/nope/accept', 'bob')).body.code).toBe('CHALLENGE_GONE');
    await call('POST', `/api/challenges/${c.id}/accept`, 'bob');
    expect((await call('POST', `/api/challenges/${c.id}/accept`, 'bob')).status).toBe(404);
  });

  it('refuses when either side is already in a room, and keeps the challenge', async () => {
    const c = (await send('ann', 'bob')).body;
    roomManager.createRoom({ userId: U.ann, displayName: 'ANN', ip: '1.1.1.1' }, {});
    expect((await call('POST', `/api/challenges/${c.id}/accept`, 'bob')).body.code).toBe('ALREADY_IN_ANOTHER_ROOM');
    roomManager.leaveRoom(U.ann);
    roomManager.createRoom({ userId: U.bob, displayName: 'BOB', ip: '1.1.1.2' }, {});
    expect((await call('POST', `/api/challenges/${c.id}/accept`, 'bob')).status).toBe(409);
    expect((await call('GET', '/api/challenges', 'bob')).body.incoming).toHaveLength(1);
  });
});

describe('decline / cancel / expiry', () => {
  it('recipient declines and sender cancels: challenge and its notification vanish; stranger 403; repeat is a no-op', async () => {
    let c = (await send('ann', 'bob')).body;
    expect((await call('DELETE', `/api/challenges/${c.id}`, 'cat')).status).toBe(403);
    expect((await call('DELETE', `/api/challenges/${c.id}`, 'bob')).status).toBe(200);
    expect(types(U.bob)).toEqual([]);
    expect((await call('DELETE', `/api/challenges/${c.id}`, 'bob')).status).toBe(200);
    c = (await send('ann', 'bob')).body;
    expect((await call('DELETE', `/api/challenges/${c.id}`, 'ann')).status).toBe(200);
    expect(types(U.bob)).toEqual([]);
    expect((await call('GET', '/api/challenges', 'bob')).body.incoming).toHaveLength(0);
  });

  it('expires after TTL (challenge + notification gone)', () => {
    jest.useFakeTimers();
    try {
      svc.send(U.ann, 'bob', { rule: 'caro', time: '1+0' });
      expect(svc.list(U.bob).incoming).toHaveLength(1);
      jest.advanceTimersByTime(svc.TTL_MS - 1);
      expect(svc.list(U.bob).incoming).toHaveLength(1);
      jest.advanceTimersByTime(2);
      expect(svc.list(U.bob).incoming).toHaveLength(0);
      expect(types(U.bob)).toEqual([]);
    } finally { jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] }); }
  });

  it('a seated user who never connects is released after the grace; an online one stays', () => {
    jest.useFakeTimers();
    try {
      svc.setHooks({ isOnline: (id) => id === U.ann, onSeated: () => {} });
      const c = svc.send(U.ann, 'bob', { rule: 'caro', time: '1+0' });
      const { roomId } = svc.accept(U.bob, c.id, '2.2.2.2');
      jest.advanceTimersByTime(svc.SEAT_GRACE_MS + 1);
      expect(roomManager.getRoomByUser(U.bob)).toBeFalsy();
      expect(roomManager.getRoomByUser(U.ann)).toBe(roomManager.getRoom(roomId));
    } finally { jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] }); }
  });
});

describe('#222 full settings, series, Swap Elo stake', () => {
  const FULL = {
    boardSize: 19, winningRule: 'standard', ranked: true, ruleWall: true, rulePortal: false, ruleSwap2: false,
    timerMode: 'per_game', timerSeconds: 600, timerIncrementSeconds: 0,
  };
  const sendFull = (as, to, extra = {}, settings = {}) =>
    call('POST', '/api/challenges', as, { to, settings: { ...FULL, ...settings }, ...extra });
  const setGames = (name, games, cat = 'standard') => db.prepare(`
    INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, ?, 1500, 80, 0.06, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET games = excluded.games`).run(U[name], cat, games, NOW);
  beforeEach(() => { db.prepare('DELETE FROM ratings').run(); db.prepare('DELETE FROM elo_swaps').run(); });

  it('stores and shows every create-room field + games + stake (incoming row and notification)', async () => {
    const r = await sendFull('ann', 'bob', { games: 3 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ settings: FULL, games: 3, stake: 'none', rule: 'standard', rated: true });
    const inc = (await call('GET', '/api/challenges', 'bob')).body.incoming[0];
    expect(inc).toMatchObject({ settings: FULL, games: 3, stake: 'none' });
    expect(notif.list(U.bob).items[0].payload).toMatchObject({ settings: FULL, games: 3, stake: 'none' });
  });

  it('normalises like room create: Swap2 clears wall/portal; increment only in blitz', async () => {
    let r = await sendFull('ann', 'bob', {}, { ruleSwap2: true, ruleWall: true, rulePortal: true });
    expect(r.body.settings).toMatchObject({ ruleSwap2: true, ruleWall: false, rulePortal: false });
    r = await sendFull('ann', 'bob', {}, { timerMode: 'per_move', timerIncrementSeconds: 5 });
    expect(r.body.settings.timerIncrementSeconds).toBe(0);
    r = await sendFull('ann', 'bob', {}, { timerMode: 'blitz', timerSeconds: 180, timerIncrementSeconds: 2 });
    expect(r.body.settings).toMatchObject({ timerMode: 'blitz', timerSeconds: 180, timerIncrementSeconds: 2 });
  });

  it.each([
    [{ boardSize: 16 }, 'BAD_SETTINGS'],
    [{ boardSize: '19' }, 'BAD_SETTINGS'],
    [{ winningRule: 'renju' }, 'BAD_RULE'],
    [{ ruleWall: 'yes' }, 'BAD_SETTINGS'],
    [{ ranked: undefined }, 'BAD_SETTINGS'],
    [{ timerMode: 'hourglass' }, 'BAD_TIME'],
    [{ timerSeconds: 4 }, 'BAD_TIME'],
    [{ timerSeconds: 3601 }, 'BAD_TIME'],
    [{ timerSeconds: 60.5 }, 'BAD_TIME'],
    [{ timerMode: 'blitz', timerIncrementSeconds: 601 }, 'BAD_TIME'],
  ])('rejects settings %j → %s', async (patch, code) => {
    const r = await sendFull('ann', 'bob', {}, patch);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe(code);
  });

  it('boundaries accepted: 5 s and 3600 s, increment 600 in blitz', async () => {
    expect((await sendFull('ann', 'bob', {}, { timerSeconds: 5 })).status).toBe(201);
    expect((await sendFull('ann', 'bob', {}, { timerSeconds: 3600, timerMode: 'blitz', timerIncrementSeconds: 600 })).status).toBe(201);
  });

  it.each([[0], [100], [-1], [3.5], ['3']])('rejects games=%p', async (games) => {
    expect((await sendFull('ann', 'bob', { games })).body.code).toBe('BAD_GAMES');
  });

  it.each([[1], [2], [7], [10], [99]])('accepts games=%p', async (games) => {
    expect((await sendFull('ann', 'bob', { games })).status).toBe(201);
  });

  it('rejects an unknown stake; settings must be an object', async () => {
    expect((await sendFull('ann', 'bob', { stake: 'all-in' })).body.code).toBe('BAD_STAKE');
    expect((await call('POST', '/api/challenges', 'ann', { to: 'bob', settings: [1] })).body.code).toBe('BAD_SETTINGS');
  });

  describe('Swap Elo guards', () => {
    it('rated only', async () => {
      setGames('ann', 50); setGames('bob', 50);
      expect((await sendFull('ann', 'bob', { stake: 'swap' }, { ranked: false })).body.code).toBe('STAKE_NEEDS_RATED');
    });

    it('both players need the minimum rated games in the played category (boundary 19/20)', async () => {
      setGames('ann', 20); setGames('bob', 19);
      expect((await sendFull('ann', 'bob', { stake: 'swap' })).body.code).toBe('STAKE_MIN_GAMES');
      setGames('bob', 20); setGames('bob', 99, 'caro');
      expect((await sendFull('ann', 'bob', { stake: 'swap' })).status).toBe(201);
      setGames('ann', 0, 'caro');
      expect((await sendFull('ann', 'bob', { stake: 'swap' }, { winningRule: 'caro' })).body.code).toBe('STAKE_MIN_GAMES');
    });

    it('24 h per-pair cooldown (either direction, any category)', async () => {
      setGames('ann', 30); setGames('bob', 30);
      const at = (ms) => new Date(Date.now() - ms).toISOString();
      const log = db.prepare(`INSERT INTO elo_swaps (category, user_lo, user_hi, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after, game_ids, created_at)
        VALUES ('caro', ?, ?, ?, ?, 1, 2, 2, 1, '[]', ?)`);
      const [lo, hi] = [U.ann, U.bob].sort();
      log.run(lo, hi, U.bob, U.ann, at(23 * 3600 * 1000));
      expect((await sendFull('bob', 'ann', { stake: 'swap' })).body.code).toBe('STAKE_COOLDOWN');
      db.prepare('DELETE FROM elo_swaps').run();
      log.run(lo, hi, U.bob, U.ann, at(25 * 3600 * 1000));
      expect((await sendFull('bob', 'ann', { stake: 'swap' })).status).toBe(201);
    });

    it('re-checked on accept: a guard that broke since send blocks the accept and keeps the challenge', async () => {
      setGames('ann', 30); setGames('bob', 30);
      const c = (await sendFull('ann', 'bob', { stake: 'swap', games: 3 })).body;
      setGames('ann', 3);
      expect((await call('POST', `/api/challenges/${c.id}/accept`, 'bob')).body.code).toBe('STAKE_MIN_GAMES');
      expect((await call('GET', '/api/challenges', 'bob')).body.incoming).toHaveLength(1);
      expect(roomManager.getRoomByUser(U.ann)).toBeFalsy();
    });
  });

  it('accept: room gets the full settings and a series (players = challenger, accepter)', async () => {
    setGames('ann', 30); setGames('bob', 30);
    const c = (await sendFull('ann', 'bob', { stake: 'swap', games: 5 })).body;
    const r = await call('POST', `/api/challenges/${c.id}/accept`, 'bob');
    const room = roomManager.getRoom(r.body.roomId);
    expect(room.settings).toMatchObject(FULL);
    expect(room.series).toMatchObject({ players: [U.ann, U.bob], total: 5, stake: 'swap', rated: true, category: 'standard', done: false });
  });

  it('accept: a plain Bo1 without stake has no series (normal per-game Elo)', async () => {
    const c = (await sendFull('ann', 'bob')).body;
    const r = await call('POST', `/api/challenges/${c.id}/accept`, 'bob');
    expect(roomManager.getRoom(r.body.roomId).series).toBeUndefined();
  });
});
