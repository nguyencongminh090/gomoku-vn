# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #19: user asked to try a vivid, fully-saturated green — `#00FF44` — as the highlight, flat across both themes.

## Action

Changed `--board-highlight-rgb` in both theme blocks of [client/css/main.css](client/css/main.css) from Fix #18's `163, 255, 188` to `0, 255, 68`, and updated the fallback in `_readBoardTheme()` in [client/js/board.js](client/js/board.js) to match. No other change.

## Decision

Computed contrast before applying, same as every prior highlight-color pass: opaque `#00FF44` measures ~1.27:1 against the light-theme `#F7F7F7` board — numerically close to Fix #18's failing ~1.1:1, because the luminance formula weights green heavily (0.7152) and a maxed-green channel still lands close to a near-white background's luminance regardless of how saturated the color is. | Screenshotted anyway rather than rejecting it on the math alone, since Fix #18 already showed WCAG's luminance-only formula can understate real visibility for a saturated color against a *neutral* (zero-saturation) background — a human eye also picks up on chroma/hue difference, which the contrast ratio doesn't measure. That held here too: unlike the desaturated pale mint from Fix #18, this fully-saturated green visibly pops against the neutral gray board in the screenshot despite a similar computed ratio, because saturation itself is now doing perceptual work the luminance number can't see.

## Summary output

Playwright screenshots in both themes: light theme shows a clearly visible saturated-green cell, a noticeable improvement over Fix #18's near-invisible pale mint at a similar computed contrast; dark theme is excellent (~11:1). Screenshots: [docs/screenshots/fix19-highlight-vividgreen-light.png](docs/screenshots/fix19-highlight-vividgreen-light.png), [docs/screenshots/fix19-highlight-vividgreen-dark.png](docs/screenshots/fix19-highlight-vividgreen-dark.png).
