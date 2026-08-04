# Fix log entry — 2026-08-04 13:45

## Prompt

Fix #21: multi-step user request over one session, refining stone-mode board visuals:
1. "Board -> Stone style. Keep Black & White color. Change the color of board more dark. Apply WSAP [WCAG] color theory to calculate contrast. Apply System of linear equations to find best color."
2. "What about try medium constrast? The current one is not good for eye (seem too dark)" / "Hơi chói mắt vì màu đục."
3. "'line' on board looks not good... calculate for lines color, board color. List options, choose the one fit site theme." → after being shown 4 computed options, user redirected: "Try wooden GO board, A bit orange, Yellow, ... Or even try Wood Texure."
4. "What about no gradient on texure?"
5. "Reverse Y-col (1-15) -> 1 bottom 15 top."

## Action

All changes in [client/js/board.js](client/js/board.js) (stone-mode background/grid/coordinates) and [client/js/move-tree.js](client/js/move-tree.js) (move-notation labels), plus the mandatory `?v=` cache-bust bump across all `client/*.html` and `client/js/*-entry.js` files (v43 → v49 over the session).

- **Background color** (`_drawBackground`, stone-mode branch): pale cream (`#F9F7F3`→`#EBE6DC`) → dark walnut gradient → lighter medium-contrast tan gradient → final: a flat kaya-wood gold/amber `#b58a40` base (no gradient) painted with a cached, deterministically-seeded wood-grain texture (`_buildWoodTexture`/`_getWoodTexture`, new methods).
- **Grid lines**: `rgba(0,0,0,0.15)` (invisible on the new dark bg) → `rgba(255,255,255,0.22)` → final: dark ink brown `rgba(34,28,17,0.55)`, matching a real goban's lacquered lines instead of a generic app-chrome border token.
- **Row-number labels** (`_drawCoordinates`): were `String(y + 1)` (row 1 at top, top-down). Changed to `String(g.boardSize - y)` so row 1 renders at the bottom and the highest number at the top — standard Go/Gomoku board convention. Internal `y` (0-based, top-down, used for board-state indexing and click mapping) is untouched.
- **Move notation labels** (`move-tree.js`, found via a follow-up Explore-agent sweep for other top-down row displays): `coordToLabel(x, y)` used `y + 1` too, feeding the "H8"-style labels in the history/replay tree view (`tree-view.js`). Added a `boardSize` param (`row = boardSize - y`), threaded through `MoveNode`/`MoveTree` via parent-chain inheritance (root gets it from the tree; `addMove`/`fromJSON` children inherit from parent) so no call site needed to change.

## Decision

Every color pass was solved from the WCAG relative-luminance contrast formula `(L1+0.05)/(L2+0.05)`, not picked by eye first:
- **Darkest pass**: solved `(L+0.05)/0.05 = 1.05/(L+0.05)` for the fixed point where contrast-vs-black equals contrast-vs-white → `L≈0.179`, contrast ≈4.58:1 to both. User found this too dark/muddy.
- **Medium-contrast pass**: re-solved holding only the *weaker* side (white stone, since a lighter board favors black-stone contrast) at the WCAG 1.4.11 graphical-object floor of 3:1 → `1.05/(L+0.05)=3.0 → L=0.30`, then searched HSL lightness at hue 32°/sat ~18-20% for a matching sRGB. This became the accepted "medium contrast" tan.
- **Wood-theme pass**: user explicitly asked for a warmer orange/yellow wood look with texture rather than a 4th flat-color option, so grid-line color selection (which had been offered as 4 WCAG-scored options: dark warm groove, app's dark/light `--c-border` tokens, light warm inlay) was superseded — re-solved the same medium-contrast floor at a warmer/more saturated hue (38°, 48% sat) instead, landing on `#b58a40`, then added a cached procedural grain texture (seeded PRNG, regenerated only on resize, not per-frame) rather than a static image asset.
- **No-gradient pass**: literal, dropped the linear-gradient wash, kept the same WCAG-solved `#b58a40` as a flat fill.
- **Row-number reversal**: display-only; deliberately did not touch `_cellToPixel`/`_pixelToCell`/board array indexing to avoid breaking click mapping or game state, and separately found + fixed the same convention mismatch in `move-tree.js`'s move-notation labels via a background Explore-agent sweep, since that's a second surface showing the same row numbers.

## Summary output

`node --check` passed on both changed files after each step. No client-side unit tests exist for `client/js/` (per project convention — no test infrastructure there), so this was verified by static contrast math + syntax checks only; the user should visually confirm the final wood board and reversed row numbers in the browser.
