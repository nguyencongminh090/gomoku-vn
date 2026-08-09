# Fix log entry — 2026-08-08 15:12

## Prompt

User request, follow-up to Fix #21 (stone-mode kaya-wood board redesign): "lock black/white/background/line. calculate for lines equations to find color for bricks." — keep the stone/black/white stones, wood background, and grid lines exactly as they are; only derive new colors for the wall ("brick") tiles, which were still using the old cool-gray palette borrowed from paper mode's theme variables and clashed against the warm wood board (visible in a screenshot as flat gray blocks on the tan/gold board).

## Action

[client/js/board.js](client/js/board.js) `_drawWall()`: added a stone-mode-only branch (`isStone = this.displayMode === 'stone'`) that overrides `BLOCK_MORTAR`/`BLOCK_DARK`/`BLOCK_BASE`/`BLOCK_LIGHT` with four fixed hex colors instead of reading the theme-driven `--board-wall-*-rgb` CSS custom properties. Paper/caro mode is untouched — it still reads the theme vars exactly as before. No change to `_drawBackground`, grid-line stroke color, `_drawStonePiece`, `_drawBlackPiece`, or `_drawWhitePiece` (the locked pieces).

Also carried the mandatory `?v=` cache-bust bump (`?v=82` → `?v=83`) across every `client/*.html` and `client/js/*.js` import site.

## Decision

Solved the same way the wood tone itself was (Fix #21): WCAG contrast formula `(L1+0.05)/(L2+0.05)`, anchored to the *locked* board background's relative luminance (`#b58a40` → `L_board = 0.2837`). For each brick tone, `contrast(L_board, L_x) = C` was solved directly for `L_x`:

| Tone | Direction | Target C | Solved L | Hex (hue 28°, sat 10%) | Contrast vs board |
|---|---|---|---|---|---|
| mortar (grout) | darker | 4.5:1 | 0.0242 | `#2f2a26` | 4.51:1 |
| dark (brick shadow) | darker | 3.8:1 | 0.0378 | `#3b3631` | 3.80:1 |
| base (brick body) | darker | 3.0:1 | 0.0612 | `#4c453e` | 3.00:1 |
| light (brick highlight) | lighter | 1.8:1 | 0.5507 | `#c9c3bd` | 1.80:1 |

Hue 28° was chosen deliberately close to (but distinct from) the board's own 38° hue and heavily desaturated (10% vs the board's 48%) — a warm-neutral "weathered stone" rather than the old cool industrial gray, so the walls read as belonging to the same wood-board world while the WCAG-solved contrast steps keep them clearly legible as obstacles against the stones.

## Summary output

`node --check client/js/board.js` passed. No client-side unit tests exist for `client/js/` (no test infrastructure there, per project convention) — verified by contrast math + syntax check only; user should confirm visually in the browser. This fix branched off `dev` and merges back to `dev` (not `main`) because some touched files — `tournament-match.html`, `tournament-match-entry.js`, `tournament-detail-entry.js`, `tournaments.js` — only exist on `dev` (unmerged tournament feature work), so branching off `main` would have nothing to fix for those files.
