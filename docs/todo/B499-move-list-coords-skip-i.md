# B499 — Move list coordinates skip "I" but the board shows it
**Status:** OPEN
**Area:** client/js/move-tree.js (`COL_LABELS`, `coordToLabel`), anything printing `node.label`/`shortLabel`
**From:** features/replay-redesign (mockup review), 2026-11-27   **Depends:** —

## Problem
`COL_LABELS = 'ABCDEFGHJKLMNOPQRST'` skips I, while board.js draws `ABCDEFGHIJ…` (with I).
From column I onward the list names the wrong column (stone at board O9 is listed as P9), and x = 19 on a
20×20 board prints `?`.
**Decided:** user 2026-11-27 — do not skip "I".
## Scope
1. Make move-tree labels use the same letters as board.js (A… with I, 20 columns).
2. Regression test: x=8 → "I", x=14 → "O", x=19 on 20×20 → "T".
## Don't
- Touch board.js. Change what the board draws.
## Traps
- Other readers of `label`/`shortLabel` (tree-view, admin cheat replay); grep before changing.
## Done when
- The board and the list show the same coordinate for every stone; npm test green.
