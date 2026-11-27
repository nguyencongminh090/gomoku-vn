# F507 — Puzzle solver: text-only answers, no undo, explore board after the end
**Status:** ✅ DONE 2026-11-27 — commit f0a00c21, merged to dev (90c12af9)
**Area:** client/js/puzzle.js, client/puzzle.html, client/js/i18n.js, client/tests/puzzle-solve-page.test.js
**From:** features/puzzle-modern/prompt.md task 2B, 2026-11-27   **Depends:** B504 (same branch, uncommitted)

## Problem
On `/puzzle/<id>` board clicks enter answer moves, and "Bỏ nước cuối" (`#pz-undo`) edits them. The user wants the answer entered only as text and the board free for study once the puzzle is over.

## Scope
1. While unsolved and attempts remain (or unknown/guest): board view-only, `onCellClick` ignores clicks; answer only via `#pz-input`.
2. Remove `#pz-undo`, its handler and `puzzles.undo`.
3. `explore = solved || attemptsLeft === 0`: board unlocks; clicks place alternating stones starting from `toMove`, never submitted; tonal `#pz-reset` resets to the puzzle position. Re-evaluated on load, wrong answer to 0, `PUZZLE_ATTEMPTS_EXCEEDED`, history load.

## Don't
- Edit `client/js/board.js` / `puzzle-board.js`; add a second raised primary.

## Traps
- `renderMoves()` set `#pz-undo.disabled` — remove with the button.
- jsdom calls `opts.onCellClick` directly: guard in the handler, not only via `interactive:false`.

## Done when
- jsdom tests: locked before, unlocked after solved / out of attempts, no `/solve` from explore, reset, no undo button; `cache-bust` OK; `npm test` green.

## Verification (2026-11-27, `ui/puzzle-modern`, uncommitted)
- `npm test` 300/300 suites, 5374 tests; `cache-bust` OK.
- Real browser, temp DB (`GOMOKU_DB_PATH`, port 3108; real `gomoku.db` sha256 unchanged): `LABEL=before node features/puzzle-modern/shoot.js` → `checks` in `shots/before-measure.json` all true, 0 console errors, 0 native dialogs.
