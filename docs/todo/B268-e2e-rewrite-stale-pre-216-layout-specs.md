# B268 — e2e: rewrite 10 layout specs written for the pre-#216 room UI
**Status:** OPEN
**Area:** `e2e/{drawer-rail-not-displaced,start-modal-board-centering,topnav-minimal-mobile,strip-clock-mobile,slot-card-stand-inline-touch-target}.spec.ts`
**From:** #267 full e2e run, 2026-10-17   **Depends:** #267 (helpers `board.ts`, `actions.ts`, `goto('#rooms')`)

## Problem
After #267 these still fail, past room creation, on assertions about the old layout (Arena Focus redesign
#216/#217/#218 replaced it): zen drawer + icon rail, bottom sheet, `#players-strip`, `#turn-bar`, topnav,
✕ stand button < 32 px (now 32). Nothing here is a product bug; the specs measure UI that no longer exists.

## Scope
1. Per spec, read the CURRENT markup (`client/room.html`, `room-ui.js`, `.seatcard*`) and decide: rewrite the
   invariant for the new layout, or delete if the invariant no longer applies. Record each decision.
2. Failing: drawer-rail (2), start-modal-board-centering (4: desktop/mobile × open/collapsed),
   topnav-minimal-mobile (2: Pixel 5, iPhone SE), strip-clock-mobile (1), slot-card-stand (1).
3. Full run after; update `e2e/README.md` "Known state" and `TEST-MATRIX.md` rows.

## Don't
- Don't bend the UI to satisfy a test. Don't loosen a threshold (e.g. 32 px) without the design reason.

## Traps
- Phone layout invariants live in memory/`platform-direction` (#216-#218); read before deciding what to keep.
- Start-modal and topnav specs also run mobile viewports: check them in a real browser, not only by selector.

## Done when
- The 10 specs pass (or are removed with a stated reason) in a full Chromium run; README/TEST-MATRIX updated.
