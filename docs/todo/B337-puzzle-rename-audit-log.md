# B337 — Audit trail for puzzle renames
**Status:** OPEN
**Area:** server/managers/PuzzleService.js:renamePuzzle, server/db/migrations (new), server/routes/puzzles.js, review queue / admin UI
**From:** automated security review of #334, 2026-10-23; user chose option 2 (log, no re-review)   **Depends:** —

## Problem
renamePuzzle lets an author retitle an approved puzzle with no review, so an abusive title can appear on an approved puzzle and moderators never see the change.

## Scope
1. Table puzzle_renames (id, puzzle_id, user_id, old_title, new_title, created_at) + migration; write a row inside renamePuzzle's transaction (skip if the title is unchanged).
2. Admin/mod read endpoint (permission puzzle.review) listing recent renames, newest first, paged.
3. Show it in the review queue or admin Puzzles tab: recent renames with old → new, author, time, link to the puzzle.
4. Decide retention (e.g. keep 90 days or last N per puzzle).

## Don't
- Do not send the puzzle back to pending or wipe progress; rename stays free for the author (#334).
- Do not expose the log to non-reviewers.

## Why this way
Keeps #334 as asked and adds traceability. Rejected: re-review of renames (heavier, blocks the author); no change (moderation blind spot).

## Done when
- Every rename leaves one row; unchanged title leaves none; non-reviewer gets 403 on the list.
- Reviewers see recent renames in the UI; backend + jsdom tests.
