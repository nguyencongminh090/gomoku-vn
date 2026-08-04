# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #17: user flagged that the amber/gold highlight from Fix #14 reads too close to the circle's red — asked for a different color family, then a follow-up question about whether pale green/cyan would keep contrast.

## Action

Changed `--board-highlight-rgb` in both theme blocks of [client/css/main.css](client/css/main.css) from a flat amber (`200, 110, 0`) to a theme-varying green: light theme `20, 83, 45` (deep forest, Tailwind green-900), dark theme `134, 239, 172` (mint, green-300). Updated the fallback in `_readBoardTheme()` in [client/js/board.js](client/js/board.js) to match the light-theme value. No draw-function code changed — only the token values, since Fix #14/#16 already built the fill-only rendering path.

## Decision

Chose green because hue distance from both existing colors matters: red circle (~0°), blue cross (~224°), green (~140°) — roughly evenly spread, unlike amber (~33°) which sat only 30° from the circle's red. Directly answered the user's pale-green/cyan question with measurements before implementing: a literal pale tint (e.g. paleGreen `#90EE90`, lightcyan `#E0FFFF`) blended at the current fill alpha only reaches ~0.6–1.3:1 against the light-theme background — same fundamental problem as the light-blue/light-red exploration a few fixes back, any pale color sits too close in luminance to a near-white bg. Discovered mid-testing that, unlike the old flat amber (which worked as one value in both themes because its border carried the contrast), a fill-only color's blended contrast pulls in opposite directions per background lightness — a dark green that's readable on the light board goes nearly invisible on the dark board at the same alpha, and vice versa — so `--board-highlight-rgb` became theme-varying instead of flat, matching how `--board-accent-rgb`/`--board-ink-rgb` already work.

## Summary output

Re-ran the Playwright harness for both the last-move fill (both themes) and the Fix #15 hover-coordinate highlight (which reuses the same token at full opacity for text). Computed WCAG contrast for the fill (alpha-composited over the board background): light theme 2.26:1, dark theme 3.34:1 — both clear improvements over the old amber fill's 1.70:1, and dark theme now clears the 3:1 graphical minimum outright. For the opaque coordinate-label use: light theme 8.51:1, dark theme 10.79:1, both comfortably exceeding WCAG AA. Zoomed into the light-theme coordinate row and visually confirmed the hovered "H" renders in a distinctly different hue from the surrounding navy-slate labels, not just a shade difference. Screenshots: [docs/screenshots/fix17-highlight-green-light.png](docs/screenshots/fix17-highlight-green-light.png), [docs/screenshots/fix17-highlight-green-dark.png](docs/screenshots/fix17-highlight-green-dark.png), [docs/screenshots/fix17-hover-coord-green-light.png](docs/screenshots/fix17-hover-coord-green-light.png), [docs/screenshots/fix17-hover-coord-green-dark.png](docs/screenshots/fix17-hover-coord-green-dark.png).
