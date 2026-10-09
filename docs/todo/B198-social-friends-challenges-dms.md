# B198 — R4: friends, challenges, notifications (bell), persisted DMs
**Status:** OPEN — slices 1–2 merged on dev; slice 3 (challenges via REST + PairRoom, accept → seated room) done 2026-10-09 on `feature/198-challenges`; slice 4 (DMs) pending.
**Area:** server (schema + new migration, FriendHandler, ChallengeHandler, NotificationService, PrivateChatHandler persistence) + client (profile buttons, Social screen, bell in Arena header)
**From:** features/platform/planning.md § Release 2 (R4); folds B191 item 1 (+ item 4 "CLB của tôi" is NOT in R4)   **Depends:** B197 (queue/room-create reuse), B159 (ephemeral DM)

## Problem
Profile buttons Thách đấu / Kết bạn / Nhắn tin and the Social screen (notifications, friends, DMs) have no backend. DMs (#159) are ephemeral and online-only; rankings scope "Bạn bè" needs a friends table.

## Scope (4 slices, one branch each off dev, reviewed + merged separately)
1. **Friends** — table in `schema.sql` (new table, CREATE IF NOT EXISTS like clubs): `friendships(user_a, user_b, status pending|accepted, requested_by, created_at)`, `user_a<user_b` canonical, UNIQUE pair. REST `/api/friends` (list, request, accept, decline, remove); profile Kết bạn button states; rankings scope "Bạn bè".
2. **Notifications** — `notifications(id, user_id, type, payload_json, read_at, created_at)`; `NotificationService.push()` (DB row + live `notify:new` to user's sockets); bell + unread count in Arena header; list/mark-read REST. Types: friend_request, friend_accepted, challenge, dm.
3. **Challenges** — `challenge:send {to, rule, time, rated}` / accept / decline / cancel via sockets; accept = same createRoom→joinRoom→sit path as MatchHandler pairing (extract shared helper, don't copy). Expires 2 min; one pending per (from,to).
4. **Persisted DMs** — `direct_messages(id, conv_key, sender_id, body, created_at, read_at)`; PrivateChatHandler stores then emits; offline recipient gets a notification instead of `RECIPIENT_OFFLINE`; history REST (paged); Social screen DM list + unread.

## Don't
- No group chat / club chat (R6). No block-list UI unless Q3 says so. Guests: no friends/DMs/challenges (members only).
- Don't change the queue (B197) or clock code.
## Traps
- Friend request both directions at once → merge to accepted, not two rows.
- Challenge to a user already in a room / offline / self; re-check at accept time (as B197's pairing re-check).
- DM body: keep #159 sanitize + profanity + 500 cap + rate limit; store the sanitized text only.
- New `err.*` codes → vi+en i18n and `error-codes-i18n-consistency.test.js` SERVER_FILES.
- Migrations: new numbered file, not schema.sql-only (see server/db/DB_REVIEW.md).
## Decided (user, 2026-10-09)
1. Friend = mutual accept. 2. Challenge rules/times = reuse B197 chips. 3. Privacy gate deferred to R5 settings (R4 default: everyone may DM/challenge).
## Done when
- Per slice: backend tests + jsdom + real-browser pass (sandbox DB, `playwright-e2e-safety`); `?v=N` bumped; fix-log/DONE entries.
## Slice 3 notes (2026-10-09)
- Challenges are REST (`/api/challenges`), not sockets: a second socket from the same user evicts the first (one live session per user), so profile/social pages must stay socket-less. Accept seats both by user id via `PairRoom.seatPair` (shared with B197); `room.html` rejoins on connect, live sockets get `room:joined` through `ChallengeService.setHooks`. A seated user who never connects is released after 90 s.
- In-memory (2 min TTL, lost on restart → accept answers 404 CHALLENGE_GONE); the persisted part is the `challenge` / `challenge_accepted` notification.
