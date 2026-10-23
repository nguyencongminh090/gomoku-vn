# 2026-10-23 — #326 room board operable by keyboard
## Prompt
"do #326"
## Root cause
`BoardRenderer` svg was `role="img"` with no `tabindex`; only pointer/touch handlers existed.
## Fix
`client/js/board.js`: svg `role="application"` + `tabindex=0`; keydown: arrows move a cursor (reuses `_hoverCell` ghost), Enter/Space → `_handleCellSelect` (same path as click, so double-click mode, legality, optimistic stone unchanged), Esc/blur clear. Cursor name (`H8`, as drawn) announced via a hidden `role=status` region. Applies to every BoardRenderer page (room, puzzle, replay).
Post-review (Opus): keyboard cursor is its own solid ring (`.gboard__kbcursor`, visible on stones); pointer move/leave clears `_kbCell` so Enter acts on the drawn cell; "not your turn" announced; `tabindex` only while `interactive` (replay/settings preview are not dead tab stops).
## Verification
`client/tests/board-keyboard.test.js` (9 tests); `npm test` 3425 green; cache-bust OK. Real browser: `e2e/board-keyboard.spec.ts` passes on an isolated server (port 3199, temp DB, CORS_ORIGIN set) — Tab reaches board, ArrowRight+Enter places a stone seen by both clients. NOT done: audit Scenario 5 re-run, custom focus ring (browser default outline), screen-reader check. Note: the installed Chromium is rev 1243 but Playwright wants 1234, so e2e needed a temp config with executablePath (not committed).
