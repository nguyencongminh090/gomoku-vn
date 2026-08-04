# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #20: user asked to try a saturated yellow — `#FFEA00` — as the highlight, flat across both themes.

## Action

Changed `--board-highlight-rgb` in both theme blocks of [client/css/main.css](client/css/main.css) from Fix #19's `0, 255, 68` to `255, 234, 0`, and updated the fallback in `_readBoardTheme()` in [client/js/board.js](client/js/board.js) to match. No other change.

## Decision

Computed contrast first, consistent with every prior pass: opaque `#FFEA00` measures ~1.15:1 against the light-theme `#F7F7F7` board — the weakest luminance-only number of the green/yellow candidates tried so far, since yellow's mix of a maxed red channel and near-maxed green channel pushes its luminance close to a near-white background regardless of opacity. Applied and screenshotted anyway per the pattern established in Fix #18/#19: a saturated color's visibility against this specific neutral-gray board comes from chroma/hue difference, not the luminance ratio, so the number alone doesn't predict the outcome.

## Summary output

Playwright screenshots in both themes: light theme shows the clearest, most immediately noticeable highlight of all colors tried in this sequence (amber, mint, vivid green, now yellow) despite having the lowest computed contrast ratio of the four — confirming this board's fill-only highlight is fundamentally a saturation/chroma-contrast problem, not a luminance-contrast one. Dark theme: excellent, high-contrast yellow-on-charcoal. Screenshots: [docs/screenshots/fix20-highlight-yellow-light.png](docs/screenshots/fix20-highlight-yellow-light.png), [docs/screenshots/fix20-highlight-yellow-dark.png](docs/screenshots/fix20-highlight-yellow-dark.png).
