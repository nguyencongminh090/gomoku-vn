# 2026-11-16 09:44 — #387 game:resumed chat line by reader (viewer case)
## Prompt
"do #387". Self case already gone with #398 (reconnecting socket gets game:init only); viewer case left.
## Root cause
`room-socket.js` `game:resumed` handler always appended `room.reconnected` ("Đối thủ đã kết nối lại!")
whoever read it — spectators have no "đối thủ".
## Fix
`client/js/room-socket.js` game:resumed: playerId === me → no chat line (stray pre-#398 copy; game:init
already resumed this tab — deviation from todo Scope 1 "own text": that path no longer fires, so no new
i18n key); I am a player → `room.reconnected`; otherwise (viewer) → `sys.player_reconnected_resumed`
with the name from `roomData.users` (fallback `gameState.players`, then '?'). Server event unchanged.
## Verification
`client/tests/turn-watchdog-resync.test.js` +3 tests (opponent / viewer / self); viewer + self fail
without the fix. Full `npm test` green. Browser pass (engine.close() with a viewer watching) NOT done.
