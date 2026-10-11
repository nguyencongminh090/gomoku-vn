'use strict';

/**
 * challenge-series.test.js — friend-challenge series (#222): ChallengeSeries state
 * (decided / winner / abandon) and RatingService.rateSeries on a real in-memory DB
 * (one Glicko period per series, Swap Elo stake, cooldown, atomicity).
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const RatingService = require('../managers/RatingService');
const S = require('../managers/ChallengeSeries');

const db = database.db;
const NOW = '2026-10-09T00:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;

function addUser(id) {
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`).run(id, id, id, NOW);
}
function setRating(id, rating, cat = 'caro', games = 30) {
  db.prepare(`INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, ?, ?, 80, 0.06, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET rating = excluded.rating, games = excluded.games`).run(id, cat, rating, games, NOW);
}
const rating = (id, cat = 'caro') => db.prepare('SELECT rating, games FROM ratings WHERE user_id = ? AND category = ?').get(id, cat);
const swaps = () => db.prepare('SELECT * FROM elo_swaps').all();

beforeAll(() => { addUser('a'); addUser('b'); });
beforeEach(() => {
  db.prepare('DELETE FROM ratings').run();
  db.prepare('DELETE FROM rating_history').run();
  db.prepare('DELETE FROM elo_swaps').run();
});

describe('ChallengeSeries state', () => {
  const mk = (total, extra = {}) => S.create({ players: ['a', 'b'], total, stake: 'none', rated: true, category: 'caro', ...extra });
  const play = (s, ...winners) => winners.forEach((w, i) => S.addGame(s, `g${s.games.length + 1}`, w));

  test.each([
    // [total, results, decided]
    [1, [], false],
    [1, ['a'], true],
    [1, ['draw'], true],
    [3, ['a'], false],
    [3, ['a', 'b'], false],
    [3, ['a', 'a'], true],            // 2-0 clinched, game 3 not needed
    [3, ['a', 'draw'], false],        // 1-0, one left: b can still tie
    [3, ['a', 'draw', 'b'], true],    // all played
    [5, ['a', 'a', 'a'], true],
    [5, ['a', 'a', 'b'], false],
    [5, ['a', 'a', 'draw', 'draw'], true], // 2-0 with 1 left
  ])('Bo%i after %j → decided %s', (total, res, decided) => {
    const s = mk(total);
    play(s, ...res);
    expect(S.isDecided(s)).toBe(decided);
  });

  test('finish: winner by games won; tie → no winner; job carries every game in order', () => {
    const s = mk(3, { stake: 'swap' });
    play(s, 'b', 'a', 'b');
    const job = S.finish(s, 'complete', { cooldownMs: DAY });
    expect(s).toMatchObject({ done: true, winnerId: 'b', reason: 'complete' });
    expect(job).toEqual({
      gameIds: ['g1', 'g2', 'g3'], category: 'caro', players: [{ id: 'a' }, { id: 'b' }],
      winners: ['b', 'a', 'b'], stake: 'swap', cooldownMs: DAY,
    });
    const t = mk(5); play(t, 'a', 'b');
    S.finish(t, 'abandoned');
    expect(t.winnerId).toBeNull();
    expect(S.finish(t, 'abandoned')).toBeNull(); // idempotent
  });

  test('finish returns no rating job for a friendly series or one with no games', () => {
    const f = mk(3, { rated: false }); play(f, 'a');
    expect(S.finish(f, 'abandoned')).toBeNull();
    expect(f.winnerId).toBe('a');
    expect(S.finish(mk(3), 'abandoned')).toBeNull();
  });

  test('isSeriesPair: either seat order; anyone else is not the pair', () => {
    const s = mk(3);
    expect(S.isSeriesPair(s, ['b', 'a'])).toBe(true);
    expect(S.isSeriesPair(s, ['a', 'c'])).toBe(false);
    expect(S.isSeriesPair(s, ['a', 'a'])).toBe(false);
  });

  test('view: score per player, draws, played', () => {
    const s = mk(5, { stake: 'swap' }); play(s, 'a', 'draw', 'b', 'a');
    expect(S.view(s)).toMatchObject({ total: 5, stake: 'swap', played: 4, draws: 1, score: { a: 2, b: 1 }, done: false });
    expect(S.view(null)).toBeNull();
  });
});

describe('RatingService.rateSeries', () => {
  const job = (winners, extra = {}) => ({
    gameIds: winners.map((_, i) => `g${i + 1}`), category: 'caro', players: [{ id: 'a' }, { id: 'b' }],
    winners, stake: null, cooldownMs: DAY, ...extra,
  });
  const run = (j) => db.transaction(() => RatingService.rateSeries(db, j))();

  test('one rating period: games += N, one history row per player, equals glicko2 over all results', () => {
    setRating('a', 1500); setRating('b', 1500);
    const res = run(job(['a', 'a', 'b']));
    const expected = RatingService.glicko2({ rating: 1500, rd: 80, volatility: 0.06 },
      [1, 1, 0].map((score) => ({ rating: 1500, rd: 80, score })));
    expect(rating('a').rating).toBeCloseTo(expected.rating, 6);
    expect(rating('a').games).toBe(33);
    const hist = db.prepare('SELECT user_id, game_id, score FROM rating_history ORDER BY user_id').all();
    expect(hist).toEqual([
      { user_id: 'a', game_id: 'g3', score: 2 / 3 },
      { user_id: 'b', game_id: 'g3', score: 1 / 3 },
    ]);
    expect(res).toMatchObject({ series: true, winnerId: 'a', swap: null });
  });

  test('swap: lower-rated winner takes the loser\'s post-series rating and vice versa; log row + history rows', () => {
    setRating('a', 1300); setRating('b', 1700);
    const res = run(job(['a', 'a'], { stake: 'swap' }));
    const a = rating('a').rating;
    const b = rating('b').rating;
    expect(a).toBeGreaterThan(b);
    const log = swaps();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ category: 'caro', winner_id: 'a', loser_id: 'b', user_lo: 'a', user_hi: 'b', game_ids: '["g1","g2"]' });
    expect(log[0].winner_after).toBeCloseTo(a, 6);
    expect(log[0].loser_after).toBeCloseTo(b, 6);
    expect(log[0].winner_before).toBeCloseTo(b, 6); // the swap exchanged exactly the post-Elo values
    expect(db.prepare('SELECT COUNT(*) AS n FROM rating_history').get().n).toBe(4); // series + swap, per player
    expect(res.swap).toMatchObject({ winnerId: 'a', loserId: 'b', winnerAfter: Math.round(a), loserAfter: Math.round(b) });
    expect(res.players.find((p) => p.userId === 'a').after).toBe(Math.round(a));
  });

  test('swap touches only the played category', () => {
    setRating('a', 1300); setRating('b', 1700);
    setRating('a', 1111, 'freestyle'); setRating('b', 1999, 'freestyle');
    run(job(['a'], { stake: 'swap' }));
    expect(rating('a', 'freestyle').rating).toBe(1111);
    expect(rating('b', 'freestyle').rating).toBe(1999);
  });

  test.each([
    ['winner already higher-rated', 1700, 1300, ['a', 'a']],
    ['tie on games won', 1300, 1700, ['a', 'b']],
    ['all draws', 1300, 1700, ['draw', 'draw', 'draw']],
  ])('no swap when %s', (_, ra, rb, winners) => {
    setRating('a', ra); setRating('b', rb);
    run(job(winners, { stake: 'swap' }));
    expect(swaps()).toHaveLength(0);
    expect(rating('a').rating).not.toBe(rating('b').rating);
  });

  test('no swap without the stake', () => {
    setRating('a', 1300); setRating('b', 1700);
    run(job(['a', 'a']));
    expect(swaps()).toHaveLength(0);
    expect(rating('a').rating).toBeLessThan(rating('b').rating);
  });

  test('cooldown re-checked in the transaction: a pair swapped < 24 h ago does not swap again', () => {
    setRating('a', 1300); setRating('b', 1700);
    run(job(['a'], { stake: 'swap' }));
    expect(swaps()).toHaveLength(1);
    setRating('a', 1300); setRating('b', 1700);
    run(job(['a'], { stake: 'swap' }));
    expect(swaps()).toHaveLength(1);
    expect(rating('a').rating).toBeLessThan(rating('b').rating);
  });

  test('atomic: a failing swap write rolls back the series rating too', () => {
    setRating('a', 1300); setRating('b', 1700);
    db.exec('ALTER TABLE elo_swaps RENAME TO elo_swaps_x');
    db.exec('CREATE TABLE elo_swaps (user_lo TEXT, user_hi TEXT, created_at TEXT)'); // insert will fail
    try {
      const q = RatingService.createRatingQueue(() => db, (fn) => fn());
      const done = jest.fn();
      q.enqueue({ ...job(['a', 'a'], { stake: 'swap' }), series: true }, done);
      expect(done).not.toHaveBeenCalled();
      expect(rating('a')).toMatchObject({ rating: 1300, games: 30 });
      expect(rating('b')).toMatchObject({ rating: 1700, games: 30 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM rating_history').get().n).toBe(0);
    } finally {
      db.exec('DROP TABLE elo_swaps');
      db.exec('ALTER TABLE elo_swaps_x RENAME TO elo_swaps');
    }
  });

  test('recordSeries queues a series job; empty series is a no-op', () => {
    const q = { enqueue: jest.fn() };
    expect(RatingService.recordSeries(job([]), null, q)).toBe(false);
    expect(RatingService.recordSeries(job(['a']), null, q)).toBe(true);
    expect(q.enqueue.mock.calls[0][0]).toMatchObject({ series: true, winners: ['a'] });
  });
});

describe('database helpers', () => {
  test('getRatedGames / lastEloSwapAt (pair order irrelevant)', () => {
    expect(database.getRatedGames('a', 'caro')).toBe(0);
    setRating('a', 1500, 'caro', 21);
    expect(database.getRatedGames('a', 'caro')).toBe(21);
    expect(database.lastEloSwapAt('a', 'b')).toBeNull();
    db.prepare(`INSERT INTO elo_swaps (category, user_lo, user_hi, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after, game_ids, created_at)
      VALUES ('caro', 'a', 'b', 'a', 'b', 1, 2, 2, 1, '[]', ?)`).run(NOW);
    expect(database.lastEloSwapAt('b', 'a')).toBe(NOW);
  });
});
