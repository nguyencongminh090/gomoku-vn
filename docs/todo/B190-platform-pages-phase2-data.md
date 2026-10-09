# B190 — Arena mockup features that need new data (B189 phase 2)
**Status:** ✅ DONE 2026-10-09 (branch `feature/190-platform-phase2`, uncommitted) — built the parts that need no new feature: rankings 7-day change + club column + name search (`?q=`, true ranks via window fn); profile rating chart (`/api/profile/:u/rating-history`) + weekly change on cards, both behind hide_history; club rank ("Hạng CLB": avg rating of ranked members per category) in club header + list badge; site links row in lobby+history top bars; Settings gear on platform pages; ?v=188. Tests: rankings-route, profile-route, clubs-route, client rankings/profile/clubs/shell. Verified by screenshots (desktop dark+light, mobile dark; faked API). NOT done → B191.
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
