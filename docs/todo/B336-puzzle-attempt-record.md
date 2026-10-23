# B336 — Record each user attempt on a puzzle
**Status:** OPEN
**Area:** server/managers/PuzzleService.js:solve, db schema puzzle_progress, profile/puzzle UI
**From:** user, 2026-10-23 (puzzle mechanics review)   **Depends:** —

## Problem
Only a counter (attempts) and first solved_at are stored; the moves tried and attempt times are lost. Wanted: a per-attempt record (user, puzzle, moves, correct, time) viewable by the user, maybe by the reviewer.

## Scope
1. New table puzzle_attempts (id, user_id, puzzle_id, moves, correct, created_at) + migration.
2. Write a row in solve() inside the existing transaction.
3. Read endpoint/UI for own history; decide retention and reviewer visibility.

## Don't
- Do not expose other users' attempts; do not store answers.

## Done when
- Each solve call leaves one row; own history viewable; retention decided; tests.
