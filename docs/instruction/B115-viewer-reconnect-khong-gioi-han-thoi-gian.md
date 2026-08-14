## B115. Viewer reconnect không giới hạn thời gian (TODO.md #115)

**Bối cảnh phát hiện:** báo cáo người dùng ban đầu ("Viewer ... cannot come
back room") được phân tích dựa trên cơ chế 3 nhánh grace period đã có
(`startDisconnectGrace` 60s cho player-trong-ván-`ongoing`,
`startEmptyRoomGrace` 20s cho người-duy-nhất-còn-lại, `startSpectatorGrace`
30s cho phần còn lại — xem `docs/instruction/S39-*.md`). Người dùng xác nhận
họ mất kết nối **lâu hơn 30 giây**, và chốt: role **Viewer phải reconnect vào
lại được bất kỳ lúc nào** — không có mốc timeout nào cả, khác với player.

**Phạm vi CHÍNH XÁC** (đọc kỹ trước khi code, đừng tự mở rộng):
- Chỉ áp dụng cho user có `slot === null` (chưa ngồi ghế) tại thời điểm
  disconnect — đúng nghĩa "Viewer" người dùng dùng trong báo cáo.
- **KHÔNG** đụng đến `startDisconnectGrace` (player trong ván `ongoing`, 60s)
  — người dùng không yêu cầu đổi, và đây là player thật đang chơi.
- **KHÔNG** áp dụng vô hạn cho player đã ngồi ghế nhưng ván chưa `ongoing`
  (case "seated player khi ván chưa ongoing" trong `startSpectatorGrace` hiện
  tại) — người dùng chỉ nói "role Viewer", một người đã ngồi ghế không còn là
  Viewer nữa dù ván chưa chạy. Giữ nguyên 30s cho nhóm này.
- **KHÔNG** đụng `startEmptyRoomGrace` (20s, người-duy-nhất-còn-lại) — đây là
  case khác (bảo vệ khỏi huỷ phòng do full-page-navigation), giữ nguyên kể cả
  khi người duy nhất đó là viewer; nếu cần đổi case này theo yêu cầu mới, phải
  hỏi lại người dùng riêng vì nó liên quan tới huỷ phòng, không chỉ đuổi user.

**Cách đã triển khai (2026-08-14):** trong `handleDisconnect()`
(`server/socket/handlers/DisconnectHandler.js`), tại nhánh cuối cùng (trước
đây gọi `startSpectatorGrace` vô điều kiện), rẽ theo `slot` của user:
- `slot === null` (Viewer) → **không set timeout nào** — chỉ set
  `presence = 'disconnected'` + `broadcastRoomUpdate`, rồi return. Không thêm
  vào `spectatorGraceTimers`; `cancelSpectatorGrace()` không cần sửa (không có
  entry để cancel, đã là no-op an toàn).
- `slot === 1 || slot === 2` (player, ván chưa `ongoing`) → giữ nguyên gọi
  `startSpectatorGrace` như cũ.

**Branch:** `fix/viewer-reconnect-unlimited` off `main` — code liên quan
(`DisconnectHandler.js`, `RoomManager.js`, `config.js`, `state.js`) giống hệt
giữa `main`/`dev` tại thời điểm làm, không phải trường hợp ngoại lệ "chỉ tồn
tại trên `dev`" của `git-workflow` skill.

**"Viewer ma" — ĐÃ CHỐT, không phải mở:** người dùng xác nhận (2026-08-14)
quy tắc đơn giản: **phòng còn tồn tại → Viewer reconnect lúc nào cũng quay
lại đúng phòng đó; phòng không còn tồn tại → về sảnh chờ** (đúng nhánh
`ROOM_GONE` sẵn có, `SocketHandler.js:228-244`, không đổi). Một Viewer bỏ đi
vĩnh viễn nằm lại `room.users`/`userRoomMap` cho tới khi phòng tự huỷ theo cơ
chế sẵn có (mọi người khác cũng rời, hoặc `_idleCleanup`) là tác dụng phụ
**được chấp nhận** — **không thêm timeout, không thêm cơ chế dọn dẹp riêng
cho Viewer, không đụng `kickUser()`**. Đây không còn là câu hỏi mở, đừng hỏi
lại người dùng về điểm này nữa.

**Không đụng:** `RoomManager.joinRoom()` (dòng 181-220) — logic "còn trong
`room.users` → coi là reconnect hợp lệ" đã đúng và không cần đổi, chỉ cần đảm
bảo Viewer không bị xoá khỏi `room.users` là đủ để cơ chế này hoạt động; không
đụng `SocketHandler.js`'s existingRoom auto-rejoin (dòng 199-244), không đụng
`cancelDisconnectGrace`/luồng player-trong-ván.

**Test đã viết:** mở rộng `server/tests/DisconnectHandler.test.js` — case
Viewer (`slot: null`) disconnect trong phòng còn người khác, giả lập trôi qua
mốc 30 giây cũ (fake timers, 100× `SPECTATOR_GRACE_MS`), xác nhận vẫn còn
trong `room.users` và không có entry `spectatorGraceTimers`/`disconnectTimers`;
case đối chứng player ngồi ghế (ván chưa `ongoing`) vẫn bị đuổi đúng 30s như
hành vi cũ, không bị đổi theo nhầm. Cập nhật đếm call-site inventory (B113)
trong `server/tests/RoomManager.test.js` (21→22, non-settings 20→21) vì thêm
1 điểm gọi `broadcastRoomUpdate(io` mới.
