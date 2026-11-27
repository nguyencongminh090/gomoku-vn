# 2026-11-27 13:50 — #498 Presence: remove deprecated wire fields (PS-13)
## Prompt
"Do #498 499" (depends on #497 + one deployed release: #486-#497 deployed to prod 2026-11-27).
## Root cause
Not a bug: #488/#489 added the wire `st` next to the friend-row fields `online` / `activity` / `startedAt` /
`roomId` (FriendService.list) for one release. Those four were the only legacy fields still sent beside `st`.
## Fix
- Server: friend rows = person + `st` only (default `{c:'off'}`); removed the `isOnline` / `activityOf`
  hooks and `activityFromRoom` (derivation stays in presence-core.activityOf, tested there).
- Client: `PresenceView.isOnline(row)` = `st.c === 'on' && !st.a`, the same fact the server's isVisiblyOnline
  gave; challenge-modal sort/label and home-challenge merge use it. `stOfRow` no longer maps
  activity/roomId/startedAt (only an online-list row's page-set `online: true`).
## Deviation from planning §2c
Room members' `presence` is NOT removed: the room audience has no `st` (planning §2d); presence-view's
describeMember and room-ui still read it. Lobby `online` id list / counts are a different payload, kept.
## Verification
- friends-route: rows carry `st` and none of the 4 legacy keys; presence-view: isOnline table (8 rows).
- social-bell / lobby-home fixtures moved to `st`; npm test 5340/5340 green; cache-bust OK.
- No browser pass. Old cached clients (pre-#488) would show friends offline — one release has passed.
