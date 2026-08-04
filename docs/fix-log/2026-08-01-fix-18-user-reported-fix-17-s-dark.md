# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #18: user reported Fix #17's dark forest-green highlight still read as low-contrast/murky in a screenshot, and gave an explicit replacement hex — `#A3FFBC` (pale mint) — for both themes.

## Action

Changed `--board-highlight-rgb` in both theme blocks of [client/css/main.css](client/css/main.css) from the theme-varying Fix #17 values (`20,83,45` light / `134,239,172` dark) to a single flat `163, 255, 188` in both, and updated the fallback in `_readBoardTheme()` in [client/js/board.js](client/js/board.js) to match. No draw-function changes — fill-only rendering from Fix #16 reused as-is.

## Decision

Computed contrast before applying: `#A3FFBC` measures only ~1.1:1 opaque against `#F7F7F7`, i.e. mathematically lower than the forest-green value it was replacing (2.26:1), because this color's own brightness sits too close to the near-white board's brightness — no fill-opacity adjustment can fix that, it's a property of the color itself. Screenshotted both themes to check whether real-world visibility matched the math or beat it via chromatic (hue) contrast against the neutral-gray board — it matched: dark theme reads clearly, light theme's highlighted cell is close to indistinguishable from the board. Presented this finding plus three concrete remedies (border-in-light-only, theme-split with a less extreme mint, or ship as specified); user chose to ship the color exactly as given and evaluate it themselves rather than have it adjusted further.

## Summary output

Re-ran the Playwright harness in both themes. Dark: mint fill clearly visible against `#262626`, consistent with Fix #17's dark-theme result. Light: fill renders but is faint, matching the ~1.1:1 computed contrast — flagged to the user as a known, accepted trade rather than a silent regression. Screenshots: [docs/screenshots/fix18-highlight-mint-light.png](docs/screenshots/fix18-highlight-mint-light.png), [docs/screenshots/fix18-highlight-mint-dark.png](docs/screenshots/fix18-highlight-mint-dark.png).
