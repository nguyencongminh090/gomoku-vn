# Fix log entry — 2026-08-14 12:00

## Prompt
"Do #115" — implement TODO.md #115: role Viewer (slot === null, chưa ngồi ghế)
phải reconnect quay lại đúng phòng được bất kỳ lúc nào, không bị giới hạn 30s
`SPECTATOR_GRACE_MS`. Yêu cầu đã chốt sẵn trong `docs/todo/B115-*.md` /
`docs/instruction/B115-*.md` trước khi làm.

## Action
`server/socket/handlers/DisconnectHandler.js`'s `handleDisconnect()` cuối
cùng gọi `startSpectatorGrace(io, room, user)` vô điều kiện cho mọi
guest/spectator lẫn seated-player-chưa-`ongoing`. Tách nhánh theo
`room.users.get(user.userId).slot`:
- `slot === null` (Viewer thật): chỉ set `presence = 'disconnected'` +
  `broadcastRoomUpdate(io, room)`, **không** set timeout nào, return sớm —
  không thêm vào `spectatorGraceTimers`. `RoomManager.joinRoom()` (không đụng)
  đã coi "còn trong `room.users`" là reconnect hợp lệ vô điều kiện thời gian.
- `slot === 1 | 2` (player ngồi ghế, ván chưa `ongoing`): giữ nguyên gọi
  `startSpectatorGrace` như cũ, không đổi hành vi 30s.

Không đụng `startDisconnectGrace` (player trong ván `ongoing`, 60s),
`startEmptyRoomGrace` (người-duy-nhất-còn-lại, 20s), hay
`RoomManager.joinRoom()`.

## Test
`server/tests/DisconnectHandler.test.js` — 3 test case mới (`describe`
"viewer (slot === null) unlimited reconnect"):
1. viewer disconnect → `presence = 'disconnected'`, không có entry trong
   `spectatorGraceTimers`/`disconnectTimers`, `broadcastRoomUpdate` được gọi,
   `leaveRoom` không bị gọi.
2. viewer vẫn còn trong `room.users` sau khi trôi qua 100× `SPECTATOR_GRACE_MS`
   (fake timers) — không bao giờ bị đuổi.
3. case đối chứng: seated player (`slot: 1`) trong cùng phòng, ván chưa
   `ongoing`, vẫn bị đuổi đúng sau 30s như hành vi cũ — không bị đổi theo
   nhầm.

`server/tests/RoomManager.test.js`'s `broadcastRoomUpdate(io` call-site
inventory test (từ B113) cần cập nhật đếm: 21 → 22 tổng call site (thêm 1 ở
nhánh viewer mới), non-settings 20 → 21.

`npm test`: 1134/1134 pass.

## Decision
Đây là thay đổi quyết định thiết kế (người dùng chốt qua chat 2026-08-14), 
không phải sửa bug thường. "Viewer ma" nằm lại `room.users` tới khi phòng tự
huỷ theo cơ chế sẵn có là tác dụng phụ được chấp nhận theo đúng quyết định đã
chốt — không thêm cơ chế dọn dẹp riêng nào, không đụng `kickUser()`.

## Summary output
TODO.md #115: Viewer (slot === null) mất kết nối nay reconnect được vào lại
đúng phòng bất kỳ lúc nào (miễn phòng còn tồn tại), không còn bị đuổi sau 30s
như player chưa ngồi ghế; seated player chưa vào ván vẫn giữ nguyên 30s. 3 test
mới + 1 test inventory cập nhật đếm, `npm test` 1134/1134.
