# F453 — Create Room: player scope "Everyone / Club members"
**Status:** ✅ DONE 2026-11-25 (branch `feature/club-only-seats`)
**Area:** server/managers/{RoomManager,RoomInviteService}.js, server/socket/{SocketHandler.js,handlers/LobbyHandler.js}, client/index.html, client/js/{lobby,room-ui,rooms-h,i18n}.js
**From:** user request 2026-11-25, design approved in chat   **Depends:** — (seat alert and filter chips already removed on dev, 475f6a41)

## Problem
Any visitor can take a seat. Host wants only their club mates to play; everyone else watches.
User verbatim: "chỉ người cùng nhóm với người tạo phòng mới được ngồi vào ghế đấu, những người khác chỉ xem" + "người được mời sẽ chơi được".

## Scope
1. Inject `roomManager.clubIdsOf(userId)` like `avatarLookup` (SocketHandler.js:33): `club_members`, `role != 'pending'`, club ids.
2. `createRoom`: scope `clubs` → snapshot creator's club ids on the room; guest or clubless → `all` (server-side). Creator is always eligible.
3. `joinRoom`: eligibility = creator, club overlap, or invited; cache on the user entry (covers room:join and reconnect rejoin).
4. `sitDown`: refuse ineligible with `SEAT_CLUB_ONLY`.
5. Invite accept: add to `room.invitedIds` only if the inviter is eligible; update an already-present spectator and broadcast. Kick removes the grant.
6. Client: modal select "Phạm vi người chơi: Mọi người / Người trong nhóm", disabled with reason for guest/clubless (also a remembered `clubs` value);
   per-user `canSit` in `serializeRoom` users → locked seat button + one-line reason; lobby card badge "Nhóm" (`scope` in `lobbyEntry`).
7. i18n both languages; `node scripts/cache-bust.js --write`.

## Don't
- No hiding the room from the lobby; outsiders can still join and watch.
- No scope change after creation (not in room settings).
- Link or room code is not an invite.

## Traps
- `updateSettings` merges `{...room.settings, ...newSettings}`: keep scope and club ids outside `settings`.
- `RoomInviteService.accept` seats nobody and records nothing on the room today.
- `clubsOfUser` returns slugs, not ids.
- Leaving a club while in the room keeps the cached eligibility until the user leaves the room (intended).

## Why this way
Club list is snapshotted, membership read at join, so new club members can play. Rejected: snapshotting member ids at creation. Knowledge: none.

## Done when
- Backend tests: clubless creator → `all`; member sits; outsider `SEAT_CLUB_ONLY`; invited outsider sits; ineligible host's invite grants nothing;
  kick revokes; host transfer does not widen access; settings update cannot change scope.
- jsdom: locked seat button, disabled modal option. Real-browser pass.
## Result
Room-level `creatorId/playerScope/clubIds/invitedIds`, `users[].canSit` cached at join; `club-ids-lookup.js`; prefs `hasClubs`.
Tests: `room-club-scope.test.js` (20) + jsdom; `npm test` 4889 green. Browser (own DB): mate sits, outsider locked + `SEAT_CLUB_ONLY`, invite unlocks live, guest option disabled.
