# 2026-10-23 15:55 — #338 Solves survive a position edit made while pending
## Prompt
"DO #338" (after the security review noted stale solve state).
## Root cause
updatePuzzle cleared puzzle_progress/puzzle_attempts only if the row's status was `approved` at edit time. A text-only edit already sets status `pending` (keeping solves, #332), so a second edit that changed the position found status `pending` and skipped the wipe.
## Fix
- server/managers/PuzzleService.js:updatePuzzle: condition is just `changed` (no-op for puzzles never approved, which have no progress). Branch fix/338-stale-progress-two-edits. No client change.
## Verification
- New test in puzzles-route.test.js (#338) was red before, green after; npm test 194 suites / 3469 green.
- NOT verified: real browser (server-only change).
