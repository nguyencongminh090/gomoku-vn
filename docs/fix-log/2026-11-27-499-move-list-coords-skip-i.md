# 2026-11-27 13:20 — #499 Move list coordinates skip "I" but the board shows it
## Prompt
"Do #498 499"
## Root cause
`client/js/move-tree.js` `COL_LABELS = 'ABCDEFGHJKLMNOPQRST'` skipped "I" (Go convention), while board.js
`LETTERS` includes "I". From column I onward the list named the next column (board O9 listed as P9), and
x = 19 on 20×20 fell past the 19-char string → `?`.
## Fix
`COL_LABELS` = the board.js alphabet `A…Z` (with "I"). Every `label`/`shortLabel` reader (replay.js,
tree-view.js on main) only displays the string, so no other change. board.js untouched.
## Verification
- New `client/tests/move-tree-coords.test.js`: x=8 → I, x=14 → O, x=19 on 20×20 → T (failed 3/3 before, pass after).
- `node scripts/cache-bust.js` OK (replay.html `?v=` bumped).
- No browser pass.
