# §39. Guest/spectator reconnect thiếu grace period (TODO.md #39)

## §39 — Guest/spectator reconnect thiếu grace period (TODO.md #39)

**Bối cảnh phát hiện:** người dùng yêu cầu kiểm tra reconnect logic cho (1)
player đang chơi và (2) guest trong bàn. Đã đọc
`server/socket/handlers/DisconnectHandler.js`, `server/socket/SocketHandler.js`,
`server/managers/RoomManager.js` bằng codegraph. Kết luận: có đúng 2 nhánh
grace, và khoảng trống nằm GIỮA 2 nhánh đó, không phải toàn bộ luồng reconnect
đều hỏng — case (1) player-in-active-game hoạt động đúng, không cần sửa.

**Chỗ cần sửa:** `handleDisconnect()`
(`server/socket/handlers/DisconnectHandler.js:36-72`). Hiện tại:
```
if (room && room.gameState && room.gameState.status === 'ongoing') { ... player → grace }
if (room.users.size === 1) { ... sole occupant → grace }
// còn lại → finalizeNormalLeave ngay, KHÔNG có case nào ở giữa
```
Cách tiếp cận gợi ý: thêm một grace period thứ 3 (có thể tái dùng cơ chế của
`startEmptyRoomGrace`, đổi tên tổng quát hơn hoặc thêm hàm mới
`startSpectatorGrace`) áp dụng cho case "còn người khác trong phòng nhưng
`gameState` không `ongoing` (hoặc user không phải player)". Thời lượng grace
gợi ý: dùng chung `config.EMPTY_ROOM_GRACE_MS` hoặc thêm hằng số mới riêng
(ví dụ `SPECTATOR_GRACE_MS`) trong `server/config.js` — **hỏi lại người dùng
thời lượng cụ thể trước khi hard-code**, không tự đoán số giây.

**Điểm mấu chốt không được bỏ sót:** `SocketHandler.js:160-176` — nhánh
`socket.handshake.auth.reconnect === true` emit `room:destroyed` khi
`roomManager.getRoomByUser` trả về `null`. Nhánh này được viết đúng cho use
case "phòng thật sự đã bị huỷ khi client offline" (server restart / idle
cleanup) — **không được xoá nhánh này**, chỉ cần đảm bảo user không bị xoá
khỏi `userRoomMap` quá sớm (trong lúc grace) để `getRoomByUser` vẫn trả về
đúng phòng khi họ reconnect kịp thời, giống hệt cách
`startEmptyRoomGrace`/`startDisconnectGrace` đang giữ user trong map cho tới
khi grace hết hạn.

**Không đụng:** `startDisconnectGrace`/`cancelDisconnectGrace` (case player
trong ván `ongoing` đã đúng, xác nhận qua đọc code — không có bug ở đây),
cơ chế `game:interrupted`/`game:resumed`, `TimerManager` pause/resume.

**Test dự kiến:** mở rộng `server/tests/DisconnectHandler.test.js` (đã có
fixture `twoPlayerRoom`) — thêm case guest/spectator rớt mạng khi còn ≥2
người trong phòng và game không `ongoing`, xác nhận: (a) không bị xoá khỏi
`room.users` ngay, (b) reconnect trong thời gian grace → được nối lại đúng
phòng, không nhận `room:destroyed`, (c) reconnect sau khi grace hết hạn →
mới thực sự bị xoá.
