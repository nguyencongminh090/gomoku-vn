# B220 — Lobby: click an online name → profile card (friend + private chat), DMs kept 3 days
**Status:** ✅ DONE 2026-10-12 — merged to `dev` (c700f39). Tests: user-card-dm-ttl (7) + user-card jsdom (10); real-server pass (card → add friend → message) incl. mobile 390 + light. Not checked: incoming-request state in a real browser.
**Area:** server/routes/profile.js (card endpoint), server/managers/DmService.js (TTL), client/js/private-chat.js + user-card CSS, i18n vi/en
**From:** user 2026-10-12   **Depends:** B198 (friends, DMs, windows)

## Problem
Clicking a name in the lobby "Đang online" line opened a chat window directly; no way to see who it is or add them as a friend. DMs kept the newest 500 per pair forever.

## Scope
1. `GET /api/profile/card/:userId` — compact card: name, avatar, country/city, best ratings, games/wins (respects hide_history), friendship + `can`. Members only; guests → no card (chat only).
2. Client popup on name click (lobby line + online modal rows): friend button (add/cancel/accept/remove via /api/friends), "Nhắn tin" → existing `openChat`.
3. DM retention 3 days: `DmService.DM_TTL_MS`, prune on save + hourly sweep + throttled before reads.
## Don't
- No new friend/DM backend; no block list; no change to challenge UI.
## Traps
- Online ids are session userIds (= users.id for members). Guest ids are not in `users`.
- Popup must not reopen chat windows via the `[data-peer-id]` collision (see private-chat.js comment).
## Done when
- Backend tests (card + TTL), jsdom test, real-browser pass.
