# B490 — Presence consumer: lobby list, rooms roster, home counts, DM window (PS-5)
**Status:** OPEN
**Area:** client/js/{lobby,rooms-h,lobby-home,private-chat}.js, server/socket/home-feed.js
**From:** features/presence-status (planning §1e R3-R5, R9), 2026-11-27   **Depends:** #488
## Scope
1. Labels through presence-view; lobby list keeps #372 rule (away not listed, Q4 A).
2. DM window label = the same i18n keys as friends.
## Done when
- jsdom tests; emit counts ≤ #486 baseline.
