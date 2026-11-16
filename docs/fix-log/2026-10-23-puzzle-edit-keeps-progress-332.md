# #332 — editing an approved puzzle no longer wipes progress for non-position edits
**Prompt:** "DO #332 - 336"
**Root cause:** PuzzleService.updatePuzzle deleted puzzle_progress for every edit of an approved puzzle (it did not compare what changed).
**Fix:** compare rule/size/toMove/mode/stones/walls/portals/answers; wipe progress + puzzle_attempts only when they differ. Title/prompt/tags/level edits keep solves (puzzle still returns to pending — unchanged).
**Test:** server/tests/puzzles-route.test.js › editing (text edit keeps, answers edit clears, identical re-save keeps).
**Note:** a wiped puzzle still lowers the author-visible solve count; policy chosen by user 2026-10-23.
