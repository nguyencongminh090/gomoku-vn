# 2026-11-13 14:02 — #367 Reconnect lands back in the room, not on Home
## Prompt
"Player is playing when reconnect must join room automatically instantly. Viewer as well. Do not show announce of lost connection" — BabyHuyền "đang chơi tự nhiên về trang chủ"; popup = top banner "Kết nối lại / mất kết nối".
## Root cause
DisconnectHandler grace expiry (spectator 30 s / in-game 60 s) called `roomManager.leaveRoom`, so the user lost room
membership. The room page's later reconnect hit SocketHandler's "no room + reconnect" branch → `ROOM_GONE` →
room-socket.js redirects to index.html, although room #MLC still existed. Log: win 12:53:42, last socket 12:53:51,
"Spectator grace expired … left for real" 12:54:21, back 13:16:20 not in room. Banner: socket-client `_setStatus`
showed on the first `disconnect`.
## Fix
- RoomManager.releaseSeat (new): seat freed, user kept as disconnected viewer; host → connected occupant; series/match abandon as leaveRoom. room.memberIds (creator + joiners) gates the rejoin; kickUser removes the target.
- DisconnectHandler: both grace expiries → releaseSeat + finalizeSeatRelease + reapGhostRoom (all-ghost rooms still destroyed).
- SocketHandler: `rejoinOnReconnect` — reconnect with `auth.roomId`, room alive, not kicked → silent joinRoom + room:joined; else ROOM_GONE (now logged). Connected log adds `reconnect=1 room=`.
- room-socket.js: room:joined sets `socket.auth.roomId`. socket-client.js: banner after 8 s (`BANNER_DELAY_MS`).
- Left alone: grace lengths, game pause/resume chat lines, empty-room grace. Branch `fix/367-reconnect-stay-in-room` (off dev). `?v=` rewritten by cache-bust.
## Verification
- Tests: RoomManager.test (releaseSeat ×5, emit-site count 24→25), DisconnectHandler.test (expiry keeps user), SocketHandler.test (rejoin + ROOM_GONE table + first-connect guard), socket-client-quiet-banner.test (new), room-entry-overlay.test (auth.roomId). `npm test` 3672/3672.
- NOT verified: real phone lock/unlock, real network drop in a browser.
