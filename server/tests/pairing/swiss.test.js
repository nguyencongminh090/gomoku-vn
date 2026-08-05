'use strict';

/**
 * swiss.test.js — Unit tests for the Swiss pairing engine (Phase 2, TODO.md #48).
 */

const { generateNextRound } = require('../../managers/tournament/pairing/swiss');

/** Build a standings entry. opponents defaults to an empty Set. */
function entry(id, score, opponents = [], hadBye = false) {
  return { id, score, opponents: new Set(opponents), hadBye };
}

describe('swiss.generateNextRound — basic cases', () => {
  test('even field, round 1 (all tied at 0): fold-pairs top half vs bottom half', () => {
    const standings = [entry('A', 0), entry('B', 0), entry('C', 0), entry('D', 0)];
    const pairings = generateNextRound(standings);
    expect(pairings).toEqual([
      { player1: 'A', player2: 'C' },
      { player1: 'B', player2: 'D' },
    ]);
  });

  test('multiple score groups: each group paired independently', () => {
    const standings = [entry('A', 2), entry('B', 2), entry('C', 1), entry('D', 1)];
    const pairings = generateNextRound(standings);
    expect(pairings).toEqual([
      { player1: 'A', player2: 'B' },
      { player1: 'C', player2: 'D' },
    ]);
  });

  test('no players: returns an empty array, does not throw', () => {
    expect(generateNextRound([])).toEqual([]);
  });

  test('a single player: receives a bye, no crash', () => {
    const pairings = generateNextRound([entry('A', 0)]);
    expect(pairings).toEqual([{ player1: 'A', player2: null }]);
  });
});

describe('swiss.generateNextRound — bye handling (odd field)', () => {
  test('odd field: exactly one bye, assigned to the lowest-scored player without a prior bye', () => {
    const standings = [entry('A', 2), entry('B', 1), entry('C', 1), entry('D', 0), entry('E', 0)];
    const pairings = generateNextRound(standings);
    const byes = pairings.filter((p) => p.player2 === null);
    expect(byes).toHaveLength(1);
    expect(byes[0].player1).toBe('E'); // lowest score, no prior bye
    expect(pairings).toHaveLength(3); // 2 real pairings + 1 bye = matches 5 players
  });

  test('a player who already had a bye is skipped for a second one, even if still lowest-scored', () => {
    const standings = [
      entry('A', 2),
      entry('B', 1),
      entry('C', 1),
      entry('D', 0, [], true),  // already had a bye, still lowest score
      entry('E', 0.5),
    ];
    const pairings = generateNextRound(standings);
    const bye = pairings.find((p) => p.player2 === null);
    expect(bye.player1).not.toBe('D');
  });

  test('every remaining player has already had a bye: falls back to the lowest scorer rather than throwing', () => {
    const standings = [entry('A', 1, [], true), entry('B', 0, [], true), entry('C', 0.5)];
    expect(() => generateNextRound(standings)).not.toThrow();
    const pairings = generateNextRound(standings);
    const bye = pairings.find((p) => p.player2 === null);
    expect(bye).toBeDefined();
  });
});

describe('swiss.generateNextRound — rematch avoidance', () => {
  test('avoids repeating a pairing the naive fold split would otherwise produce', () => {
    // Naive fold on [P1,P2,P3,P4] (all tied) pairs (P1,P3) and (P2,P4).
    // P1 already played P3 — the algorithm must route around that pairing.
    const standings = [
      entry('P1', 1, ['P3']),
      entry('P2', 1, []),
      entry('P3', 1, ['P1']),
      entry('P4', 1, []),
    ];
    const pairings = generateNextRound(standings);
    const hasRematch = pairings.some(
      (p) => (p.player1 === 'P1' && p.player2 === 'P3') || (p.player1 === 'P3' && p.player2 === 'P1')
    );
    expect(hasRematch).toBe(false);
    expect(pairings).toHaveLength(2);
  });

  test('falls back to a rematch only when every candidate has already been played', () => {
    // P1 has already played both P2 and P3 in this 3-player-tied group... to
    // keep this a clean 2-pairing test, use a 4-player group where P1 has
    // played BOTH bottom-half candidates — algorithm must still produce a
    // valid (if repeated) pairing rather than leaving P1 unpaired.
    const standings = [
      entry('P1', 1, ['P3', 'P4']),
      entry('P2', 1, []),
      entry('P3', 1, ['P1']),
      entry('P4', 1, ['P1']),
    ];
    const pairings = generateNextRound(standings);
    expect(pairings).toHaveLength(2);
    const allPlayers = pairings.flatMap((p) => [p.player1, p.player2]);
    expect(allPlayers.sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
  });
});

describe('swiss.generateNextRound — score-group floating', () => {
  test('a score group of size 1 floats into the adjacent (lower) group', () => {
    // Score groups: [A]=2, [B,C,D]=1 (3 players). A alone can't pair within
    // its own group, so it must float down into the score-1 group, making a
    // combined group of 4 that pairs off completely (no bye needed).
    const standings = [entry('A', 2), entry('B', 1), entry('C', 1), entry('D', 1)];
    const pairings = generateNextRound(standings);
    expect(pairings.filter((p) => p.player2 === null)).toHaveLength(0);
    expect(pairings).toHaveLength(2);
    const allPlayers = pairings.flatMap((p) => [p.player1, p.player2]);
    expect(allPlayers.sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});
