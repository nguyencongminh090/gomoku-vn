# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #12: user gave a third light-theme spec — near-white cyan-tinted background `#DBFDFF`, saturated blue `#2962FF` cross, saturated red `#FF1D23` circle — replacing Fix #11's gray/sky-blue/coral set.

## Action

Changed light-theme `--board-bg` to `#DBFDFF` and `--board-ink-rgb` to `41, 98, 255` in [client/css/main.css](client/css/main.css); updated the matching fallbacks in `_readBoardTheme()` in [client/js/board.js](client/js/board.js). Replaced the flat `rgb(225, 60, 60)` circle stroke (used in both `_drawWhitePiece()` and `_drawPendingHighlight()`) with `rgb(255, 29, 35)`. `--board-accent-rgb` (grid/border/star/coordinates) and the wall tokens were left untouched — the user specified background and pieces only.

## Decision

Re-checked those untouched tokens against the new, notably brighter background (`#DBFDFF` relative luminance 0.93 vs. Fix #11's `#D9D9D9` at 0.69) rather than assuming they still applied — a brighter bg only increases headroom for a fixed-luminance accent/wall color, so both stayed safe (grid/coordinate contrast rose from ~4.2:1 to ~6.6:1; wall anchor tile rose from 4.50:1 to ~5.75:1), confirming no compensating edit was needed. Kept the dark theme's `--board-bg`/`--board-ink-rgb` (Fix #10's `#262626`/blue-300) unchanged since the user's values were given without a dark counterpart, same interpretation used in Fix #10 and #11. The circle color is still a single flat value shared by both themes (established in Fix #10) rather than split per-theme, since it passed the contrast check in both.

## Summary output

Re-ran the Playwright harness against both themes. Light: near-white cyan background, vivid blue X, vivid red O, matching the reference screenshot's palette. Dark: unchanged from Fix #11 (deep charcoal bg, pale sky-blue X), same vivid red O. Computed WCAG contrast: light theme — bg vs. cross ink 4.55:1, bg vs. circle 3.58:1, bg vs. coordinate label ~6.6:1, bg vs. wall-dark anchor tile ~5.75:1; dark theme — bg vs. circle 3.93:1 (cross/coordinate/wall values unchanged from Fix #10/11). Cross ink clears WCAG AA 4.5:1 in light theme; circle clears the 3:1 graphical/non-text minimum in both themes. Screenshots: [docs/screenshots/fix12-board-light.png](docs/screenshots/fix12-board-light.png), [docs/screenshots/fix12-board-dark.png](docs/screenshots/fix12-board-dark.png).
