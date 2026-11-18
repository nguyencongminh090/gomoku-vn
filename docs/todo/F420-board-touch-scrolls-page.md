# F420 — Board: one-finger drag on the board scrolls the page
**Status:** ✅ DONE 2026-11-18 — jsdom tests; real-phone check open
**Area:** client/js/board.js (touch handlers, _applyView), client/css/game.css, room-arena.css, tournament.css
**From:** user 2026-11-18 "Allow scroll on board to scroll page (currently, it is blocked)"

## Problem
`.gboard` had `touch-action: none` (CSS + inline), so a swipe starting on the board never scrolled the page.
## Scope
1. Full-size board: `touch-action: pan-x pan-y` — browser scrolls the page; page pinch-zoom / double-tap zoom stay off.
2. Pinch (2 touches) and any drag on a zoomed board (#400) stay the board's: non-passive touchmove → preventDefault; zoomed → `touch-action: none`.
3. A drag ≥10 px or a pointercancel (browser took the scroll) is not a tap: no stone, no double-tap reset.
## Don't
- Don't drop #104: a real tap still preventDefaults its touchend (only skipped when non-cancelable after a scroll).
## Traps
- touch-action is read at touchstart: switching it in _applyView affects the next gesture only.
