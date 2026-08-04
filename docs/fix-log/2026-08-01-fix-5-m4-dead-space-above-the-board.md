# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #5 (M4): dead space above the board before a game starts — the pre-game turn bar is hidden with inline `style="visibility: hidden"`, which still reserves its full layout height as an empty strip on mobile.

## Action

Added `.turn-bar--hidden { display: none; }` to [client/css/game.css](client/css/game.css) and a `setTurnBarVisible(visible)` helper in [client/js/game-ui.js](client/js/game-ui.js) (exported on `GameUI`). The markup in `initBoard()` now ships the class instead of the inline style, and all four toggle sites — `initBoard()` pre-game, `initBoard()` in-game, `renderSwap2()`, and the opening-resolved branch in [client/js/room-socket.js](client/js/room-socket.js) — were switched from `style.visibility` to the helper.

## Decision

Centralised the toggle in one helper rather than editing four inline-style writes independently, because `display: none` (unlike `visibility: hidden`) changes the height budget that `resize()` in [client/js/board.js](client/js/board.js#L107-L170) reads via `turnBarEl.offsetHeight` — the helper schedules a `boardRenderer.resize()` on the next frame so the board is re-measured whenever the bar appears or disappears. `resize()` itself needed no change: it already guards with `|| 0`, and a zero-height bar simply means less height is subtracted, which is the correct budget when the bar isn't there.

## Summary output

Live check at 375px with two seated players readying up to start a real game. Pre-game: turn bar `display: none`, `offsetHeight` 0, no inline style, dead strip above the board down to 8px (from ~54px), canvas still square and non-degenerate at 375×375. In-game: bar returns at `display: flex`, `offsetHeight` 44px, board re-measured and still square. Screenshots: [docs/screenshots/fix5-pregame-375.png](docs/screenshots/fix5-pregame-375.png), [docs/screenshots/fix5-ingame-375.png](docs/screenshots/fix5-ingame-375.png).
