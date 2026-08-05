'use strict';

/**
 * roundRobin.test.js — Unit tests for the round-robin circle-method scheduler
 * (Phase 2, TODO.md #48).
 */

const { generateAllRounds } = require('../../managers/tournament/pairing/roundRobin');

/** Every unordered pair {a,b} that appears across all rounds' real (non-bye) pairings. */
function allPairsPlayed(rounds) {
  const pairs = [];
  for (const round of rounds) {
    for (const p of round) {
      if (p.player2 !== null) pairs.push([p.player1, p.player2].sort().join('-'));
    }
  }
  return pairs;
}

describe('roundRobin.generateAllRounds — boundaries', () => {
  test('0 players: empty schedule, no throw', () => {
    expect(generateAllRounds([])).toEqual([]);
  });

  test('1 player: empty schedule (no valid opponent), no throw', () => {
    expect(generateAllRounds(['A'])).toEqual([]);
  });

  test('2 players: exactly 1 round, 1 pairing', () => {
    const rounds = generateAllRounds(['A', 'B']);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toEqual([{ player1: 'A', player2: 'B' }]);
  });
});

describe('roundRobin.generateAllRounds — even field', () => {
  const players = ['A', 'B', 'C', 'D'];
  const rounds = generateAllRounds(players);

  test('produces n-1 rounds', () => {
    expect(rounds).toHaveLength(3);
  });

  test('every player appears exactly once per round (no repeats, no byes)', () => {
    for (const round of rounds) {
      expect(round).toHaveLength(2);
      const seen = round.flatMap((p) => [p.player1, p.player2]);
      expect(new Set(seen).size).toBe(4);
      expect(round.some((p) => p.player2 === null)).toBe(false);
    }
  });

  test('every pair meets exactly once across the whole schedule (exhaustive coverage)', () => {
    const pairs = allPairsPlayed(rounds);
    const expected = ['A-B', 'A-C', 'A-D', 'B-C', 'B-D', 'C-D'];
    expect(pairs.sort()).toEqual(expected);
  });
});

describe('roundRobin.generateAllRounds — odd field', () => {
  const players = ['A', 'B', 'C'];
  const rounds = generateAllRounds(players);

  test('produces n rounds (one bye round per player)', () => {
    expect(rounds).toHaveLength(3);
  });

  test('each player has exactly one bye round', () => {
    const byeCounts = new Map(players.map((p) => [p, 0]));
    for (const round of rounds) {
      const bye = round.find((p) => p.player2 === null);
      expect(bye).toBeDefined();
      byeCounts.set(bye.player1, byeCounts.get(bye.player1) + 1);
    }
    for (const p of players) expect(byeCounts.get(p)).toBe(1);
  });

  test('every pair meets exactly once (excluding byes)', () => {
    const pairs = allPairsPlayed(rounds);
    expect(pairs.sort()).toEqual(['A-B', 'A-C', 'B-C']);
  });
});

test('larger even field (6 players): exhaustive coverage holds', () => {
  const players = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rounds = generateAllRounds(players);
  expect(rounds).toHaveLength(5);
  const pairs = allPairsPlayed(rounds);
  expect(new Set(pairs).size).toBe(15); // C(6,2)
  expect(pairs).toHaveLength(15); // no duplicates
});
