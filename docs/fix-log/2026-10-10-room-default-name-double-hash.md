# 2026-10-10 18:08 — untracked: default room name showed "##B58"
## Prompt
"okay, fix issue" — the `##B58` room code next to "Rời phòng", spotted in the #191 item 6 browser pass.
## Root cause
`RoomManager.createRoom()` defaulted the name to `` `#${roomId}` `` (#121, 33229f0), but `_generateRoomId()`
already returns `"#A3F"` → every unnamed room was named `"##A3F"` (room top bar, lobby room list, home).
The #121 test asserted the same expression, so it locked the bug in.
## Fix
`server/managers/RoomManager.js` `createRoom()`: default `roomName = roomId`. Custom names untouched.
Branch `fix/room-default-name-double-hash` off `origin/main` (96702cb). Server-only → no `?v=` bump.
Rooms are in memory only, so no stored names to migrate.
## Verification
`server/tests/RoomManager.test.js`: default test now asserts `roomName === roomId` and `/^#[A-Z2-9]{3}$/`;
new case: empty custom name → room ID. Both fail without the fix. `npm test` 2699/2699.
Not re-checked in a browser (the top bar renders `roomName` as-is; seen as `##B58` before).
