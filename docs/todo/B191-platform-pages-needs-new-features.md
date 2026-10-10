# B191 — Arena mockup items that need NEW features (B190 leftovers)
**Status:** OPEN — all 6 items built (2026-10-10), on branch `ui/room-site-links`, awaiting review
**Area:** server (friends/challenge/badges/geo), schema, client
**From:** B190, 2026-10-09   **Depends:** B190

## Problem
Mockup elements with no backing feature yet.

## Scope (each a separate feature — size-L ones go to features/<slug>/)
1. ✅ via #199/#210 — Friends + challenge: profile buttons Thách đấu / Kết bạn / Nhắn tin; rankings scope tab Bạn bè; Social screen (notifications, friends, DMs).
2. ✅ via #199 — Country/city on profile + rankings scope Việt Nam + "Khu vực" column.
3. ✅ via #199 — Badges (Top 500, 1000 wins, …) on profile.
4. ✅ 2026-10-10 Rankings scope tab "CLB của tôi": `scope=club` (server/routes/rankings.js, `getRankingsInMyClubs`; members of every club the viewer belongs to, pending excluded, private/uncached like friends; no-club → no tab, stale link → everyone). 7 tests; browser-checked (dark/light, 1280/390). Rank is within that set.
5. ✅ via #200 — Club tabs Tổng quan/Thành viên/Giải của CLB/Trò chuyện + "Sắp tới" events (needs club tournaments/chat).
6. ✅ 2026-10-10 Room top bar site links (`#room-site-links` in room.html, the existing `.topnav__links` row; ≤860px hidden like elsewhere). `room-ui.js` `updateUI()` hides it while seated in an `ongoing` game (same condition as the Rời phòng confirm); spectators keep it. `client/tests/room-site-links.test.js` (8); real-server pass: 2 players + spectator, waiting/ongoing/finished, dark/light 1280 + 390. `?v=249`.

## Don't
- Speed chips: ratings are per rule (planning Q4).
## Done when
- Per item: real data + tests + real-browser pass.
