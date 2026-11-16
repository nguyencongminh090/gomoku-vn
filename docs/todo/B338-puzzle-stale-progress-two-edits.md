# B338 — Solves survive a position edit made while the puzzle is pending
**Status:** ✅ FIXED 2026-10-23 (docs/fix-log/2026-10-23-puzzle-stale-progress-338.md)
**Area:** server/managers/PuzzleService.js:updatePuzzle
**From:** automated security review of #332, 2026-10-23   **Depends:** #332

## Problem
Approved → text-only edit (pending, solves kept) → edit stones/answers while pending: the wipe only ran when the stored status was `approved`, so solves and attempts of the old position stayed and counted for the new one after re-approval.

## Scope
1. Wipe progress and attempts whenever the position/answers changed, whatever the status.

## Don't
- Do not wipe on text/level/tag edits (#332).

## Done when
- Regression test: approve, solve, text edit keeps solves, then a position edit clears them.
