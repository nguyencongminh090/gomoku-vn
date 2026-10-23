# B334 — Allow the author to rename a puzzle without re-review
**Status:** OPEN
**Area:** server/managers/PuzzleService.js:updatePuzzle, routes/puzzles.js, client edit form
**From:** user, 2026-10-23 (puzzle mechanics review)   **Depends:** B332

## Problem
Any edit, including the title, sends the puzzle back to pending (and wipes solves if approved). Wanted: renaming alone is allowed cheaply (assumed: title rename by the author — confirm; maybe also by admin).

## Scope
1. Add a title-only update path that keeps status and progress; same title validation (1–60, dmText.clean).
2. Client: rename control on own puzzles.

## Don't
- Do not let a rename alter stones/answers/level.

## Done when
- Rename of an approved puzzle keeps status and solves; non-author gets 403; tests.
