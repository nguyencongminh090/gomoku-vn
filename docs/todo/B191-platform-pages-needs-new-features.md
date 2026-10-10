# B191 — Arena mockup items that need NEW features (B190 leftovers)
**Status:** OPEN
**Area:** server (friends/challenge/badges/geo), schema, client
**From:** B190, 2026-10-09   **Depends:** B190

## Problem
Mockup elements with no backing feature yet.

## Scope (each a separate feature — size-L ones go to features/<slug>/)
1. Friends + challenge: profile buttons Thách đấu / Kết bạn / Nhắn tin; rankings scope tab Bạn bè; Social screen (notifications, friends, DMs).
2. Country/city on profile + rankings scope Việt Nam + "Khu vực" column.
3. Badges (Top 500, 1000 wins, …) on profile.
4. ✅ 2026-10-10 Rankings scope tab "CLB của tôi": `scope=club` (server/routes/rankings.js, `getRankingsInMyClubs`; members of every club the viewer belongs to, pending excluded, private/uncached like friends; no-club → no tab, stale link → everyone). 7 tests; browser-checked (dark/light, 1280/390). Rank is within that set.
5. Club tabs Tổng quan/Thành viên/Giải của CLB/Trò chuyện + "Sắp tới" events (needs club tournaments/chat).
6. Room top bar: intentionally NOT given the site-links row (stray click mid-game); revisit if wanted.

## Don't
- Speed chips: ratings are per rule (planning Q4).
## Done when
- Per item: real data + tests + real-browser pass.
