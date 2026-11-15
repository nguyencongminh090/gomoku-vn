# B387 — Reconnecting player sees "Đối thủ đã kết nối lại!" about themselves
**Status:** OPEN
**Area:** `server/socket/handlers/DisconnectHandler.js:477` (`game:resumed` to the whole room), `client/js/room-socket.js:977`
**From:** #386 browser pass 2026-11-15 (screenshot: reconnecting player's own chat shows the opponent message)   **Depends:** —

## Problem
`cancelDisconnectGrace` emits `game:resumed { playerId }` to the room, including the player who came back; the client always
appends `room.reconnected` ("Đối thủ đã kết nối lại! Ván đấu tiếp tục."). Spectators also read "Đối thủ" though they have none.

## Scope
1. Client: if `playerId` is me → own text (e.g. "Đã kết nối lại"), a player → `room.reconnected`, a viewer → `sys.player_reconnected_resumed` with the name.
2. jsdom test in the suite that loads `room-socket.js` for all three cases.

## Don't
- Don't change the server event (other clients rely on it).

## Done when
- jsdom test green; browser: reconnect via `RoomClient.socket.io.engine.close()` shows the right line on both sides.
