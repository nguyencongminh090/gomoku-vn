'use strict';

/**
 * standings.test.js — Unit tests for score table + Buchholz/Sonneborn-Berger
 * tiebreaks (Phase 2, TODO.md #48, decision 9).
 */

const { computeStandings, computeTiebreaks, rankStandings, rankRoundRobinStandings } = require('../../managers/tournament/standings');

describe('computeStandings', () => {
  test('a win scores 1, a loss scores 0', () => {
    const entries = [{ id: 'A' }, { id: 'B' }];
    const pairings = [{ player1: 'A', player2: 'B', winner: 'A' }];
    const standings = computeStandings(entries, pairings);
    expect(standings.find((s) => s.id === 'A').score).toBe(1);
    expect(standings.find((s) => s.id === 'B').score).toBe(0);
  });

  test('a draw scores 0.5 for each player', () => {
    const entries = [{ id: 'A' }, { id: 'B' }];
    const pairings = [{ player1: 'A', player2: 'B', winner: 'draw' }];
    const standings = computeStandings(entries, pairings);
    expect(standings.find((s) => s.id === 'A').score).toBe(0.5);
    expect(standings.find((s) => s.id === 'B').score).toBe(0.5);
  });

  test('a bye scores 1 for the recipient, no opponent recorded', () => {
    const entries = [{ id: 'A' }];
    const pairings = [{ player1: 'A', player2: null }];
    const standings = computeStandings(entries, pairings);
    expect(standings[0].score).toBe(1);
    expect(standings[0].opponents).toEqual([]);
  });

  test('score accumulates correctly across multiple rounds', () => {
    const entries = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const pairings = [
      { player1: 'A', player2: 'B', winner: 'A' },
      { player1: 'A', player2: 'C', winner: 'draw' },
    ];
    const standings = computeStandings(entries, pairings);
    expect(standings.find((s) => s.id === 'A').score).toBe(1.5);
    expect(standings.find((s) => s.id === 'A').opponents.sort()).toEqual(['B', 'C']);
  });

  test('no completed pairings: everyone scores 0', () => {
    const entries = [{ id: 'A' }, { id: 'B' }];
    expect(computeStandings(entries, [])).toEqual([
      { id: 'A', score: 0, opponents: [] },
      { id: 'B', score: 0, opponents: [] },
    ]);
  });
});

describe('computeTiebreaks — Buchholz', () => {
  test('a known 4-player round-robin: Buchholz sums opponents\' final scores', () => {
    // A beats B, A beats C, A loses to D; B beats C, B loses to D; C loses to D.
    // Scores: A=2, B=1, C=0, D=3.
    const entries = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const pairings = [
      { player1: 'A', player2: 'B', winner: 'A' },
      { player1: 'A', player2: 'C', winner: 'A' },
      { player1: 'A', player2: 'D', winner: 'D' },
      { player1: 'B', player2: 'C', winner: 'B' },
      { player1: 'B', player2: 'D', winner: 'D' },
      { player1: 'C', player2: 'D', winner: 'D' },
    ];
    const standings = computeStandings(entries, pairings);
    const tiebreaks = computeTiebreaks(standings, pairings);

    const byId = Object.fromEntries(tiebreaks.map((t) => [t.id, t]));
    expect(byId.A.score).toBe(2);
    expect(byId.B.score).toBe(1);
    expect(byId.C.score).toBe(0);
    expect(byId.D.score).toBe(3);

    // A played B(1), C(0), D(3) -> Buchholz = 4.
    expect(byId.A.buchholz).toBe(4);
    // D played A(2), B(1), C(0) -> Buchholz = 3.
    expect(byId.D.buchholz).toBe(3);
  });
});

describe('computeTiebreaks — Sonneborn-Berger', () => {
  test('sums defeated opponents\' scores fully, drawn opponents\' scores at half weight', () => {
    // A beats B (score 2 at final), A draws C (score 1 at final).
    const entries = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const pairings = [
      { player1: 'A', player2: 'B', winner: 'A' },
      { player1: 'A', player2: 'C', winner: 'draw' },
      { player1: 'B', player2: 'C', winner: 'draw' }, // gives B and C their final scores
    ];
    const standings = computeStandings(entries, pairings);
    // A: 1 (beat B) + 0.5 (drew C) = 1.5
    // B: 0 (lost to A) + 0.5 (drew C) = 0.5
    // C: 0.5 (drew A) + 0.5 (drew B) = 1.0
    const byId = Object.fromEntries(standings.map((s) => [s.id, s]));
    expect(byId.A.score).toBe(1.5);
    expect(byId.B.score).toBe(0.5);
    expect(byId.C.score).toBe(1);

    const tiebreaks = computeTiebreaks(standings, pairings);
    const tbById = Object.fromEntries(tiebreaks.map((t) => [t.id, t]));
    // A's SB: beat B (full B score 0.5) + drew C (half C score 1.0/2=0.5) = 1.0
    expect(tbById.A.sonnebornBerger).toBe(1.0);
  });

  test('byes are excluded from both Buchholz and Sonneborn-Berger (no real opponent to weight by)', () => {
    const entries = [{ id: 'A' }, { id: 'B' }];
    const pairings = [
      { player1: 'A', player2: null }, // bye
      { player1: 'A', player2: 'B', winner: 'A' },
    ];
    const standings = computeStandings(entries, pairings);
    const tiebreaks = computeTiebreaks(standings, pairings);
    const a = tiebreaks.find((t) => t.id === 'A');
    // Only the real game vs B (score 0) counts; the bye contributes nothing.
    expect(a.buchholz).toBe(0);
    expect(a.sonnebornBerger).toBe(0);
  });
});

describe('rankStandings', () => {
  test('ranks by score, then Buchholz, then Sonneborn-Berger, all descending', () => {
    const rows = [
      { id: 'A', score: 2, buchholz: 3, sonnebornBerger: 1 },
      { id: 'B', score: 3, buchholz: 1, sonnebornBerger: 0 },
      { id: 'C', score: 2, buchholz: 4, sonnebornBerger: 2 },
    ];
    const ranked = rankStandings(rows);
    expect(ranked.map((r) => r.id)).toEqual(['B', 'C', 'A']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  test('a genuine unresolved tie (identical on all 3 measures) shares the same rank, not an arbitrary break', () => {
    const rows = [
      { id: 'A', score: 2, buchholz: 3, sonnebornBerger: 1 },
      { id: 'B', score: 2, buchholz: 3, sonnebornBerger: 1 },
      { id: 'C', score: 1, buchholz: 5, sonnebornBerger: 5 },
    ];
    const ranked = rankStandings(rows);
    const a = ranked.find((r) => r.id === 'A');
    const b = ranked.find((r) => r.id === 'B');
    const c = ranked.find((r) => r.id === 'C');
    expect(a.rank).toBe(b.rank);
    expect(a.rank).toBe(1);
    expect(c.rank).toBe(3); // not 2 — standard "skip ranks after a tie" convention
  });

  test('empty input: empty output, no throw', () => {
    expect(rankStandings([])).toEqual([]);
  });
});

describe('rankRoundRobinStandings — head-to-head / wins (#245)', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: 'ABCDEF'[i] }));
  const rank = (n, pairings) => {
    const standings = computeStandings(ids(n), pairings);
    return rankRoundRobinStandings(computeTiebreaks(standings, pairings), pairings);
  };
  const ranksById = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.rank]));

  test('two players tied on score: the one who won their game ranks higher (Buchholz would tie them)', () => {
    // A=2 (beat B, C), B=2 (beat C, D), C=1 (beat D), D=1 (beat A)
    const pairings = [
      { player1: 'A', player2: 'B', winner: 'A' }, { player1: 'A', player2: 'C', winner: 'A' }, { player1: 'D', player2: 'A', winner: 'D' },
      { player1: 'B', player2: 'C', winner: 'B' }, { player1: 'B', player2: 'D', winner: 'B' }, { player1: 'C', player2: 'D', winner: 'C' },
    ];
    const r = ranksById(rank(4, pairings));
    expect(r.A).toBe(1);
    expect(r.B).toBe(2);
    // C and D: 1 point each, C beat D
    expect(r.C).toBe(3);
    expect(r.D).toBe(4);
  });

  test('a 3-way cycle (A>B>C>A) stays a genuine tie; the loser to all ranks below', () => {
    const pairings = [
      { player1: 'A', player2: 'B', winner: 'A' }, { player1: 'B', player2: 'C', winner: 'B' }, { player1: 'C', player2: 'A', winner: 'C' },
      { player1: 'A', player2: 'D', winner: 'A' }, { player1: 'B', player2: 'D', winner: 'B' }, { player1: 'C', player2: 'D', winner: 'C' },
    ];
    expect(ranksById(rank(4, pairings))).toEqual({ A: 1, B: 1, C: 1, D: 4 });
  });

  test('equal score and equal head-to-head (draw): more real wins ranks higher', () => {
    // A 1.5 (W vs C, D vs B, L vs D), B 1.5 (three draws), C 1 (L, D, D), D 2 (W vs A, D, D)
    const pairings = [
      { player1: 'A', player2: 'B', winner: 'draw' }, { player1: 'A', player2: 'C', winner: 'A' }, { player1: 'D', player2: 'A', winner: 'D' },
      { player1: 'B', player2: 'C', winner: 'draw' }, { player1: 'B', player2: 'D', winner: 'draw' }, { player1: 'C', player2: 'D', winner: 'draw' },
    ];
    expect(ranksById(rank(4, pairings))).toEqual({ D: 1, A: 2, B: 3, C: 4 });
  });

  test('byes do not count as wins for the wins tiebreak and rows carry headToHead/wins', () => {
    const pairings = [{ player1: 'A', player2: null }, { player1: 'B', player2: 'C', winner: 'B' }];
    const rows = rank(3, pairings);
    expect(rows.find((x) => x.id === 'A').wins).toBe(0);
    expect(rows.find((x) => x.id === 'B').wins).toBe(1);
  });
});
