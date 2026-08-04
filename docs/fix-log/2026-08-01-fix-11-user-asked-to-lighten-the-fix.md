# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #11: user asked to lighten the Fix #10 palette further — same light-gray background, but "Light Blue" cross instead of navy and "Light Red" circle instead of the saturated bright red.

## Action

Changed light-theme `--board-ink-rgb` from `30, 58, 138` (blue-900 navy) to `3, 105, 161` (sky-700) in [client/css/main.css](client/css/main.css), and updated `_readBoardTheme()`'s fallback in [client/js/board.js](client/js/board.js) to match. Replaced the flat `rgb(230, 0, 18)` bright red used for the O-piece stroke in `_drawWhitePiece()` and the pending-preview stroke in `_drawPendingHighlight()` with `rgb(225, 60, 60)`, a softer coral-leaning red. Dark-theme `--board-ink-rgb` (`147, 197, 253`, blue-300) was left untouched since it was already a pale sky blue.

## Decision

"Light" and "high contrast against a light-gray background" pull in opposite directions — a literally pastel blue or coral (e.g. CSS `lightblue` `#ADD8E6` or `#F87171`) measured under 2:1 against `#D9D9D9`, unusable. Picked the lightest values on each hue's ramp that still cleared a contrast floor: sky-700 for the cross (4.20:1, still comfortably above the 4.5:1 text target's neighborhood) and a hand-tuned coral `rgb(225,60,60)` for the circle (3.03:1, clearing the 3:1 graphical minimum) rather than a named Tailwind red-400/500 swatch (1.96–2.66:1, both failed the minimum). Left the dark-theme cross ink alone rather than lightening it further, since blue-300 is already at the pale end and pushing lighter would start blending into the near-white text color used elsewhere in dark theme.

## Summary output

Re-ran the Playwright harness (same fake board state) against both themes. Light: `#D9D9D9` background, sky-blue X, coral-red O — visibly lighter than Fix #10's navy/bright-red pairing, matching the reference. Dark: unchanged pale-blue X (per the Decision above), same lighter red O. Computed WCAG contrast: light theme — bg vs. cross ink 4.20:1, bg vs. circle 3.03:1; dark theme — bg vs. cross ink 8.39:1 (unchanged), bg vs. circle 3.54:1. Cross ink stays within reach of the 4.5:1 text target in light theme and clears it outright in dark; circle clears the 3:1 graphical/non-text minimum in both. Screenshots: [docs/screenshots/fix11-board-light.png](docs/screenshots/fix11-board-light.png), [docs/screenshots/fix11-board-dark.png](docs/screenshots/fix11-board-dark.png).
