'use strict';

/**
 * RatingService.test.js — Glicko-2 engine, eligibility, persistence and the
 * async write queue (TODO.md #175). better-sqlite3 runs in-memory against the
 * real schema (same approach as save-game.test.js), FKs on.
 */

// database.js starts an hourly WAL-checkpoint interval; fake timers keep it
// from holding the process open (same as save-game.test.js).
jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() {
    return new Actual(':memory:');
  };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const RS = require('../managers/RatingService');

const { db } = database;
const A = 'user-a';
const B = 'user-b';
const C = 'user-c';

beforeAll(() => {
  const ins = db.prepare(
    'INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const id of [A, B, C]) ins.run(id, id, 'hash', id, Date.now());
});

beforeEach(() => {
  db.exec('DELETE FROM rating_history; DELETE FROM ratings;');
});

function ratingOf(id, category = 'freestyle') {
  return db.prepare('SELECT * FROM ratings WHERE user_id = ? AND category = ?').get(id, category);
}

describe('glicko2 — matches Glickman\'s worked example', () => {
  test('1500/200/0.06 vs three opponents → 1464.06 / 151.52 / 0.05999', () => {
    const r = RS.glicko2({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { rating: 1400, rd: 30,  score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ]);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.rd).toBeCloseTo(151.52, 1);
    expect(r.volatility).toBeCloseTo(0.05999, 4);
  });

  test('no games: rating kept, RD grows but is capped at the initial 350', () => {
    const r = RS.glicko2({ rating: 1300, rd: 349.9, volatility: 0.06 }, []);
    expect(r.rating).toBe(1300);
    expect(r.rd).toBe(350);
  });
});

describe('categoryFor — pool = winning rule', () => {
  test.each([['freestyle'], ['standard'], ['caro']])('%s is its own pool', (rule) => {
    expect(RS.categoryFor(rule)).toBe(rule);
  });
  test.each([[undefined], [''], ['renju']])('%p is not rated', (rule) => {
    expect(RS.categoryFor(rule)).toBeNull();
  });
});

describe('isRatedGame — decision table', () => {
  const base = () => ({
    ranked: true,
    winningRule: 'caro',
    players: [{ id: A, isGuest: false }, { id: B, isGuest: false }],
    result: { winner: A, reason: 'normal' },
  });

  test('ranked + two members + valid winner → rated', () => {
    expect(RS.isRatedGame(base())).toBe(true);
  });
  test('draw is rated', () => {
    expect(RS.isRatedGame({ ...base(), result: { winner: 'draw' } })).toBe(true);
  });
  test.each([
    ['casual (ranked false)',  (g) => { g.ranked = false; }],
    ['ranked missing',         (g) => { delete g.ranked; }],
    ['guest opponent',         (g) => { g.players[1].isGuest = true; }],
    ['missing player id',      (g) => { g.players[0].id = null; }],
    ['same user both seats',   (g) => { g.players[1].id = A; }],
    ['one player only',        (g) => { g.players.pop(); }],
    ['no result',              (g) => { g.result = null; }],
    ['winner not a player',    (g) => { g.result.winner = 'someone-else'; }],
    ['unknown winning rule',   (g) => { g.winningRule = 'renju'; }],
  ])('%s → not rated', (_label, mutate) => {
    const g = base();
    mutate(g);
    expect(RS.isRatedGame(g)).toBe(false);
  });
});

describe('rateGame — persistence', () => {
  test('two new players: winner +, loser − symmetric, both start at 1200 and stay provisional', () => {
    const out = db.transaction(() => RS.rateGame(db, {
      gameId: 'g1', category: 'freestyle', players: [{ id: A }, { id: B }], winner: A,
    }))();

    const [a, b] = out.players;
    expect(a.before).toBe(1200);
    expect(b.before).toBe(1200);
    expect(a.delta).toBeGreaterThan(0);
    expect(b.delta).toBe(-a.delta);
    expect(a.provisional).toBe(true);
    expect(ratingOf(A).games).toBe(1);
    expect(ratingOf(A).rd).toBeLessThan(350);
    const hist = db.prepare('SELECT * FROM rating_history WHERE game_id = ? ORDER BY user_id').all('g1');
    expect(hist).toHaveLength(2);
    expect(hist.map((h) => h.score)).toEqual([1, 0]);
    expect(hist[0].opponent_id).toBe(B);
  });

  test('draw between equals leaves ratings unchanged', () => {
    const out = db.transaction(() => RS.rateGame(db, {
      gameId: 'g2', category: 'standard', players: [{ id: A }, { id: B }], winner: 'draw',
    }))();
    expect(out.players.map((p) => p.delta)).toEqual([0, 0]);
  });

  test('pools are independent: a caro game leaves freestyle untouched', () => {
    db.transaction(() => RS.rateGame(db, {
      gameId: 'g3', category: 'caro', players: [{ id: A }, { id: B }], winner: B,
    }))();
    expect(ratingOf(B, 'caro')).toBeDefined();
    expect(ratingOf(B, 'freestyle')).toBeUndefined();
  });

  test('second game reads the stored rating, not the default', () => {
    const job = { category: 'freestyle', players: [{ id: A }, { id: C }], winner: A };
    const first = db.transaction(() => RS.rateGame(db, { ...job, gameId: 'g4' }))();
    const second = db.transaction(() => RS.rateGame(db, { ...job, gameId: 'g5' }))();
    expect(second.players[0].before).toBe(first.players[0].after);
    expect(ratingOf(A).games).toBe(2);
  });
});

describe('createRatingQueue — async, batched, all-or-nothing', () => {
  function manualQueue() {
    const ticks = [];
    const q = RS.createRatingQueue(() => db, (fn) => ticks.push(fn));
    return { q, ticks };
  }

  test('nothing is written until the scheduled flush runs (off the caller\'s tick)', () => {
    const { q, ticks } = manualQueue();
    q.enqueue({ gameId: 'q1', category: 'freestyle', players: [{ id: A }, { id: B }], winner: A });
    expect(ratingOf(A)).toBeUndefined();
    expect(ticks).toHaveLength(1);
    ticks[0]();
    expect(ratingOf(A)).toBeDefined();
  });

  test('several jobs in one tick → one flush; each callback gets its own deltas', () => {
    const { q, ticks } = manualQueue();
    const got = [];
    q.enqueue({ gameId: 'q2', category: 'freestyle', players: [{ id: A }, { id: B }], winner: A }, (d) => got.push(d));
    q.enqueue({ gameId: 'q3', category: 'caro', players: [{ id: B }, { id: C }], winner: C }, (d) => got.push(d));
    expect(ticks).toHaveLength(1);
    ticks[0]();
    expect(got.map((d) => d.gameId)).toEqual(['q2', 'q3']);
    expect(got[1].players[1]).toMatchObject({ userId: C, before: 1200 });
    expect(q.size).toBe(0);
  });

  test('a failing job rolls back the whole batch and fires no callbacks', () => {
    const { q, ticks } = manualQueue();
    const cb = jest.fn();
    q.enqueue({ gameId: 'q4', category: 'freestyle', players: [{ id: A }, { id: B }], winner: A }, cb);
    // unknown user → FK violation on ratings.user_id
    q.enqueue({ gameId: 'q5', category: 'freestyle', players: [{ id: A }, { id: 'ghost' }], winner: A }, cb);
    ticks[0]();
    expect(cb).not.toHaveBeenCalled();
    expect(ratingOf(A)).toBeUndefined();
  });
});

describe('recordGame — the game-end hook', () => {
  const game = (over = {}) => ({
    gameId: 'r1', ranked: true, winningRule: 'freestyle',
    players: [{ id: A, isGuest: false }, { id: B, isGuest: false }],
    result: { winner: B }, ...over,
  });

  test('rated game is queued with its pool and winner', () => {
    const queue = { enqueue: jest.fn() };
    const cb = () => {};
    expect(RS.recordGame(game(), cb, queue)).toBe(true);
    expect(queue.enqueue).toHaveBeenCalledWith(
      { gameId: 'r1', category: 'freestyle', players: [{ id: A }, { id: B }], winner: B }, cb
    );
  });

  test.each([
    ['casual', { ranked: false }],
    ['guest',  { players: [{ id: A, isGuest: false }, { id: 'guest_x', isGuest: true }] }],
  ])('%s game is a no-op', (_l, over) => {
    const queue = { enqueue: jest.fn() };
    expect(RS.recordGame(game(over), undefined, queue)).toBe(false);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe('schema / saveGame', () => {
  test('games.ranked is stored', () => {
    database.saveGame({
      gameId: 'sg1', roomId: '#AAA',
      players: [{ id: A, name: 'a', color: 'BLACK' }, { id: B, name: 'b', color: 'WHITE' }],
      result: { winner: A, reason: 'normal' }, boardSize: 15, ruleWall: false, rulePortal: false,
      moveHistory: [], walls: [], portals: [],
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), ranked: true,
    });
    expect(db.prepare('SELECT ranked FROM games WHERE id = ?').get('sg1').ranked).toBe(1);
  });
});
