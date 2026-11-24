# F443 — Invite an online player to my room (accept / decline)
**Status:** ✅ DONE 2026-11-24 — backend jest (service 18 + route 10), jsdom (room-invite 9, platform-shell +7, social-bell +1), `npm test` 270 suites/4686 tests, real-browser pass desktop 1280 + mobile 390 (2 users, isolated DB), opus whole-branch review (3 findings fixed; minors deferred: host-left invite acceptable, in-flight accept lock on re-render, same-target resend bypasses cap, picker error erased on search/no focus trap).
**Area:** server/managers/RoomInviteService.js (new), server/routes/room-invites.js (new), NotificationService.js (`room_invite`), SocketHandler.js (hooks), client/room.html + room-ui.js (menu item + picker sheet), platform-shell.js (bell actions), social.js (notifs view), i18n.js, room.css
**From:** user 2026-11-24 "Invite player -> Room … Open list of online player -> send invite. Player invited can accept / decline."   **Depends:** —

## Problem
A room can only be shared by copying a link ("Chép link mời"). No way to invite a specific online player and let them answer.

## Scope
1. `RoomInviteService` (only the room host may send; candidate list uncapped) (mirror ChallengeService): in-memory pending invite {id, from, to, roomId}, TTL 5 min, replace on re-send (same from+to), max outgoing per sender. Push `room_invite` notification {from, roomId, roomName, inviteId}.
2. REST `/api/room-invites`: GET `/online` (candidates), POST `/` {to, roomId}, POST `/:id/accept` → {roomId}, DELETE `/:id` (decline/cancel, idempotent). Members only.
3. room.html ≡ menu: "Mời người chơi" under "Chép link mời" → picker sheet (search + list, row button Mời → Đã mời).
4. Bell panel + social notifications view: `room_invite` rows get inline Chấp nhận / Từ chối.
5. Accept → client goes to `room.html?id=<roomId>`; the normal `room:join` makes them a spectator.

## Don't
- No auto-seat on accept (user decision): invitee joins as spectator and sits themselves.
- No server change to `room:join`/seating; no board/stones code.
- No new privacy column: reuse `who_can_challenge` (my call).
- No toast/sound on live invite, no "declined" notice to inviter (follow-ups).

## Traps
- Pending invites are in-memory; `RoomInviteService.purgeStale()` deletes all `room_invite` rows at boot (else Decline/Accept on a pre-restart row can never clear it). A stale accept → 404 `INVITE_GONE` → client shows "expired", no navigation.
- `send()` has no "target in a room" check and `GET /online` is host-only: both would leak where hidden-online users are (reviewer finding). `accept()` guards ALREADY_IN_ANOTHER_ROOM.
- Re-check at accept: room still exists, not full, invitee not in another room (409).
- Candidates (host only) exclude: self, guests, hidden-online, anyone already in a room, privacy-blocked.
- Sender must currently be in `roomId` (userRoomMap) — validate server-side, never trust body.
- Bell items are `<a>`; action buttons must not trigger the row's navigate/markRead.

## Why this way
REST + NotificationService like ChallengeService: works for invitee on any page / offline-then-online, reuses bell + push. Rejected: socket-only `room:invite` (lost if invitee not on a socket page, no persistence). Knowledge: none needed.

## Done when
- Backend jest: send/accept/decline/expire/replace, not-in-room, full room, guest, privacy, GONE.
- jsdom: menu item opens picker, search, invite button state; bell row actions.
- Real-browser pass: 2 accounts, invite → accept lands as spectator (no seat) / decline removes row. Desktop + 390px.
