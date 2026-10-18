# B286 — "Cài đặt phòng đã được thay đổi." repeats with no detail
**Status:** DONE
**Area:** server/socket/handlers/RoomHandler.js (settings notice), client/js/i18n.js
**From:** ux-audit Rooms 2026-10-18, finding L2   **Depends:** —

## Problem
Four settings changes gave the guest four identical chat lines; none says what changed (first-time-user lens). Pre-existing.
## Scope
1. Include what changed (e.g. "Kích thước bàn: 15×15") or coalesce rapid changes into one line.
2. Touches `server/` — needs explicit go-ahead before building (out of scope of ui/* branches).
## Don't
- Don't leak settings the guest can't see.
## Done when
- One informative line per change burst; server + client tests.
