# B335 — Limit attempts per user per puzzle
**Status:** OPEN
**Area:** server/managers/PuzzleService.js:solve, routes/puzzles.js, client solve UI
**From:** user, 2026-10-23 (puzzle mechanics review)   **Depends:** B336

## Problem
solve() accepts unlimited attempts, so a puzzle can be brute-forced cell by cell. Wanted: a configurable cap (limit value to be decided, e.g. N per puzzle, optionally per time window).

## Scope
1. Pick the limit (N, reset policy, whether solved puzzles are exempt) — ask the user.
2. Enforce in solve() using puzzle_progress.attempts; return PUZZLE_ATTEMPTS_EXCEEDED (429/409) and remaining count.
3. Client shows attempts left.

## Don't
- Do not count malformed-move requests (400) as attempts.

## Done when
- Over-limit solve is rejected with a clear message; the count shows in the UI; backend + jsdom tests.
