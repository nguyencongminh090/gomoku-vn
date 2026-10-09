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

  it('returns nothing for a guest session', async () => {
    const g = (await get('/api/rankings/me', { 'x-test-user': '' })).body;
    expect(g.ratings).toEqual({});
  });
});
