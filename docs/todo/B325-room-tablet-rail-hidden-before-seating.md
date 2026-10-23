# B325 — Room at 769–1024 px: rail is hidden before you sit, so a new player cannot sit, chat or see clocks
**Status:** FIXED
**Area:** client/css/room-arena.css (~l.273-283 `.rail-collapsed` rules), client/js/room.js:257-269 (B284 default)
**From:** ux-audit room.html, 2026-10-23 (`docs/audits/ux-audit-2026-10-23-room.md` H1, evidence `docs/audits/2026-10-23-room/40-1024-presit.png`)   **Depends:** —

## Problem
At 1024×768 with no saved choice, B284 starts the rail collapsed. Before you hold a seat, `#rail` is `visibility:hidden`, so `.seatcard__sit` ("Ngồi vào · #1") is not clickable (Playwright: "element is not visible"); only a 20×80 px unlabeled chevron (`#rail-dock-toggle`) at the right edge reopens it. At 1280 the seats show.
## Scope
1. Extend the seated exemption `.rail:has(#game-controls:not(:empty))` to `:has(#game-controls:not(:empty), .seatcard__sit)` and mirror it on the `.room` padding + `.rail-dock-toggle` offset rules next to it.
2. Real-browser check at 769, 900, 1024, 1025: empty room, both seated, game over (seat button disappears → rail collapses again).
3. jsdom/CSS test if the rule can be asserted; otherwise state it is browser-only.
## Don't
- Don't revert B284 (board keeps the focus once you are playing).
- Don't change the 1025+ layout or the phone layout.
## Traps
- The exempted rail shrinks to `bottom:auto`, `.rpanel > :not(.gtoasts)` hidden: confirm the seat buttons are in the seatcards (not hidden) and chat is still reachable via the chevron.
## Why this way
Smallest change reusing the existing seated exemption; rejected: auto-expanding via JS (flicker, overrides a stored choice). Knowledge: none.
## Done when
- At 1024×768 a fresh guest can click a seat without touching the chevron.
- Rule-4 cache-bust run, `npm test` green, real-browser pass logged in fix-log.
