# F400 — Pinch-zoom the board on phones
**Status:** ✅ DONE 2026-11-16 — user confirmed on real phone; merged dev 5d6e183
**Area:** client/js/board.js, client/tests/board-pinch-zoom.test.js
**From:** user request 2026-11-16   **Depends:** —

## Problem
No way to enlarge the board on a phone; page zoom would scale the whole layout.
## Scope
1. Two-finger pinch zooms ONLY the SVG viewBox (1x–4x), anchored at the fingers' midpoint.
2. One-finger drag pans while zoomed (8px threshold keeps taps as taps).
3. Double-tap resets to 1x. No +/- buttons (user decision).
## Don't
- No zoom buttons; no page/viewport zoom changes; mouse/desktop untouched.
## Traps
- Double-tap on an empty cell in my turn = move confirm (clickMode double) → wins over reset. Reset works on stones/off-grid/spectator/not-my-turn.
- touchend of a pinch/pan must not place a stone (`_gesture` flag, cleared when last finger lifts).
- Hit-testing must use `_view()`, not base geo.
## Done when
- jsdom test green (done); real-phone pass pending.
