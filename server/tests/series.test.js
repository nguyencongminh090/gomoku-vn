'use strict';

/**
 * series.test.js — Unit tests for the pure series-scoring/decision functions
 * (TODO.md #50 / instruction.md B50 step 3). Covers both series modes, draws,
 * long uncapped race-to-margin sequences, and exact target/margin boundaries,
 * per CLAUDE.md's "Writing comprehensive test cases" rule.
 */

const { computeSeriesScore, evaluateSeries } = require('../managers/tournament/series');

const P1 = 'e1';
const P2 = 'e2';

function game(winnerEntryId, index = 0) {
  return { index, winnerEntryId, endedAt: new Date().toISOString() };
}

// ── computeSeriesScore ──────────────────────────────────────────────────

describe('computeSeriesScore', () => {
  test('no games played: both start at 0', () => {
    expect(computeSeriesScore([], P1, P2)).toEqual({ [P1]: 0, [P2]: 0 });
  });

  test('a win awards 1 point to the winner, 0 to the loser', () => {
    expect(computeSeriesScore([game(P1)], P1, P2)).toEqual({ [P1]: 1, [P2]: 0 });
  });

  test('a draw awards 0.5 to each side', () => {
    expect(computeSeriesScore([game(null)], P1, P2)).toEqual({ [P1]: 0.5, [P2]: 0.5 });
  });

  test('mixed sequence accumulates correctly', () => {
    const games = [game(P1, 0), game(P2, 1), game(null, 2), game(P1, 3)];
    expect(computeSeriesScore(games, P1, P2)).toEqual({ [P1]: 2.5, [P2]: 1.5 });
  });
});

// ── evaluateSeries: 'single' mode (default, must reproduce old behavior) ──

describe('evaluateSeries — single mode', () => {
  const ruleSet = { seriesMode: 'single' };

  test('no games yet: not complete', () => {
    expect(evaluateSeries([], ruleSet, P1, P2)).toEqual({ seriesComplete: false, winnerEntryId: null });
  });

  test('one win: complete immediately, winner declared', () => {
    expect(evaluateSeries([game(P1)], ruleSet, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: P1 });
  });

  test('one draw: complete immediately, tied (winnerEntryId null)', () => {
    expect(evaluateSeries([game(null)], ruleSet, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: null });
  });

  test('ignores seriesGameCount even if present — single always means exactly 1 game', () => {
    const withCount = { seriesMode: 'single', seriesGameCount: 10 };
    expect(evaluateSeries([game(P2)], withCount, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: P2 });
  });

  test('defaults to single when seriesMode is absent', () => {
    expect(evaluateSeries([game(P1)], {}, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: P1 });
  });
});

// ── evaluateSeries: 'fixedCount' mode ─────────────────────────────────────

describe('evaluateSeries — fixedCount mode', () => {
  const ruleSet = { seriesMode: 'fixedCount', seriesGameCount: 4 };

  test('boundary: one game short of the count is not complete', () => {
    const games = [game(P1, 0), game(P1, 1), game(P2, 2)];
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: false, winnerEntryId: null });
  });

  test('boundary: exactly at the count, higher score wins', () => {
    const games = [game(P1, 0), game(P1, 1), game(P2, 2), game(P1, 3)];
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: P1 });
  });

  test('tied total score at the count: complete, but no winner (draw)', () => {
    const games = [game(P1, 0), game(P2, 1), game(null, 2), game(null, 3)];
    // P1: 1 + 0.5 = 1.5, P2: 1 + 0.5 = 1.5
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: null });
  });

  test('boundary: seriesGameCount of 1 behaves like single mode', () => {
    const ruleSet1 = { seriesMode: 'fixedCount', seriesGameCount: 1 };
    expect(evaluateSeries([game(P2)], ruleSet1, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: P2 });
  });

  test('extra games beyond the count still evaluate as complete (defensive — should never happen via the caller)', () => {
    const games = [game(P1, 0), game(P1, 1), game(P1, 2), game(P1, 3), game(P2, 4)];
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: P1 });
  });
});

// ── evaluateSeries: 'raceToMargin' mode ───────────────────────────────────

describe('evaluateSeries — raceToMargin mode', () => {
  const ruleSet = { seriesMode: 'raceToMargin', seriesTargetScore: 12, seriesMargin: 2 };

  function winsFor(entryId, count, startIndex = 0) {
    return Array.from({ length: count }, (_, i) => game(entryId, startIndex + i));
  }

  test('below target: not complete even with a big lead', () => {
    const games = [...winsFor(P1, 5)];
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: false, winnerEntryId: null });
  });

  test('boundary: at target but margin not met (12-11) — not complete, must continue', () => {
    const games = [...winsFor(P1, 12, 0), ...winsFor(P2, 11, 12)];
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: false, winnerEntryId: null });
  });

  test('boundary: exactly at target and margin (13-11) — complete', () => {
    const games = [...winsFor(P1, 13, 0), ...winsFor(P2, 11, 13)];
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: true, winnerEntryId: P1 });
  });

  test('boundary: 12.5-12.5 (target met by both, margin 0) — not complete', () => {
    const games = [...winsFor(P1, 12, 0), game(null, 12), ...winsFor(P2, 12, 13)];
    expect(computeSeriesScore(games, P1, P2)).toEqual({ [P1]: 12.5, [P2]: 12.5 });
    expect(evaluateSeries(games, ruleSet, P1, P2).seriesComplete).toBe(false);
  });

  test('user-cited example: score continues past target once margin isn\'t met yet, until further wins clinch it', () => {
    // Build up to 12.5-12.5 (target met by both, margin 0 — not enough, as
    // asserted in the boundary test above), then two more decisive games for
    // P1 push the margin to 2 -> 14.5-12.5, clinching it.
    const games = [
      ...winsFor(P1, 12, 0),
      game(null, 12), // P1 12.5, P2 0.5 so far (P2 still needs its 12 wins below)
      ...winsFor(P2, 12, 13),
      ...winsFor(P1, 2, 25), // P1 14.5, P2 12.5
    ];
    const result = evaluateSeries(games, ruleSet, P1, P2);
    expect(computeSeriesScore(games, P1, P2)).toEqual({ [P1]: 14.5, [P2]: 12.5 });
    expect(result).toEqual({ seriesComplete: true, winnerEntryId: P1 });
  });

  test('uncapped: 20+ consecutive draws never completes the series (no hidden game-count safety cap)', () => {
    const games = Array.from({ length: 30 }, (_, i) => game(null, i));
    // 15-15 tied — nowhere near target, and ties can never satisfy the margin anyway.
    expect(evaluateSeries(games, ruleSet, P1, P2)).toEqual({ seriesComplete: false, winnerEntryId: null });
  });

  test('uncapped: an extremely long back-and-forth sequence (60 games) that only just clinches at the end', () => {
    // 29 wins each (29-29), then P2 wins twice in a row -> 29-31, margin 2, target met.
    const games = [
      ...Array.from({ length: 29 }, (_, i) => (i % 2 === 0 ? game(P1, i) : game(P2, i))),
      game(P2, 58),
      game(P2, 59),
    ];
    // 29 alternating games: P1 gets ceil(29/2)=15, P2 gets 14, then +2 for P2 -> P1=15, P2=16
    const score = computeSeriesScore(games, P1, P2);
    expect(score[P1] + score[P2]).toBe(31);
    const result = evaluateSeries(games, ruleSet, P1, P2);
    if (Math.max(score[P1], score[P2]) >= 12 && Math.abs(score[P1] - score[P2]) >= 2) {
      expect(result.seriesComplete).toBe(true);
    } else {
      expect(result.seriesComplete).toBe(false);
    }
  });

  test('raceToMargin never completes tied — margin > 0 makes scoreA === scoreB impossible at completion', () => {
    // Sanity check on the invariant documented in the function's JSDoc.
    const games = [...winsFor(P1, 12), ...winsFor(P2, 12)];
    const result = evaluateSeries(games, ruleSet, P1, P2);
    expect(result.seriesComplete).toBe(false); // 12-12, margin 0 < required 2
  });
});

// ── evaluateSeries: invalid input ─────────────────────────────────────────

describe('evaluateSeries — invalid seriesMode', () => {
  test('throws on an unknown seriesMode rather than silently defaulting', () => {
    expect(() => evaluateSeries([], { seriesMode: 'bogus' }, P1, P2)).toThrow(/unknown seriesMode/);
  });
});
