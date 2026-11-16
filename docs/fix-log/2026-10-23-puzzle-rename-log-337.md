# 2026-10-23 15:10 — #337 Audit trail for puzzle renames
## Prompt
"làm #337 đi" (from the security review of #334: rename of an approved puzzle bypasses review). Chosen: log, no re-review; keep 50 rows per puzzle; show on the review page.
## Root cause
renamePuzzle (#334) changed the title with no record, so reviewers could not see a post-approval retitle.
## Fix
- server/db/migrations/008_puzzle_renames.sql: table puzzle_renames (+2 indexes).
- PuzzleService.renamePuzzle: one transaction; row written only when the title really changes; trims to RENAME_KEEP=50 per puzzle. New renameLog (puzzle.review only, newest first, 20/page). Route GET /api/puzzles/renames (before /:id).
- client: admin.html #rv-renames, puzzles-review.js:loadRenames (old → new link, author, time, "n older"), i18n vi/en, puzzles.css .pz-rn*.
- Left alone: rename stays free (status, solves, attempts untouched). Branch fix/337-puzzle-rename-log. ?v= bumped (cache-bust --write).
## Verification
- server puzzles-route: 4 new tests (row per real rename, none if unchanged, reviewer-only 403/401, keep 50, status unchanged); games-winner-color expects user_version 8. jsdom: 2 tests. npm test 194 suites green.
- NOT verified: real-browser look at the admin Puzzles tab; pagination of the log (only the first 20 shown, "n older" text).
