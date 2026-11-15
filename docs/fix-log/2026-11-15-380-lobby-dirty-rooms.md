# 2026-11-15 17:39 — #380 lobby flush diffs dirty rooms only
## Prompt
"Một nước đi khi đánh ra không được delay… Mục tiêu: Phục vụ 10000 - 1000000 người cùng lúc." → review → "ghi todo và bắt đầu từ điểm 3".
## Root cause
`_diffLobbyRooms` (`server/socket/state.js`) called `roomManager.listRooms()` on every flush: all rooms rebuilt (2 DB gets per seated player, moves `flatMap`, `JSON.stringify`) at most every 2.5 s while anyone moves and every 300 ms on any room change — O(all rooms) on the thread that acks moves. Call sites passed no room, so the flush could not know what to look at.
## Fix
- `RoomManager.lobbyEntry(room)`: per-room body of `listRooms()` (output unchanged).
- `state.js`: `broadcastLobbyUpdate(io, roomId)` / `scheduleLobbyBoardUpdate(io, roomId)` mark the room dirty (`_lobbyDirty`); the flush builds only those entries, a missing room in the baseline → `removed`. `_lobbyUpsert` shared by both paths.
- Full diff kept when: no room named, no baseline, or `LOBBY_FULL_RECONCILE_MS` (30 s) since the last full diff (unannounced avatar/rating changes).
- All 22 call sites in `server/socket/**` pass their room id. Wire payloads unchanged. Branch `fix/380-lobby-dirty-rooms` (off dev). No `client/` edit, no `?v=` bump.
## Verification
- `server/tests/lobby-delta.test.js` +7 (`dirty rooms (#380)`): one entry built for one move in 50 rooms; dirty patch == full-diff patch (move, state change, destroy, create); no-id fallback; first flush full; reconcile; dirty mark survives an earlier lifecycle flush. 3 failed before the fix.
- `npm test`: 222 suites / 3896 tests pass.
- Bench (real modules, temp DB, 5 000 playing rooms × 60 moves, rooms without DB users): flush with 1 room moved 32.4 → 0.17 ms; 100 moved 1.0 ms; 1 000 moved 5.8 ms.
- NOT verified: real-server load run (`tools/perf`), browser pass (no client change). A full diff still runs ≤ once per 30 s and per lobby subscriber snapshot (#382).
