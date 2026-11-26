# B485 — Room chat input hidden under the iPhone keyboard bars
**Status:** ✅ CLOSED 2026-11-26 — deployed (9795a6df, PR #37); closed on user request
**Area:** client/js/room.js, client/css/room-arena.css
**From:** user screenshot (iOS 26 Safari), 2026-11-26   **Depends:** —

## Problem
Keyboard up: chat input sits under the floating ^ v ✓ bar and URL pill.
## Scope
1. room.html phone layout only.
## Don't
- Don't change the Android path (the lift is gated to iOS UAs).
## Traps
- IOS_FLOATING_BAR = 96 comes from one screenshot; tune from a device screenshot (gap too big / still covered).
- iOS Chrome/Firefox/in-app UAs have no Version/ token, so they get the 96px too (worst case: a gap).
- Same dock on tournament-match.html has no keyboard handling at all (not reported, not tested): ask before doing.
## Why this way
Measured lift is independent of how far iOS pans the viewport.
## Done when
- On a real iPhone the input and send button are fully visible while typing, and the layout restores after ✓.
