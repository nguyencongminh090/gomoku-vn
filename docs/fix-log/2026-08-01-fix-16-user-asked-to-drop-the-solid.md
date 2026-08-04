# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #16: user asked to drop the solid border Fix #14 added to the last-move highlight, keeping fill only.

## Action

In `_drawLastMoveHighlight()` in [client/js/board.js](client/js/board.js), removed the `ctx.strokeStyle` / `ctx.lineWidth` / `ctx.stroke()` calls and raised the fill alpha from `0.28` to `0.45` on the same `rgba(${this._theme.highlightRgb}, …)` fill; no other highlight function or token touched.

## Decision

Fix #14's design note explained the border was carrying the WCAG contrast work specifically because a translucent fill alone couldn't reach 3:1 against the near-white board. Removing it on request reopens that gap, so alpha was raised from 0.28 to 0.45 to keep the marker reasonably visible without silently ignoring the ask — this is a partial mitigation, not a fix: a higher-alpha fill still can't match an opaque border's measurable contrast, so this is logged as a known, accepted trade a user explicitly chose over the Fix #14 look, not a regression to chase further unless flagged again.

## Summary output

Re-ran the Playwright harness in both themes. Light and dark: last-move cell renders as a plain rounded amber fill with no visible edge/outline, clearly distinguishable from the board background at the higher alpha, and the four other highlights (hover, win, pending, hover-coordinate from Fix #15) are unchanged. Screenshots: [docs/screenshots/fix16-highlight-fillonly-light.png](docs/screenshots/fix16-highlight-fillonly-light.png), [docs/screenshots/fix16-highlight-fillonly-dark.png](docs/screenshots/fix16-highlight-fillonly-dark.png).
