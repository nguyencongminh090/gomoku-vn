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

// Written before saveGame() normalized `winner` to a seat color — the raw
// winning player's id is stored directly in the `winner` column.
const LEGACY_ID_GAME = {
  ...GAME,
  id: 'game-2',
  winner: 'user-white-secret', // = white_player_id, not 'WHITE'
};

// Legacy data, guest winner: guest seats never had a stored player id, so a
// guest's raw id in `winner` can't match either *_player_id column — the
// only way to resolve it is elimination (exactly one seat is a guest).
const LEGACY_GUEST_GAME = {
  ...GAME,
  id: 'game-3',
  black_player_id: null,
  winner: 'guest_ab12cd34',
};

// Fixtures for search/filter/stats tests — guest players (no FK rows needed),
// spread across distinct ISO dates and results so date/result/player
// filtering can each be asserted independently.
const SEARCH_WIN_JAN = {
  ...GAME,
  id: 'game-search-win-jan',
  black_player_id: null,
  white_player_id: null,
  black_player_name: 'Charlie',
  white_player_name: 'Dave',
  winner: 'BLACK',
  started_at: '2026-01-05T10:00:00.000Z',
  ended_at: '2026-01-05T10:20:00.000Z',
};

const SEARCH_DRAW_JAN = {
  ...GAME,
  id: 'game-search-draw-jan',
  black_player_id: null,
  white_player_id: null,
  black_player_name: 'Charlie',
  white_player_name: 'Eve',
  winner: 'draw',
  started_at: '2026-01-10T10:00:00.000Z',
  ended_at: '2026-01-10T10:20:00.000Z',
};

const SEARCH_WIN_FEB = {
  ...GAME,
  id: 'game-search-win-feb',
  black_player_id: null,
  white_player_id: null,
  black_player_name: 'Frank',
  white_player_name: 'Grace',
  winner: 'WHITE',
  started_at: '2026-02-01T10:00:00.000Z',
  ended_at: '2026-02-01T10:20:00.000Z',
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

  const insertGame = database.db.prepare(`
    INSERT INTO games (id, room_id, black_player_id, white_player_id,
                       black_player_name, white_player_name, winner, reason,
                       board_size, rule_wall, rule_portal, moves, walls,
                       portals, started_at, ended_at)
    VALUES (@id, @room_id, @black_player_id, @white_player_id,
            @black_player_name, @white_player_name, @winner, @reason,
            @board_size, @rule_wall, @rule_portal, @moves, @walls,
            @portals, @started_at, @ended_at)
  `);
  insertGame.run(GAME);
  insertGame.run(LEGACY_ID_GAME);
  insertGame.run(LEGACY_GUEST_GAME);
  insertGame.run(SEARCH_WIN_JAN);
  insertGame.run(SEARCH_DRAW_JAN);
  insertGame.run(SEARCH_WIN_FEB);

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
    expect(game.winner_name).toBe('Alice');
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

  // ── TODO #17: winner_name resolves legacy winner formats ─────────────────

  test('resolves a legacy raw-player-id winner to a display name, and normalizes winner itself', async () => {
    const res = await get('/api/games/game-2');
    const { game } = await res.json();

    // `winner` was stored as the raw secret id — must come back normalized
    // to the seat color, not leak the id it was resolved from.
    expect(game.winner).toBe('WHITE');
    expect(game.winner_name).toBe('Bob');
    expect(game).not.toHaveProperty('black_player_id');
    expect(game).not.toHaveProperty('white_player_id');
    expect(JSON.stringify(game)).not.toContain('user-white-secret');
  });

  test('resolves a legacy guest winner by seat elimination', async () => {
    const res = await get('/api/games/game-3');
    const { game } = await res.json();

    // Resolved by elimination (black seat is the guest, null id), and the
    // raw guest id in `winner` is normalized to the seat color too.
    expect(game.winner).toBe('BLACK');
    expect(game.winner_name).toBe('Alice');
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

  test('does not expose black_player_id / white_player_id (TODO #16)', async () => {
    const res = await get('/api/games?page=1&limit=10');
    const { games } = await res.json();

    for (const g of games) {
      expect(g).not.toHaveProperty('black_player_id');
      expect(g).not.toHaveProperty('white_player_id');
    }

    const raw = JSON.stringify(games);
    expect(raw).not.toContain('user-black-secret');
    expect(raw).not.toContain('user-white-secret');
  });

  test('includes winner_name, resolved for both modern and legacy rows', async () => {
    const res = await get('/api/games?page=1&limit=10');
    const { games } = await res.json();
    const byId = Object.fromEntries(games.map(g => [g.id, g]));

    expect(byId['game-1'].winner_name).toBe('Alice');
    expect(byId['game-2'].winner_name).toBe('Bob');
    expect(byId['game-3'].winner_name).toBe('Alice');
  });

  // ── Search filters: player / date range / result ────────────────────────

  test('filters by player name (substring match, either seat)', async () => {
    const res = await get('/api/games?player=Charlie');
    const { games, pagination } = await res.json();

    expect(pagination.total).toBe(2);
    expect(games.map(g => g.id).sort()).toEqual(
      ['game-search-draw-jan', 'game-search-win-jan'].sort()
    );
  });

  test('a player filter with no matches returns an empty, not an error', async () => {
    const res = await get('/api/games?player=NoSuchPlayer');
    expect(res.status).toBe(200);
    const { games, pagination } = await res.json();
    expect(games).toEqual([]);
    expect(pagination.total).toBe(0);
  });

  test('filters by date range (inclusive)', async () => {
    const res = await get('/api/games?from=2026-01-01&to=2026-01-31');
    const { games } = await res.json();

    expect(games.map(g => g.id).sort()).toEqual(
      ['game-search-draw-jan', 'game-search-win-jan'].sort()
    );
  });

  test('filters by result=win (excludes draws)', async () => {
    const res = await get('/api/games?player=Charlie&result=win');
    const { games } = await res.json();
    expect(games.map(g => g.id)).toEqual(['game-search-win-jan']);
  });

  test('filters by result=draw (excludes decisive games)', async () => {
    const res = await get('/api/games?player=Charlie&result=draw');
    const { games } = await res.json();
    expect(games.map(g => g.id)).toEqual(['game-search-draw-jan']);
  });

  test('combines player + date + result filters', async () => {
    const res = await get('/api/games?player=Frank&from=2026-02-01&to=2026-02-28&result=win');
    const { games } = await res.json();
    expect(games.map(g => g.id)).toEqual(['game-search-win-feb']);
  });

  test('a malformed date filter is dropped rather than erroring', async () => {
    const res = await get('/api/games?from=not-a-date');
    expect(res.status).toBe(200);
    const { pagination } = await res.json();
    // Falls back to the unfiltered count (all 6 fixture games).
    expect(pagination.total).toBe(6);
  });
});

// ── GET /api/games/stats — aggregate counts ────────────────────────────────

describe('GET /api/games/stats', () => {
  test('counts by result, respecting the same filters as the list route', async () => {
    const res = await get('/api/games/stats?player=Charlie');
    expect(res.status).toBe(200);

    const { byResult } = await res.json();
    expect(byResult).toEqual({ win: 1, draw: 1, total: 2 });
  });

  test('counts by date, one row per day, filtered', async () => {
    const res = await get('/api/games/stats?from=2026-01-01&to=2026-01-31');
    const { byDate } = await res.json();

    const byDateMap = Object.fromEntries(byDate.map(r => [r.date, r.count]));
    expect(byDateMap['2026-01-05']).toBe(1);
    expect(byDateMap['2026-01-10']).toBe(1);
    expect(byDateMap['2026-02-01']).toBeUndefined();
  });

  test('is mounted before /:id so the literal path is not swallowed as a game id', async () => {
    const res = await get('/api/games/stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('byDate');
    expect(body).toHaveProperty('byResult');
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
