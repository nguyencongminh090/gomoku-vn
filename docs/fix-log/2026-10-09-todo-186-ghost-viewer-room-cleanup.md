# 2026-10-09 15:40 — #186 room of only disconnected viewers outlived everyone (until 10-min idle sweep)
## Prompt
"do #186"
## Root cause
`DisconnectHandler.handleDisconnect` decided "last occupant" with `room.users.size === 1`, which counts
viewers already marked `presence:'disconnected'` (#115 keeps them, no timer). Unseated host + unseated
joiner both drop -> both take the viewer path -> no empty-room grace -> room stays in the lobby and holds the
creator IP's quota until `IDLE_TIMEOUT_MS`. Seen as room #TWT in the #185 run. A clean tab close sends
room:leave, so it only shows on abrupt drops (crash, network loss, a failed e2e teardown).
## Fix
`server/socket/handlers/DisconnectHandler.js`:
- `hasOtherConnectedUser()` replaces the size check: start the empty-room grace when no *other connected* user remains.
- `reapGhostRoom()` runs after an empty-room/spectator grace expiry that didn't destroy the room. If everyone
  left is disconnected, none is inside a grace window and no game is ongoing, they are removed via
  `leaveRoom` -> room destroyed. A ghost viewer coming back later gets ROOM_GONE.
- Unchanged: #115 (a viewer who returns while the room lives rejoins), the ongoing-game grace path, all grace lengths.
Branch `fix/186-disconnected-viewers-room` off dev. Server-only, no `?v` bump.
## Verification
`server/tests/DisconnectHandler.test.js`: 4 new cases with a realistic leaveRoom; 3 fail on the old handler.
`npm test` 1930 green. Real browser: new `e2e/room-ghost-viewers-cleanup.spec.ts` (two unseated users drop,
no room:leave) -> room left the lobby after 20.5 s; server log "only disconnected viewers left — removed them".
`lobby-patch-incremental-render` 3x in a row against one server: green. Real DB restored, checksum OK.
Not verified: full e2e suite.
