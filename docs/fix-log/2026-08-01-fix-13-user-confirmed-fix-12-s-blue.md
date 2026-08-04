# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #13: user confirmed Fix #12's blue cross and red circle but said the `#DBFDFF` background read as too cyan-tinted — wanted a very light, near-white neutral instead.

## Action

Changed light-theme `--board-bg` from `#DBFDFF` to `#F7F7F7` in [client/css/main.css](client/css/main.css) and updated the matching fallback in `_readBoardTheme()` in [client/js/board.js](client/js/board.js). No other token touched.

## Decision

`#F7F7F7` is a true neutral (R=G=B) rather than a tinted near-white, which is what removes the cyan cast the user flagged. Picked its exact lightness, rather than going all the way to pure `#FFFFFF`, by solving for the point where the existing `#2962FF` cross ink still clears 4.5:1 — `#FFFFFF` would have pushed contrast comfortably higher but there was no reason to go brighter than necessary once the cyan tint was gone; `#F5F5F5` came in at 4.49:1, just under the target, so `#F7F7F7` (4.57:1) was used instead as the closest safely-passing neutral.

## Summary output

Re-ran the Playwright harness in light theme only (dark theme untouched). Background now renders as a flat neutral near-white with no visible cyan cast; blue cross and red circle unchanged and still legible. Computed WCAG contrast against the new bg: cross ink 4.57:1 (up marginally from Fix #12's 4.55:1), circle 3.60:1 (up from 3.58:1) — both stayed clear of their respective thresholds since the luminance shift from `#DBFDFF` (0.9255) to `#F7F7F7` (0.9300) was negligible; only the hue changed. Screenshot: [docs/screenshots/fix13-board-light.png](docs/screenshots/fix13-board-light.png).
