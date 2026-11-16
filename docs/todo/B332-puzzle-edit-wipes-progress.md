# B332 — Editing an approved puzzle wipes every solver's progress
**Status:** ✅ FIXED 2026-10-23 — progress/attempts wiped only when rule/size/toMove/mode/stones/walls/portals/answers change; test in puzzles-route.test.js
**Area:** server/managers/PuzzleService.js:updatePuzzle, statsFor
**From:** user, 2026-10-23 (puzzle mechanics review)   **Depends:** —

## Problem
updatePuzzle deletes all puzzle_progress rows for an approved puzzle, so solvers lose solves and their member level drops, even for a typo fix.

## Scope
1. Decide policy: keep progress for non-position edits (title/prompt/tags), wipe only when stones/layout/answers change; or version the puzzle.
2. Implement the chosen rule; a wiped puzzle should not silently lower levels.

## Don't
- Do not touch the re-review-on-edit rule unless the policy says so.

## Done when
- Title-only edit keeps solves; a stone/answer edit follows the chosen rule; backend tests for both.
