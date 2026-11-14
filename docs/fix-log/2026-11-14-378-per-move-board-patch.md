# 2026-11-14 17:30 — #378 per-move room cost: board patch, no room-UI rebuild
## Prompt
"Do #378" — remaining client cost of `game:moved` after perf/play-lag (~11.6 ms late game, 4× CPU).
## Root cause
- `BoardRenderer.setState` always ran the full `_draw`: the whole SVG string (grid, labels, every
  stone, numbers) rebuilt and re-parsed via `innerHTML` for one new stone — grows with stone count.
- `game:moved` ended with `RoomUI.updateUI()` (cards, settings, users, score table) though a move
  changes no room data; turn/clock repaint already comes via `updateBoardState → renderTimers →
  RoomUI.updateCardClocks`.
## Fix
- `client/js/board.js`: `_draw` split into shared pieces (`_drawCtx`, `_cellSvg`, `_lastCellSvg`,
  `_moveNumbersSvg`, `_lastMarkerSvg`); stable layers `gboard__lc/pcs/num/lm` (+ `gboard__cn` for
  in-cell labels, `data-c` per cell). New `_drawMove()`: when exactly one empty cell became a stone,
  it is the new last move, history grew by one and the look/size/zones/win line/portals signature is
  unchanged → insert the stone in row-major position (overlap order = full draw), drop its cell
  label, regenerate the three last-move/number layers, redraw the overlay. Anything else → `_draw`.
  Markup is byte-identical to a full redraw (look unchanged — design lock respected).
- `client/js/room-socket.js`: `game:moved` calls `RoomUI.updateUI()` only when `data.gameOver`.
- Audio nodes per move (item 3 of Problem) not touched: not in Scope; ~1 ms/move in profile.
## Verification
- `client/tests/board-incremental-draw.test.js` (24): 16 looks (paper/stone × edge/cell × numbers ×
  last-move) — patched markup === full redraw after each of 8 moves incl. stones placed before
  earlier ones, `_draw` not called by setState; node identity kept; 6 fallback cases.
- `game-move-ack-retry-resync.test.js`: normal move → no `updateUI`, game-ending move → one.
- `npm test` 3880 pass. `tools/perf/harness.js` 20×20, 160 moves, 4× CPU, 390 px, move numbers on,
  baseline = dev worktree: stone late-20 `game:moved` p50 11.6 → 5.1 ms (all-moves avg 9.3 → 4.2);
  paper 9.4 → 4.7 ms. `_draw`/`updateUI` gone from the per-move path.
- Not done: real-phone pass (todo "Done when").
