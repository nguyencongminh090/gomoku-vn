# 2026-11-27 01:53 — #497 a player back mid-game showed as "away" to the room (found by the browser pass)
## Prompt
features/presence-status PS-12 real-browser pass: after B went offline and came back, A saw B "Đang rời trang".
## Root cause
`cancelDisconnectGrace` resumed the game on the new socket but never set `socket.data.roomPageId` (#373). The
next presence report from that room page went through `onPresence` with `onRoomPage = false` and wrote 'away'.
Present since #373 on the casual resume path too; the browser pass hit it on the new rated path.
## Fix
DisconnectHandler.cancelDisconnectGrace: when the handshake says room page (`auth.roomPage === true`) or names this
room (`auth.roomId`), mark the socket as the room page before resuming (both rated and casual paths). #422
non-room pages never reach this branch.
## Verification
presence-transitions.test.js #497 block (failed before: 'away', now 'active'). Browser rerun: reconnect shows
"Đang chơi" after 2.4 s. npm test green.
