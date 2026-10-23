# B335 — Limit attempts per user per puzzle
**Status:** ✅ DONE 2026-10-23 — decided 2026-10-23: 3 tries/puzzle, never reset, solved = exempt; solvers + tries public, own moves private, kept forever — browser pass 2026-10-23 (isolated server :3101, own DB, desktop 1280 + mobile 390): all checks pass, 0 console errors
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
