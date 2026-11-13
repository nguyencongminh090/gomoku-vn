# B367 — Reconnect: a lapsed player stays in the room; quiet connection banner
**Status:** OPEN — fixed on `fix/367-reconnect-stay-in-room`, uncommitted; awaiting real-device check
**Area:** server/managers/RoomManager.js, server/socket/{SocketHandler,handlers/DisconnectHandler}.js, client/js/{socket-client,room-socket}.js
**From:** user report 2026-11-13 (BabyHuyền "đang chơi tự nhiên về trang chủ", log.txt)   **Depends:** —

## Problem
Grace expiry (30 s seated-between-games, 60 s in-game) called `leaveRoom`; the page's later reconnect then
got `ROOM_GONE` ("Phòng không còn tồn tại") though the room was alive → bounced home. Log: won 12:53:42,
dropped 12:53:51, evicted 12:54:21. Top banner "Mất kết nối / Kết nối lại (lần n)" flashed on every blip.

## Scope
1. A: grace expiry → `RoomManager.releaseSeat` (seat freed, presence 'disconnected', stays in room; host → connected occupant).
2. B: room page puts `auth.roomId` on room:joined; a reconnect not in any room silently rejoins that room as viewer (`rejoinOnReconnect`); only users in `room.memberIds` (ever admitted, not kicked) — no silent join by arbitrary roomId.
3. C: banner shows only after `SocketClient.BANNER_DELAY_MS` (8 s) of continuous loss.
4. D: Connected log carries `reconnect=1 room=…`; ROOM_GONE / rejoin logged.

## Don't
- Don't change grace lengths, the in-game pause/resume, or the chat lines (user: noise = top banner only).
- Empty-room grace (sole occupant) still destroys the room — ROOM_GONE is then true.

## Traps
- `reapGhostRoom` still removes a room whose occupants are all disconnected; quick-match/series seat lapse still ends the session.

## Done when
- Tests: RoomManager releaseSeat, DisconnectHandler expiry, SocketHandler rejoin/ROOM_GONE table, socket-client banner, room-socket auth.roomId. `npm test` green.
- Real phone: lock screen > 60 s mid-game → unlock → back in the room as viewer, no banner for short blips.
