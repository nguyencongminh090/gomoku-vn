# B190 — Arena mockup features that need new data (B189 phase 2)
**Status:** OPEN
**Area:** server/routes, schema, client/js/{rankings,profile,club}.js
**From:** B189 phase 1, 2026-10-09   **Depends:** B189

## Problem
Mockup elements phase 1 skipped because the data/feature does not exist yet.

## Scope (each separable; ask which first)
1. Rankings: 7-day rating change (from rating_history) + club column; search box (`?q=`); scope tabs Việt Nam / CLB của tôi / Bạn bè (needs country, friends).
2. Profile: rating chart (90 days, rating_history), weekly delta on cards, badges, country/city, actions Thách đấu / Kết bạn / Nhắn tin (need friends+challenge features).
3. Club: "Hạng CLB" (club-vs-club ranking), tabs Tổng quan/Thành viên/Giải/Chat, "Sắp tới" events.
4. Lobby/room/history still use the old topnav — migrate to platform-shell when the user asks.

## Don't
- Speed chips (1+0, 3+2…): ratings are per rule, no speed split (planning Q4).
## Done when
- Side-by-side with the mockup shows the item; real data, tests, real-browser pass.
