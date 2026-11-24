'use strict';

/**
 * rank-cache.test.js — #439 in-memory standing per rule, real SQL on an in-memory DB.
 * Must equal the leaderboard/profile: getUserRanking's rank, Math.round(rating), provisional when rd > 110.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const database = require('../db/database');
const rankCache = require('../managers/rank-cache');
const { PROVISIONAL_RD, createRatingQueue } = require('../managers/RatingService');

const NOW = '2026-11-24T00:00:00.000Z';
function setRating(id, category, rating, rd = 80, games = 30) {
  database.db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`).run(id, id, id, NOW);
  database.db.prepare(`INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, ?, ?, ?, 0.06, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET rating = excluded.rating, rd = excluded.rd, games = excluded.games`).run(id, category, rating, rd, games, NOW);
}

beforeEach(() => {
  database.db.prepare('DELETE FROM ratings').run();
  rankCache._reset();
  setRating('a', 'freestyle', 1800.4);
  setRating('b', 'freestyle', 1700, PROVISIONAL_RD + 1);
  setRating('c', 'freestyle', 1700, PROVISIONAL_RD); // tie with b: user_id breaks it, exactly at the bound = settled
  setRating('z', 'freestyle', 1900, 80, 0);           // no rated game yet: rated row, no rank
  setRating('a', 'renju', 1450.6, 200);
});

test('rank, rounded rating and provisional match getUserRanking and the profile convention', () => {
  for (const id of ['a', 'b', 'c', 'z']) {
    const db = database.getUserRanking(id, 'freestyle');
    const s = rankCache.standingOf(id, 'freestyle');
    expect(s).toEqual([Math.round(db.rating), db.rank, db.rd > PROVISIONAL_RD]);
  }
  expect(rankCache.standingOf('a', 'freestyle')).toEqual([1800, 1, false]);
  expect(rankCache.standingOf('b', 'freestyle')).toEqual([1700, 2, true]);
  expect(rankCache.standingOf('c', 'freestyle')).toEqual([1700, 3, false]);
  expect(rankCache.standingOf('z', 'freestyle')).toEqual([1900, null, false]);
});

test('ratingsOf lists only the rules the member is rated in; unknown rule / user → null', () => {
  expect(rankCache.ratingsOf('a')).toEqual({ freestyle: [1800, 1, false], renju: [1451, 1, true] });
  expect(rankCache.ratingsOf('nobody')).toEqual({});
  expect(rankCache.standingOf('a', 'caro')).toBeNull();
  expect(rankCache.standingOf('a', 'not-a-rule')).toBeNull();
  expect(rankCache.standingOf(null, 'freestyle')).toBeNull();
});

test('reads never hit the DB again until a rating is invalidated', () => {
  rankCache.standingOf('a', 'freestyle');
  setRating('c', 'freestyle', 2000);
  expect(rankCache.standingOf('c', 'freestyle')).toEqual([1700, 3, false]); // cached
  rankCache.invalidate('freestyle');
  expect(rankCache.standingOf('c', 'freestyle')).toEqual([2000, 1, false]); // no listener → rebuilt on read
  expect(rankCache.standingOf('a', 'freestyle')).toEqual([1800, 2, false]);
});

test('a committed rating batch invalidates its category', () => {
  rankCache.standingOf('a', 'freestyle');
  const queue = createRatingQueue(() => database.db, (fn) => fn());
  queue.enqueue({ gameId: 'g1', category: 'freestyle', players: [{ id: 'c' }, { id: 'a' }], winner: 'c' });
  const after = database.getUserRanking('c', 'freestyle');
  expect(rankCache.standingOf('c', 'freestyle')).toEqual([Math.round(after.rating), after.rank, after.rd > PROVISIONAL_RD]);
});

describe('with a change listener (the server)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('rebuild waits for the timer, then reports exactly the members whose Elo changed', () => {
    rankCache.standingOf('a', 'freestyle');
    const seen = [];
    rankCache.onChange((ids) => seen.push([...ids].sort()));
    setRating('c', 'freestyle', 2000);
    rankCache.invalidate('freestyle');
    rankCache.invalidate('freestyle'); // one timer per burst
    expect(rankCache.standingOf('c', 'freestyle')).toEqual([1700, 3, false]); // stale until the refresh
    jest.advanceTimersByTime(rankCache.REFRESH_MS - 1);
    expect(seen).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(seen).toEqual([['c']]); // a's rank moved, its Elo did not
    expect(rankCache.standingOf('c', 'freestyle')).toEqual([2000, 1, false]);
    expect(rankCache.standingOf('a', 'freestyle')).toEqual([1800, 2, false]);
  });

  test('an unknown category is ignored', () => {
    const fn = jest.fn();
    rankCache.onChange(fn);
    rankCache.invalidate('nope');
    jest.advanceTimersByTime(rankCache.REFRESH_MS);
    expect(fn).not.toHaveBeenCalled();
  });
});
