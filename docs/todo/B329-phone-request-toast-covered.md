# B329 — Phone: draw/undo/time request toast is covered by the chat bar
**Status:** ✅ FIXED 2026-10-23 (merged to dev 5720a57)
**Area:** client/css/room-arena.css (phone block), client/tests/room-arena-layout.test.js
**From:** user "Draw offer,... on phone is covered", 2026-10-23   **Depends:** #216, #217

## Problem
Minimized phone panel is 93px tall (`--minbar-h`); `.gtoasts` is `absolute; top:52px` so a 58px toast hangs off the panel bottom (iPhone 13 390×664): covers the chat bar, ✓/✕ clipped by `overflow:clip`.
## Scope
1. `.rpanel--min .gtoasts { position: static }` — in flow, panel grows by the toast.
## Don't
- Touch the expanded state (toast over the tab strip works there) or desktop.
## Done when
- Browser pass 390×664: ✓/✕ fully visible, tiles/board untouched; jsdom CSS test.
