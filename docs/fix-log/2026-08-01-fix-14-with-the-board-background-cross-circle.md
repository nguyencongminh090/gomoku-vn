# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #14: with the board background, cross/circle symbols, and wall tiles locked (Fix #8–#13), user reported the cell highlight is too light and sometimes goes unnoticed — asked for yellow or another high-contrast color.

## Action

Scoped the fix to `_drawLastMoveHighlight()` in [client/js/board.js](client/js/board.js) — the persistent last-move cue, as opposed to `_drawHoverHighlight()` (transient, under the player's own cursor), `_drawWinHighlight()` (once per game), or `_drawPendingHighlight()` (already has an opaque-ish stroke) — since that's the marker a player actually relies on to notice the opponent's move. Added `--board-highlight-rgb: 200, 110, 0` to both theme blocks in [client/css/main.css](client/css/main.css), wired it into `_readBoardTheme()`, and rewrote the highlight draw call to paint a `rgba(highlightRgb, 0.28)` fill plus a solid `rgb(highlightRgb)` border (`lineWidth` scaled to cell size) around the same rounded-rect path that previously only had a flat `rgba(accentRgb, 0.15)` fill and no border.

## Decision

Measured the *old* fill first to confirm the complaint before touching anything: `rgba(accentRgb, 0.15)` over `#F7F7F7` computes to ~1.29:1 — essentially invisible, which matches "sometimes not notice." A literal bright yellow (`#FFC107`) used as a solid color only reaches ~1.5:1 against this near-white background, because yellow's inherent luminance sits close to a near-white bg's luminance regardless of hue — hitting 3:1 with a pure yellow would require darkening it into an olive/mustard that no longer reads as "yellow." Resolved this by splitting the highlight into two layers, matching the pattern the hover/pending highlights already use: a translucent fill for visual "pop" (not held to a standalone contrast bar, same treatment as the existing hover/pending fills) and a solid, fully-opaque border in a deeper gold/amber (`rgb(200,110,0)`) that does the contrast work. Kept one flat color for both themes rather than a light/dark pair, following the same precedent as the circle color in Fix #10, since it independently cleared the 3:1 bar against both locked backgrounds. Confirmed none of the six locked tokens (`--board-bg`, `--board-ink-rgb`, the circle's `rgb(255,29,35)` stroke, the four `--board-wall-*-rgb` tokens, `--board-accent-rgb`) were touched — grep-checked every remaining `accentRgb` / `pendingRgb` / hardcoded win-highlight reference in board.js after the edit to verify hover, win, and pending highlights are byte-identical to before.

## Summary output

Re-ran the Playwright harness in both themes with a last-move cell set. Light: solid amber-gold border with a warm translucent fill, immediately visible against the `#F7F7F7` board — no longer blends in. Dark: same amber border reads even more strongly against `#262626`. Computed WCAG contrast for the border (opaque, the graphical element the 3:1 target applies to): light theme 3.45:1, dark theme 4.10:1 — both clear the non-text minimum, versus the old fill's ~1.29:1. Screenshots: [docs/screenshots/fix14-highlight-light.png](docs/screenshots/fix14-highlight-light.png), [docs/screenshots/fix14-highlight-dark.png](docs/screenshots/fix14-highlight-dark.png).
