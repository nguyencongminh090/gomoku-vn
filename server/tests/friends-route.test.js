'use strict';

/**
 * friends-route.test.js — /api/friends + rankings scope=friends + profile.friendship (#198 slice 1).
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
    req.user = { userId: req.headers.cookie === 'guest' ? null : req.headers.cookie };
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const friendsRouter = require('../routes/friends');
const rankingsRouter = require('../routes/rankings');
const profileRouter = require('../routes/profile');
const svc = require('../managers/FriendService');

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

function call(method, urlPath, as) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (as) headers.cookie = U[as] || as;
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end();
  });
}

const rows = () => db.prepare('SELECT * FROM friendships').all();
const reset = () => db.prepare('DELETE FROM friendships').run();

beforeAll(async () => {
  addUser('ann', 1500); addUser('bob', 1600); addUser('cat', 1700); addUser('dan', 1800);
  const app = express();
  app.use('/api/friends', friendsRouter);
  app.use('/api/rankings', rankingsRouter);
  app.use('/api/profile', profileRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => { reset(); rankingsRouter._clearCache(); });

describe('request / accept / remove', () => {
  it('request → pending; target sees incoming, sender outgoing; accept → both friends', async () => {
    expect((await call('POST', '/api/friends/bob', 'ann')).body.status).toBe('outgoing');
    expect(rows()).toHaveLength(1);
    expect((await call('GET', '/api/friends', 'bob')).body.incoming.map((p) => p.username)).toEqual(['ann']);
    expect((await call('GET', '/api/friends', 'ann')).body.outgoing.map((p) => p.username)).toEqual(['bob']);
    expect((await call('POST', '/api/friends/ann/accept', 'bob')).body.status).toBe('friends');
    expect((await call('GET', '/api/friends', 'ann')).body.friends.map((p) => p.username)).toEqual(['bob']);
    expect((await call('GET', '/api/friends', 'bob')).body.friends.map((p) => p.username)).toEqual(['ann']);
  });

  it('crossed requests merge into one accepted row', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('POST', '/api/friends/ann', 'bob')).body.status).toBe('friends');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].status).toBe('accepted');
  });

  it('only the target can accept; the sender cannot accept their own request', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    const r = await call('POST', '/api/friends/bob/accept', 'ann');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NO_REQUEST');
    expect((await call('POST', '/api/friends/cat/accept', 'ann')).body.code).toBe('NO_REQUEST');
  });

  it('rejects self, unknown user, duplicate request, already friends', async () => {
    expect((await call('POST', '/api/friends/ann', 'ann')).body.code).toBe('CANNOT_FRIEND_SELF');
    expect((await call('POST', '/api/friends/nobody', 'ann')).status).toBe(404);
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('POST', '/api/friends/bob', 'ann')).body.code).toBe('REQUEST_PENDING');
    await call('POST', '/api/friends/ann/accept', 'bob');
    expect((await call('POST', '/api/friends/bob', 'ann')).body.code).toBe('ALREADY_FRIENDS');
    expect((await call('POST', '/api/friends/ann', 'bob')).body.code).toBe('ALREADY_FRIENDS');
  });

  it('DELETE cancels, declines and unfriends (idempotent)', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('DELETE', '/api/friends/bob', 'ann')).body.status).toBe('none'); // cancel
    expect(rows()).toHaveLength(0);
    await call('POST', '/api/friends/bob', 'ann');
    await call('DELETE', '/api/friends/ann', 'bob'); // decline
    expect(rows()).toHaveLength(0);
    await call('POST', '/api/friends/bob', 'ann');
    await call('POST', '/api/friends/ann/accept', 'bob');
    await call('DELETE', '/api/friends/ann', 'bob'); // unfriend
    expect(rows()).toHaveLength(0);
    expect((await call('DELETE', '/api/friends/ann', 'bob')).status).toBe(200);
  });

  it('guests and logged-out are refused', async () => {
    expect((await call('GET', '/api/friends', 'guest')).body.code).toBe('GUEST_FORBIDDEN');
    expect((await call('POST', '/api/friends/bob', 'guest')).status).toBe(403);
    expect((await call('GET', '/api/friends')).status).toBe(401);
  });

  it('caps outgoing pending requests', () => {
    for (let i = 0; i < svc.MAX_OUTGOING; i++) addUser(`u${i}`);
    for (let i = 0; i < svc.MAX_OUTGOING; i++) svc.request(U.ann, `u${i}`);
    addUser('late');
    expect(() => svc.request(U.ann, 'late')).toThrow(expect.objectContaining({ code: 'TOO_MANY_REQUESTS' }));
  });
});

describe('rankings scope=friends', () => {
  it('lists me + accepted friends only, ranked within the circle; pending/strangers excluded', async () => {
    await call('POST', '/api/friends/bob', 'ann'); await call('POST', '/api/friends/ann/accept', 'bob');
    await call('POST', '/api/friends/cat', 'ann'); // pending only
    const r = await call('GET', '/api/rankings?category=freestyle&scope=friends', 'ann');
    expect(r.status).toBe(200);
    expect(r.body.scope).toBe('friends');
    expect(r.body.players.map((p) => [p.rank, p.username])).toEqual([[1, 'bob'], [2, 'ann']]);
    expect(r.body.pagination.total).toBe(2);
  });

  it('is per viewer (no cache bleed) and 401 when logged out; global scope unaffected', async () => {
    await call('POST', '/api/friends/bob', 'ann'); await call('POST', '/api/friends/ann/accept', 'bob');
    await call('GET', '/api/rankings?category=freestyle&scope=friends', 'ann');
    const d = await call('GET', '/api/rankings?category=freestyle&scope=friends', 'dan');
    expect(d.body.players.map((p) => p.username)).toEqual(['dan']);
    expect((await call('GET', '/api/rankings?category=freestyle&scope=friends')).status).toBe(401);
    const all = await call('GET', '/api/rankings?category=freestyle');
    expect(all.body.players).toHaveLength(4);
  });
});

describe('profile.friendship', () => {
  it('reflects the viewer relation', async () => {
    expect((await call('GET', '/api/profile/bob')).body.friendship).toBe('none'); // logged out
    expect((await call('GET', '/api/profile/ann', 'ann')).body.friendship).toBe('self');
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('GET', '/api/profile/bob', 'ann')).body.friendship).toBe('outgoing');
    expect((await call('GET', '/api/profile/ann', 'bob')).body.friendship).toBe('incoming');
    await call('POST', '/api/friends/ann/accept', 'bob');
    expect((await call('GET', '/api/profile/ann', 'bob')).body.friendship).toBe('friends');
  });
});
