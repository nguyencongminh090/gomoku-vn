'use strict';

/**
 * doubleElim.test.js — Unit tests for the double-elimination bracket engine
 * (Phase 2, TODO.md #48).
 */

const {
  computeSeedOrder,
  generateBracket,
  resolveBracket,
  needsBracketReset,
} = require('../../managers/tournament/pairing/doubleElim');

describe('computeSeedOrder — standard bracket seeding', () => {
  test('size 4: [1,4,2,3] (1v4 and 2v3 in round 1)', () => {
    expect(computeSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  test('size 8: [1,8,4,5,2,7,3,6] (top 2 seeds kept apart until the final)', () => {
    expect(computeSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('generateBracket — power-of-two field', () => {
  test('size 4: 2 winners rounds, 1 losers round, a grand final', () => {
    const bracket = generateBracket(['P1', 'P2', 'P3', 'P4']);
    expect(bracket.size).toBe(4);
    expect(bracket.winners).toHaveLength(2); // round1 (2 matches) + final (1 match)
    expect(bracket.winners[0]).toHaveLength(2);
    expect(bracket.winners[1]).toHaveLength(1);
    expect(bracket.losers.flat().length).toBeGreaterThan(0);
    expect(bracket.grandFinal).not.toBeNull();
  });

  test('size 8: winners round 1 pairs seed1v8, seed4v5, seed2v7, seed3v6', () => {
    const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const bracket = generateBracket(players);
    expect(bracket.winners[0]).toEqual([
      { id: 'W1M1', slotA: { type: 'seed', seed: 1 }, slotB: { type: 'seed', seed: 8 } },
      { id: 'W1M2', slotA: { type: 'seed', seed: 4 }, slotB: { type: 'seed', seed: 5 } },
      { id: 'W1M3', slotA: { type: 'seed', seed: 2 }, slotB: { type: 'seed', seed: 7 } },
      { id: 'W1M4', slotA: { type: 'seed', seed: 3 }, slotB: { type: 'seed', seed: 6 } },
    ]);
  });
});

describe('generateBracket — non-power-of-two field: byes go to the top seeds only', () => {
  test('5 players (padded to 8): seeds 1, 2, 3 get byes; seeds 4 vs 5 play a real match', () => {
    const players = ['P1', 'P2', 'P3', 'P4', 'P5'];
    const bracket = generateBracket(players);
    expect(bracket.size).toBe(8);

    const resolved = resolveBracket(bracket, new Map());
    expect(resolved.W1M1).toMatchObject({ winner: 'P1', bye: true }); // seed1 vs phantom seed8
    expect(resolved.W1M3).toMatchObject({ winner: 'P2', bye: true }); // seed2 vs phantom seed7
    expect(resolved.W1M4).toMatchObject({ winner: 'P3', bye: true }); // seed3 vs phantom seed6
    expect(resolved.W1M2).toEqual({ player1: 'P4', player2: 'P5', winner: undefined, loser: undefined }); // real match, pending
  });

  test('boundary: 6 and 7 players also pad to 8, with 2 and 1 byes respectively, still top-seeded', () => {
    const players6 = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
    const b6 = generateBracket(players6);
    const r6 = resolveBracket(b6, new Map());
    const byes6 = Object.entries(r6).filter(([id, m]) => id.startsWith('W1') && m.bye);
    expect(byes6).toHaveLength(2);
    expect(byes6.map(([, m]) => m.winner).sort()).toEqual(['P1', 'P2']);

    const players7 = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
    const b7 = generateBracket(players7);
    const r7 = resolveBracket(b7, new Map());
    const byes7 = Object.entries(r7).filter(([id, m]) => id.startsWith('W1') && m.bye);
    expect(byes7).toHaveLength(1);
    expect(byes7[0][1].winner).toBe('P1');
  });
});

describe('generateBracket / resolveBracket — full 8-player walkthrough', () => {
  const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']; // seed1..seed8
  const bracket = generateBracket(players);

  /** Base results shared by both grand-final scenarios below. */
  function baseResults() {
    return new Map([
      ['W1M1', 'P1'], ['W1M2', 'P5'], ['W1M3', 'P2'], ['W1M4', 'P6'], // round 1
      ['L1M1', 'P4'], ['L1M2', 'P7'],                                  // losers round 1
      ['W2M1', 'P1'], ['W2M2', 'P2'],                                  // winners round 2
      ['L2M1', 'P5'], ['L2M2', 'P6'],                                  // losers round 2 (drop)
      ['L3M1', 'P5'],                                                  // losers round 3 (survivors)
      ['W3M1', 'P1'],                                                  // winners final
      ['L4M1', 'P2'],                                                  // losers final (vs WR-final loser)
    ]);
  }

  test('the loser of a winners-round-1 match lands in the correct losers-bracket slot', () => {
    const resolved = resolveBracket(bracket, baseResults());
    // W1M1: P1 beat P8 -> P8 drops. W1M2: P5 beat P4 -> P4 drops.
    // L1M1 should be exactly {P8, P4} (order per slotA/slotB definition).
    expect(resolved.L1M1).toMatchObject({ player1: 'P8', player2: 'P4', winner: 'P4', loser: 'P8' });
    // W1M3: P2 beat P7 -> P7 drops. W1M4: P6 beat P3 -> P3 drops.
    expect(resolved.L1M2).toMatchObject({ player1: 'P7', player2: 'P3', winner: 'P7', loser: 'P3' });
  });

  test('the losers-bracket final pairs its own survivor against the winners-final loser', () => {
    const resolved = resolveBracket(bracket, baseResults());
    // L3M1 winner P5 (survivor) vs loser of W3M1 (P2, since P1 beat P2).
    expect(resolved.L4M1).toMatchObject({ player1: 'P5', player2: 'P2', winner: 'P2', loser: 'P5' });
  });

  test('seed1 and seed2 (top 2 seeds) meet only at the winners-bracket final, not earlier', () => {
    const resolved = resolveBracket(bracket, baseResults());
    expect(resolved.W3M1).toMatchObject({ player1: 'P1', player2: 'P2' });
    // Confirm they don't co-occur in any earlier winners match.
    for (const round of bracket.winners.slice(0, -1)) {
      for (const m of round) {
        const r = resolved[m.id];
        expect([r.player1, r.player2]).not.toEqual(expect.arrayContaining(['P1', 'P2']));
      }
    }
  });

  test('grand final: winners-bracket finalist wins → champion decided, no reset needed', () => {
    const results = baseResults();
    results.set('GF', 'P1'); // slotA (winners finalist) wins
    expect(needsBracketReset(bracket, results)).toBe(false);
    const resolved = resolveBracket(bracket, results);
    expect(resolved.GF.winner).toBe('P1');
  });

  test('grand final: losers-bracket finalist wins → bracket-reset match required', () => {
    const results = baseResults();
    results.set('GF', 'P2'); // slotB (losers finalist, already 1 loss) wins
    expect(needsBracketReset(bracket, results)).toBe(true);
  });

  test('grand final not yet played: needsBracketReset is false, not a crash', () => {
    expect(needsBracketReset(bracket, baseResults())).toBe(false);
  });
});

describe('generateBracket — edge/rare fields', () => {
  test('0 players: empty bracket, no throw', () => {
    const bracket = generateBracket([]);
    expect(bracket.size).toBe(0);
    expect(bracket.winners).toEqual([]);
    expect(bracket.grandFinal).toBeNull();
  });

  test('1 player: auto-champion via a single bye match, no crash', () => {
    const bracket = generateBracket(['SoloP']);
    const resolved = resolveBracket(bracket, new Map());
    expect(resolved.W1M1).toMatchObject({ winner: 'SoloP', bye: true });
    expect(bracket.losers).toEqual([]); // no losers bracket for a 2-slot (1 real + 1 phantom) field
  });

  test('2 players: single match, no losers bracket, no grand final', () => {
    const bracket = generateBracket(['P1', 'P2']);
    expect(bracket.size).toBe(2);
    expect(bracket.losers).toEqual([]);
    expect(bracket.grandFinal).toBeNull();
  });
});
