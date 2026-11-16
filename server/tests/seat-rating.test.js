'use strict';

/**
 * seat-rating.test.js — the rating under a seated player on a lobby card (#364), real SQL on an
 * in-memory DB. Must equal what the profile shows: Math.round(rating), provisional when rd > 110.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const { seatRating } = require('../managers/seat-rating');
const { PROVISIONAL_RD } = require('../managers/RatingService');

const NOW = '2026-11-13T00:00:00.000Z';
function addRating(id, category, rating, rd) {
  database.db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`).run(id, id, id, NOW);
  database.db.prepare(`INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, ?, ?, ?, 0.06, 30, ?)`).run(id, category, rating, rd, NOW);
}

beforeAll(() => {
  addRating('u1', 'freestyle', 1683.6, 80);
  addRating('u1', 'caro', 1501.2, PROVISIONAL_RD + 1);
  addRating('u2', 'freestyle', 1500, PROVISIONAL_RD); // exactly at the bound = settled
});

test('returns the DB rating of the room rule pool, rounded, with the provisional flag', () => {
  expect(seatRating('u1', 'freestyle')).toEqual({ rating: 1684, provisional: false });
  expect(seatRating('u1', 'caro')).toEqual({ rating: 1501, provisional: true });
  expect(seatRating('u2', 'freestyle')).toEqual({ rating: 1500, provisional: false });
});

test('no row in that pool, an unrated rule, or no user → null', () => {
  expect(seatRating('u2', 'caro')).toBeNull();
  expect(seatRating('u1', 'not-a-rule')).toBeNull();
  expect(seatRating(null, 'freestyle')).toBeNull();
  expect(seatRating('nobody', 'freestyle')).toBeNull();
});

test('a missing rule falls back to freestyle (the room default)', () => {
  expect(seatRating('u1', undefined)).toEqual({ rating: 1684, provisional: false });
});
