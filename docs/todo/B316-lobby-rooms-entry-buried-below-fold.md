# B316 — Lobby home: "Xem phòng đang mở" is 3 screens down on mobile
**Status:** CLOSED — by design (2026-10-22): quick-match chips (rule/time) are used often, so no collapse and no extra shortcut buttons (both tried, rejected: broke the quick-match layout / unnecessary). Rooms entry stays in "Ván đang chơi". No code change.
**Area:** client/index.html (home section order), client/css/lobby*.css, client/js/lobby-home.js
**From:** ux-audit lobby mobile M2 (first-time-user lens), 2026-10-22   **Depends:** —

## Problem
At 375×812 the button sits at y≈1148 inside "Ván đang chơi", below the whole quick-match
customiser (~12 chips). Bottom nav has no Rooms entry. A user who wants to join a friend's room
(or Vào bằng mã) must scroll past all settings. Evidence: `docs/audits/2026-10-22/01-lobby-375-full.png`.
## Scope
1. Put a compact "Xem phòng / Vào bằng mã" row directly under the quick-match card (or collapse "Tuỳ chỉnh" by default).
2. Keep desktop layout unchanged.
3. Mobile real-browser pass at 320/375/414 + screenshot before/after.
## Don't
- Don't remove the "Ván đang chơi" empty-state CTA; don't touch the quick-match logic.
## Why this way
Cheapest fix that shortens the path to rooms. Rejected: new bottom-nav tab (5 tabs already fill 375px).
Knowledge: `docs/knowledge/ui-ux/INDEX.md` (mobile hierarchy) — check before design.
## Done when
- Rooms entry visible without scrolling past the chips at 375×812.
- jsdom/layout assertion where possible; `npm test` green; cache-bust OK.
