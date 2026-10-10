'use strict';

/**
 * rankings-route.test.js — GET /api/rankings and /api/rankings/me (#176).
 * Real SQL against an in-memory DB (same harness as games-route.test.js).
 */

jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() {
    return new Actual(':memory:');
  };
});

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (req.headers['x-test-user'] === undefined) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { userId: req.headers['x-test-user'] || null };
    next();
  },
}));

jest.mock('../utils/optional-user', () => ({
  optionalUserId: (req) => req.headers['x-test-viewer'] || null,
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const rankingsRouter = require('../routes/rankings');

const NOW = '2026-10-09T00:00:00.000Z';

function addPlayer(id, name, category, rating, games, rd = 80) {
  database.db.prepare(
    `INSERT OR IGNORE INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`
  ).run(id, id, name, NOW);
  database.db.prepare(
    `INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, ?, ?, ?, 0.06, ?, ?)`
  ).run(id, category, rating, rd, games, NOW);
}

let server;
let base;

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(base + path, { headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    }).on('error', reject);
  });
}

beforeAll(async () => {
  const app = express();
  app.use('/api/rankings', rankingsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  addPlayer('u1', 'Alice', 'freestyle', 1700, 30);
  addPlayer('u2', 'Bob', 'freestyle', 1800, 25);
  addPlayer('u3', 'Cara', 'freestyle', 1700, 40, 200);   // ties u1, provisional
  addPlayer('u4', 'Dan', 'freestyle', 2100, 19);         // under the games threshold
  addPlayer('u1', 'Alice', 'caro', 1500, 22);
});

afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => rankingsRouter._clearCache());

describe('GET /api/rankings', () => {
  it('orders by rating desc, ties by user id, and hides players under the games threshold', async () => {
    const { body } = await get('/api/rankings?category=freestyle');
    expect(body.players.map((p) => [p.rank, p.displayName])).toEqual([[1, 'Bob'], [2, 'Alice'], [3, 'Cara']]);
    expect(body.players[2].provisional).toBe(true);
    expect(body.players[0].username).toBe('u2');
    expect(body.pagination.total).toBe(3);
    expect(body.players[0]).not.toHaveProperty('rd');
  });

  it('paginates with continuous ranks', async () => {
    const { body } = await get('/api/rankings?category=freestyle&limit=2&page=2');
    expect(body.players.map((p) => p.rank)).toEqual([3]);
    expect(body.pagination.totalPages).toBe(2);
  });

  it('falls back to the first category for an unknown one', async () => {
    const { body } = await get('/api/rankings?category=nope');
    expect(body.category).toBe('freestyle');
  });

  it('serves a cached page until the cache is cleared', async () => {
    await get('/api/rankings?category=caro');
    addPlayer('u2', 'Bob', 'caro', 1900, 50);
    expect((await get('/api/rankings?category=caro')).body.players).toHaveLength(1);
    rankingsRouter._clearCache();
    expect((await get('/api/rankings?category=caro')).body.players).toHaveLength(2);
  });
});

describe('GET /api/rankings/me', () => {
  it('requires a session', async () => {
    expect((await get('/api/rankings/me')).status).toBe(401);
  });

  it('returns the caller rank per category; null rank under the threshold', async () => {
    const a = (await get('/api/rankings/me', { 'x-test-user': 'u1' })).body;
    expect(a.ratings.freestyle).toMatchObject({ rank: 2, rating: 1700, total: 3 });
    const d = (await get('/api/rankings/me', { 'x-test-user': 'u4' })).body;
    expect(d.ratings.freestyle.rank).toBeNull();
  });

  it('returns the caller avatar URL (nav chip) only when one is set', async () => {
    expect((await get('/api/rankings/me', { 'x-test-user': 'u1' })).body.avatarUrl).toBeNull();
    database.db.prepare('UPDATE users SET avatar_v = 3 WHERE id = ?').run('u1');
    expect((await get('/api/rankings/me', { 'x-test-user': 'u1' })).body.avatarUrl).toBe('/api/profile/avatar/u1.webp?v=3');
    database.db.prepare('UPDATE users SET avatar_v = 0 WHERE id = ?').run('u1');
  });

  it('returns nothing for a guest session', async () => {
    const g = (await get('/api/rankings/me', { 'x-test-user': '' })).body;
    expect(g.ratings).toEqual({});
  });
});

describe('phase 2 (#190): search, 7-day change, club column', () => {
  const hist = (uid, cat, before, after, daysAgo) => database.db.prepare(
    `INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at)
     VALUES (?, ?, 'g', 'x', 1, ?, ?, 80, 80, ?)`
  ).run(uid, cat, before, after, new Date(Date.now() - daysAgo * 86400000).toISOString());

  beforeAll(() => {
    hist('u2', 'freestyle', 1780, 1800, 1);   // counts
    hist('u2', 'freestyle', 1800, 1790, 3);   // counts → net +10
    hist('u2', 'freestyle', 1500, 1780, 10);  // outside 7 days
    hist('u1', 'freestyle', 1710, 1700, 2);   // -10
    database.db.prepare("INSERT INTO clubs (id, slug, name, description, join_policy, owner_id, created_at) VALUES ('c1', 'k1', 'K One', '', 'open', 'u1', ?)").run(NOW);
    database.db.prepare("INSERT INTO club_members VALUES ('c1', 'u1', 'owner', ?)").run(NOW);
    database.db.prepare("INSERT INTO club_members VALUES ('c1', 'u3', 'pending', ?)").run(NOW);
  });

  it('rows carry the net 7-day change and the first confirmed club', async () => {
    const { body } = await get('/api/rankings?category=freestyle');
    const by = Object.fromEntries(body.players.map((p) => [p.username, p]));
    expect(by.u2.delta7).toBe(10);
    expect(by.u1.delta7).toBe(-10);
    expect(by.u3.delta7).toBe(0);
    expect(by.u1.club).toEqual({ slug: 'k1', name: 'K One' });
    expect(by.u3.club).toBeNull(); // pending request is not membership
  });

  it('search matches username or display name, keeps the true rank, counts only matches', async () => {
    const r = (await get('/api/rankings?category=freestyle&q=ali')).body;
    expect(r.players.map((p) => [p.rank, p.displayName])).toEqual([[2, 'Alice']]);
    expect(r.pagination.total).toBe(1);
    expect((await get('/api/rankings?category=freestyle&q=U3')).body.players.map((p) => p.username)).toEqual(['u3']);
  });

  it('search hides players under the games threshold and escapes LIKE wildcards', async () => {
    expect((await get('/api/rankings?category=freestyle&q=dan')).body.players).toEqual([]);
    expect((await get('/api/rankings?category=freestyle&q=%25')).body.players).toEqual([]);
    expect((await get('/api/rankings?category=freestyle&q=_')).body.players).toEqual([]);
  });

  it('search results are cached per query, not shared with the plain list', async () => {
    const plain = (await get('/api/rankings?category=freestyle')).body.players.length;
    const searched = (await get('/api/rankings?category=freestyle&q=bob')).body.players.length;
    expect([plain, searched]).toEqual([3, 1]);
  });
});

describe('region (#199)', () => {
  const setRegion = (id, country, city) => database.db.prepare('UPDATE users SET country = ?, city = ? WHERE id = ?').run(country, city, id);
  beforeAll(() => { setRegion('u1', 'VN', 'Hà Nội'); setRegion('u2', 'US', 'Austin'); setRegion('u4', 'VN', ''); });

  it('rows carry country + city (empty strings when unset)', async () => {
    const { body } = await get('/api/rankings?category=freestyle');
    const by = Object.fromEntries(body.players.map((p) => [p.userId, p]));
    expect(by.u1).toMatchObject({ country: 'VN', city: 'Hà Nội' });
    expect(by.u3).toMatchObject({ country: '', city: '' });
  });

  it('scope=vn lists only Vietnamese members above the games threshold, ranked within the country', async () => {
    const { body } = await get('/api/rankings?category=freestyle&scope=vn');
    expect(body.scope).toBe('vn');
    expect(body.players.map((p) => [p.userId, p.rank])).toEqual([['u1', 1]]); // u4 is VN but has 19 games
    expect(body.pagination.total).toBe(1);
  });

  it('scope=vn is public (no login) and does not leak into the unscoped cache', async () => {
    await get('/api/rankings?category=freestyle&scope=vn');
    const all = (await get('/api/rankings?category=freestyle')).body;
    expect(all.scope).toBe('all');
    expect(all.pagination.total).toBe(3);
  });

  it('unknown scope falls back to everyone', async () => {
    expect((await get('/api/rankings?category=freestyle&scope=zz')).body.scope).toBe('all');
  });
});

describe('scope=club — "CLB của tôi" (B191)', () => {
  const ins = (club, user, role) => database.db.prepare('INSERT OR REPLACE INTO club_members VALUES (?, ?, ?, ?)').run(club, user, role, NOW);
  const asUser = (id) => ({ 'x-test-viewer': id });
  const names = async (viewer) => (await get('/api/rankings?category=freestyle&scope=club', asUser(viewer))).body.players.map((p) => [p.rank, p.displayName]);

  beforeAll(() => {
    // c1 (from the phase-2 block): u1 owner, u3 pending. Add u2 as member; second club c2 with u4 + u5.
    ins('c1', 'u2', 'member');
    database.db.prepare("INSERT OR IGNORE INTO clubs (id, slug, name, description, join_policy, owner_id, created_at) VALUES ('c2', 'k2', 'K Two', '', 'open', 'u4', ?)").run(NOW);
    ins('c2', 'u4', 'owner');
    ins('c2', 'u3', 'member');
  });

  it('401 when logged out (private scope, like friends)', async () => {
    const r = await get('/api/rankings?category=freestyle&scope=club');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('AUTH_REQUIRED');
  });

  it('lists only the viewer\'s club-mates + self above the games threshold, ranked within that set', async () => {
    const r = await get('/api/rankings?category=freestyle&scope=club', asUser('u1'));
    expect(r.body.scope).toBe('club');
    expect(await names('u1')).toEqual([[1, 'Bob'], [2, 'Alice']]); // u3 only pending in c1; u4 is in another club
    expect(r.body.pagination.total).toBe(2);
  });

  it('a pending request grants no circle: u3 is pending in c1 but a member of c2, so sees only c2 (u4 is under the threshold)', async () => {
    expect(await names('u3')).toEqual([[1, 'Cara']]);
  });

  it('belonging to several clubs merges their members', async () => {
    ins('c2', 'u1', 'member');
    expect(await names('u1')).toEqual([[1, 'Bob'], [2, 'Alice'], [3, 'Cara']]);
    database.db.prepare("DELETE FROM club_members WHERE club_id = 'c2' AND user_id = 'u1'").run();
  });

  it('a viewer in no club gets an empty list, and it is never served from the shared cache', async () => {
    expect(await names('u9')).toEqual([]);
    expect((await get('/api/rankings?category=freestyle')).body.players).toHaveLength(3); // unscoped list unaffected
    expect(await names('u1')).toEqual([[1, 'Bob'], [2, 'Alice']]); // not Bob's/u9's cached body
  });
});
