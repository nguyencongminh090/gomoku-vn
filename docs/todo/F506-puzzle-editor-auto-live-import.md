# F506 — Puzzle editor: Auto-only stones, live text import, last-stone marker
**Status:** OPEN
**Area:** client/js/puzzle-editor.js, client/puzzle-editor.html, client/js/i18n.js, client/tests/puzzle-authoring-pages.test.js
**From:** features/puzzle-modern/prompt.md task 2A, 2026-11-27   **Depends:** B504 (same branch, uncommitted)

## Problem
`/puzzles/new` has separate Black/White stone tools beside Auto, the text import (`#ed-import`) only applies on a button press and reports bad text in the bottom `#ed-result`, and the board does not mark the last placed stone.

## Scope
1. Drop the BLACK/WHITE tools; AUTO is the default and only stone tool (`autoColor()` counts stones, so erasing keeps it in step). Tool options get `data-tool`.
2. Parse `#ed-import` on `input`, debounced 300 ms; drop `#ed-import-btn`. Bad tokens → inline `#ed-import-err` (`role="alert"`, `aria-invalid` + `aria-describedby` on the field) naming the token ("i99 không hợp lệ"); the last valid board stays. Empty / no-coordinate text is a silent no-op. No `window.alert()`.
3. Mark the last placed stone with BoardRenderer's `lastMove` (set on the state returned by `PuzzleBoard.state`); a placement stack moves the marker back when the top stone is erased/overwritten.

## Don't
- Edit `client/js/board.js` or `puzzle-board.js` (shared with the admin review queue).
- Touch server validation.

## Traps
- Test stub merges state with a spread: always set `lastMove` (even `null`).
- Unpaired `portal: b2` lands in `bad` mid-typing — reported as the bad token too (accepted).
- `settle()` uses real `setTimeout`: boot first, then switch to fake timers for the debounce.

## Done when
- jsdom tests: no single-colour tools, live parse + inline notice (no alert), last-stone marker incl. erase; `cache-bust` OK; `npm test` green.

## Verification (2026-11-27, `ui/puzzle-modern`, uncommitted)
- `npm test` 300/300 suites, 5374 tests; `cache-bust` OK.
- Real browser, temp DB (`GOMOKU_DB_PATH`, port 3108; real `gomoku.db` sha256 unchanged): `LABEL=before node features/puzzle-modern/shoot.js` → `checks` in `shots/before-measure.json` all true, 0 console errors, 0 native dialogs.
