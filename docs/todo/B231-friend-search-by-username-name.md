# B231 — Add friend by username / display name (search box)
**Status:** ✅ DONE 2026-10-12 (branch feature/friend-search, uncommitted)
**Area:** server/managers/FriendService.js (`search`), server/routes/friends.js, client/social.html, client/js/social.js, i18n, platform.css
**From:** user, 2026-10-12 "users can add friend with ID and name"   **Depends:** #198

## Problem
Friends could only be added from a profile / lobby card; no way to find a player by typing.
## Scope
1. `GET /api/friends/search?q=` — members only, ≥ 2 chars, ≤ 8 hits, username or display name (LIKE, escaped), exact username first, never self.
2. Each hit: `status` (none/outgoing/incoming/friends) + `canRequest` (PrivacyGate) so the UI disables up front.
3. "Thêm bạn" box on social.html (debounced 300 ms) → send / accept buttons reuse POST /api/friends/:username[/accept].
## Don't
- Don't search by `users.id` (internal uuid; enumerable, not meant to be shared).
- Don't build a Discord-style `name#tag` code here — see #232.
## Traps
- Hits are not filtered by privacy (they'd leak who opted out); the button shows "not accepting" instead.
## Done when
- friends-route.test.js (4 new) + client/tests/social-add-friend.test.js green; `?v=320`.
