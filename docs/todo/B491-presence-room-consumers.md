# B491 — Presence consumer: room seats + spectators (PS-6)
**Status:** OPEN
**Area:** client/js/room-ui.js, client/css/room.css
**From:** features/presence-status (planning tone table, Q8 A), 2026-11-27   **Depends:** #488
## Scope
1. `playerStatusInfo`/`renderStatusDot` delegate to presence-view; one glyph shape per state (dot-only, aria-label).
2. Reconnecting countdown from `graceUntil` in the label.
## Don't
- Rename room labels "Đang rời trang" / "Mất kết nối" (#113/#114 user choice).
## Done when
- jsdom tests (existing room-slot-status + viewer-presence-dot suites green); design-workflow if visuals change.
