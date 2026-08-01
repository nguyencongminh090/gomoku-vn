'use strict';

/**
 * games-route.test.js — Unit tests for GET /api/games and GET /api/games/:id.
 *
 * better-sqlite3 is mocked so that the real database.js runs its real schema
 * and its real SQL against an in-memory database instead of the repo's
 * server/db/gomoku.db. That keeps the test hermetic while still exercising the
 * actual queries — which matters here, because the fix under test *is* the
 * column list inside getGameById, and a mocked database module would assert
 * nothing about it.
 *
 * Fake timers are installed before the require so database.js's hourly WAL
 * checkpoint interval doesn't keep the Jest worker alive.
 */

jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() {
    return new Actual(':memory:');
  };
});

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const gamesRouter = require('../routes/games');

// ── Fixture ────────────────────────────────────────────────────────────────

const GAME = {
  id: 'game-1',
  room_id: '#A1B',
  black_player_id: 'user-black-secret',
  white_player_id: 'user-white-secret',
  black_player_name: 'Alice',
  white_player_name: 'Bob',
  winner: 'BLACK',
  reason: 'normal',
  board_size: 15,
  rule_wall: 0,
  rule_portal: 0,
  moves: JSON.stringify([{ x: 7, y: 7, color: 'BLACK' }]),
  walls: JSON.stringify([]),
  portals: JSON.stringify([]),
  started_at: '1700000000000',
  ended_at: '1700000060000',
};

let server;
let baseUrl;

beforeAll(async () => {
  // games.black_player_id / white_player_id are FKs into users, so the two
  // "secret" ids need real rows behind them.
  const insertUser = database.db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  insertUser.run(GAME.black_player_id, 'alice', 'hash', 'Alice', Date.now());
  insertUser.run(GAME.white_player_id, 'bob', 'hash', 'Bob', Date.now());

  database.db.prepare(`
    INSERT INTO games (id, room_id, black_player_id, white_player_id,
                       black_player_name, white_player_name, winner, reason,
                       board_size, rule_wall, rule_portal, moves, walls,
                       portals, started_at, ended_at)
    VALUES (@id, @room_id, @black_player_id, @white_player_id,
            @black_player_name, @white_player_name, @winner, @reason,
            @board_size, @rule_wall, @rule_portal, @moves, @walls,
            @portals, @started_at, @ended_at)
  `).run(GAME);

  const app = express();
  app.use('/api/games', gamesRouter);
  // Control route with no limiter — proves the RateLimit headers below come
  // from the router's own middleware, not from express or the test harness.
  app.get('/control', (req, res) => res.json({ ok: true }));

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

function get(path) {
  return fetch(`${baseUrl}${path}`);
}

// ── GET /api/games/:id — internal player ids must not be exposed ───────────

describe('GET /api/games/:id', () => {
  test('does not expose black_player_id / white_player_id', async () => {
    const res = await get('/api/games/game-1');
    expect(res.status).toBe(200);

    const { game } = await res.json();
    expect(game).not.toHaveProperty('black_player_id');
    expect(game).not.toHaveProperty('white_player_id');

    // Stronger than a property check: the secret values must not appear
    // anywhere in the serialized response.
    const raw = JSON.stringify(game);
    expect(raw).not.toContain('user-black-secret');
    expect(raw).not.toContain('user-white-secret');
  });

  test('still returns everything the replay screen actually renders', async () => {
    const res = await get('/api/games/game-1');
    const { game } = await res.json();

    expect(game.id).toBe('game-1');
    expect(game.black_player_name).toBe('Alice');
    expect(game.white_player_name).toBe('Bob');
    expect(game.winner).toBe('BLACK');
    expect(game.reason).toBe('normal');
    expect(game.board_size).toBe(15);
    expect(game.started_at).toBe(GAME.started_at);
    expect(game.ended_at).toBe(GAME.ended_at);
    // JSON columns are parsed by the route, not returned as strings.
    expect(game.moves).toEqual([{ x: 7, y: 7, color: 'BLACK' }]);
    expect(game.walls).toEqual([]);
    expect(game.portals).toEqual([]);
  });

  test('an unknown id is still a 404', async () => {
    const res = await get('/api/games/does-not-exist');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  test('the query is column-explicit, so a new table column cannot widen the response', () => {
    // Guards the intent of the fix rather than its current output: adding a
    // column to `games` must not appear here without an explicit edit.
    database.db.exec('ALTER TABLE games ADD COLUMN internal_note TEXT');
    database.db.prepare('UPDATE games SET internal_note = ? WHERE id = ?')
      .run('do-not-leak', 'game-1');

    const game = database.getGameById('game-1');
    expect(game).not.toHaveProperty('internal_note');
  });
});

// ── GET /api/games — list route ────────────────────────────────────────────

describe('GET /api/games', () => {
  test('returns the paginated list', async () => {
    const res = await get('/api/games?page=1&limit=10');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.games)).toBe(true);
    expect(body.games.length).toBeGreaterThan(0);
    expect(body.pagination).toMatchObject({ page: 1, limit: 10 });
  });
});

// ── Rate limiting ──────────────────────────────────────────────────────────

describe('rate limiting', () => {
  test('both game routes are behind a rate limiter', async () => {
    const list = await get('/api/games');
    const detail = await get('/api/games/game-1');
    const control = await get('/control');

    const hasLimitHeader = res => [...res.headers.keys()]
      .some(h => h.toLowerCase().includes('ratelimit'));

    expect(hasLimitHeader(list)).toBe(true);
    expect(hasLimitHeader(detail)).toBe(true);
    // Control route shares the same app but not the router — no headers there.
    expect(hasLimitHeader(control)).toBe(false);

    // Pins the configured ceiling, so silently dropping or widening the
    // limiter fails here rather than passing on any limiter at all.
    expect(list.headers.get('x-ratelimit-limit')).toBe('300');
  });
});
