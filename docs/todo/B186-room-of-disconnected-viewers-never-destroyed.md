# B186 — room whose occupants are all disconnected viewers is never destroyed (until idle sweep)
**Status:** ✅ FIXED 2026-10-09 — grace on last connected user + ghost reap on expiry ([fix-log](../fix-log/2026-10-09-todo-186-ghost-viewer-room-cleanup.md))
**Area:** server/socket/handlers/DisconnectHandler.js (handleDisconnect), RoomManager idle sweep
**From:** #185 e2e diagnosis, 2026-10-09   **Depends:** —

## Problem
Host creates a room and never sits; a second user joins (also unseated); both close the tab.
First disconnect: `room.users.size === 2` → viewer branch → `presence='disconnected'`, stays (#115).
Second disconnect: size is still 2 (the disconnected viewer counts) → viewer branch again → no
empty-room grace. Room stays in the lobby and holds the creator IP's `MAX_ROOMS_PER_IP` slot until
`IDLE_TIMEOUT_MS` (10 min). Seen: room `#TWT` in the #185 server log ("Viewer … stays in room.users
indefinitely" x2, never "destroyed"); every later `waitForEmptyLobby()` timed out for 90 s.

## Scope
1. Jest repro in `server/tests/` (two viewers disconnect → room must enter empty-room grace / be destroyed).
2. Decide the rule: the "only occupant" check should count *connected* users (presence !== 'disconnected').
3. Keep #115's contract: a viewer who reconnects while the room still exists rejoins it.

## Don't
- Don't shorten IDLE_TIMEOUT_MS or touch EMPTY_ROOM_GRACE_MS to hide it.
- Don't change e2e specs for this; the #185 run recipe restarts the server between rounds meanwhile.

## Traps
- Ongoing-game players take the disconnect-grace branch first; an all-disconnected room *with a game*
  is a separate path (interrupted). Scope is the pre-game / no-game case.

## Done when
- Jest case green; `lobby-patch-incremental-render` passes twice in a row against one server.
