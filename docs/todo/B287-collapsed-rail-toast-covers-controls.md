# B287 — Collapsed in-game rail: a pending request toast covers the action tiles
**Status:** FIXED 2026-10-18 (uncommitted) — real-browser VERIFIED: collapsed live game + pending draw offer shows toast (y146) and the four tiles (y~226) together; evidence docs/audits/2026-10-18/14-live-collapsed-draw-offer.png
**Area:** client/css/room-arena.css (`.rail-collapsed .rail:has(#game-controls:not(:empty)) .gtoasts`)
**From:** real-browser verify of #283, 2026-10-18 (`docs/audits/2026-10-18/14-live-collapsed-draw-offer.png`)   **Depends:** B283

## Problem
Collapsed + seated in a live game, an opponent request shows its toast at the top of the zero-height `.rpanel`, absolutely positioned (y146–204) over `#game-controls` (y154–206). Lùi / Xin time / Cầu hoà / Đầu hàng are hidden until the offer is answered; resign is unreachable meanwhile.
## Scope
1. Make the toast take flow space in the collapsed state (e.g. `.gtoasts` static, `.rpanel` height auto when it has content) so controls shift down instead of being covered.
2. Re-run the live check: offer pending → toast + controls both visible.
## Don't
- Don't change the open-rail toast placement or phones.
## Done when
- In the collapsed live state a draw/undo/time toast and the four tiles are visible together; jsdom CSS-contract test updated; ?v= bumped.
