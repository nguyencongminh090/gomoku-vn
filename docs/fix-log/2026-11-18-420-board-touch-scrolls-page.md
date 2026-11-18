# 2026-11-18 — #420 board touch scrolls the page
**Cause:** `touch-action: none` on `.gboard` (board.js inline + game.css/room-arena.css/tournament.css) since #104/#400; every touch on the board was owned by the board.
**Fix:** full-size board uses `pan-x pan-y`; `_applyView` sets `none` while zoomed and back on reset. New non-passive `touchmove` cancels 2-finger moves and zoomed drags (pinch-zoom #400 intact). `touchstart`/`touchmove` mark a ≥10 px one-finger drag, and `pointercancel` marks a browser scroll → `_onTouchEnd` places nothing. touchend preventDefault (#104) now skipped only when `cancelable === false`.
**Tests:** client/tests/board-touch-scroll-page.test.js (6); board-pinch-zoom + #104 suites unchanged and green; full npm test 4361 green.
**Unverified:** real phone (iOS Safari / Android Chrome) scroll feel, and pinch starting after the first finger already scrolled (browser keeps the scroll — accepted).
