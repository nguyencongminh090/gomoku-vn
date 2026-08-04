# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #15: small usability request — on hover, highlight the corresponding row/column coordinate labels (e.g. hovering H8 should light up the "H" column letter and "8" row number), so a player can read off their cursor's cell without hunting across two axes.

## Action

In `_drawCoordinates()` in [client/js/board.js](client/js/board.js), read `this._hoverCell` once at the top of the function and, for each column-letter/row-number `fillText` call, set `ctx.fillStyle` per-iteration: the existing muted style if the label's index doesn't match the hover cell's `x`/`y`, or `rgb(${this._theme.highlightRgb})` — the same amber/gold token added in Fix #14 — if it does. No new theme token, no new state: reused the already-tracked `_hoverCell` (set in `_onMouseMove`/cleared in `_onMouseLeave`) and the highlight color Fix #14 already proved out for contrast.

## Decision

Reused Fix #14's `--board-highlight-rgb` rather than introducing a second accent color, since a coordinate label and the last-move marker are both "look here" cues and giving them different hues would dilute what the color means. Applied it as a full-opacity solid fill (not a translucent one) because text at small sizes needs the contrast more than a highlight box does — a translucent version would reintroduce the exact low-contrast problem Fix #14 just fixed. Left the underlying loop structure and per-mode (`stone` vs. `paper`/`caro`) label positioning untouched — only the fill-color decision changed per iteration, so no layout or geometry code was touched.

## Summary output

Verified by directly setting `_hoverCell = {x:7, y:7}` on a live `BoardRenderer` instance in the Playwright harness (bypassing real mouse simulation, which requires `interactive`/`isMyTurn` true) and redrawing — equivalent to a real hover at column H (index 7), row 8 (index 7). Both themes: exactly one column letter ("H") and one row number ("8") render in amber while every other label stays in its normal muted color; moving the hover cell and clearing it (`_hoverCell = null`) were spot-checked to confirm the highlight tracks and disappears correctly. Screenshots: [docs/screenshots/fix15-hover-coord-light.png](docs/screenshots/fix15-hover-coord-light.png), [docs/screenshots/fix15-hover-coord-dark.png](docs/screenshots/fix15-hover-coord-dark.png).
