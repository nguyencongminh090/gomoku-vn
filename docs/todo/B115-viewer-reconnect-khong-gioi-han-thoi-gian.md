# Phần B #115. Viewer (khán giả) phải reconnect quay lại phòng được bất kỳ lúc nào, không bị giới hạn 30s

**Nguồn:** báo cáo người dùng qua chat, tiếp nối phân tích cho báo cáo "Viewer
in room when disconnect and reconnect cannot come back room where they left"
(2026-08-14). Người dùng xác nhận: thời gian mất kết nối thực tế **dài hơn
30 giây** (`SPECTATOR_GRACE_MS`), và chốt yêu cầu rõ ràng — role **Viewer**
(khán giả, chưa ngồi ghế) phải luôn quay lại được đúng phòng đã rời, **bất kể
đã mất kết nối bao lâu**. Đây là thay đổi quyết định thiết kế (nới vô hạn thời
gian chờ cho riêng role Viewer), không phải sửa bug.

115. **Viewer hiện đang bị `startSpectatorGrace()` (30s) đuổi khỏi
    `room.users`/`userRoomMap` giống hệt player ngồi ghế khi ván chưa
    `ongoing` — cần tách riêng: Viewer (chưa ngồi ghế) không có giới hạn thời
    gian reconnect; player ngồi ghế khi ván chưa `ongoing` vẫn giữ nguyên 30s
    như cũ.**
    - **Vị trí:** `server/socket/handlers/DisconnectHandler.js:37-79`
      (`handleDisconnect`), nhánh cuối cùng hiện gọi chung
      `startSpectatorGrace(io, room, user)` cho cả 2 nhóm người dùng
      (viewer lẫn seated-player-chưa-ongoing) — không phân biệt `user.slot`.
      `roomManager.getRoom(roomId).users.get(user.userId).slot` là cờ phân
      biệt sẵn có (`null` = viewer, `1`/`2` = ghế).
    - **Đánh giá hiệu quả/an toàn:** an toàn về mặt cơ chế reconnect (không
      đổi luồng `room:join`/`joinRoom()` — `RoomManager.joinRoom()` đã coi
      "còn trong `room.users`" là reconnect hợp lệ vô điều kiện thời gian,
      chỉ cần KHÔNG xoá viewer khỏi `room.users` là đủ).
    - **Quyết định đã chốt (2026-08-14, người dùng xác nhận):** không cần
      thêm cơ chế dọn "viewer ma" nào. Quy tắc đúng như người dùng phát biểu:
      **phòng còn tồn tại → Viewer reconnect lúc nào cũng quay lại đúng
      phòng đó; phòng không còn tồn tại (đã bị huỷ) → về sảnh chờ**, đúng
      hành vi `ROOM_GONE` sẵn có (`SocketHandler.js:228-244`). Một viewer bỏ
      đi vĩnh viễn nằm lại `room.users` cho tới khi phòng đó tự huỷ theo cơ
      chế sẵn có (mọi người khác cũng rời / `_idleCleanup` theo
      `room.lastActivity`) là tác dụng phụ **được chấp nhận**, không cần xử
      lý thêm. Không tự thêm timeout/dọn dẹp riêng cho viewer ngoài phạm vi
      này.
    - **Trạng thái:** ✅ ĐÃ XONG (2026-08-14, `fix/viewer-reconnect-unlimited`
      off `main`).
    - **Test:** `server/tests/DisconnectHandler.test.js` — case viewer
      disconnect, chờ vượt qua `SPECTATOR_GRACE_MS` (30s, giả lập bằng fake
      timers — 100× SPECTATOR_GRACE_MS), xác nhận viewer **vẫn còn** trong
      `room.users` và `spectatorGraceTimers` không có entry cho họ. Case đối
      chứng: player ngồi ghế khi ván chưa `ongoing` disconnect quá 30s vẫn bị
      đuổi như hành vi cũ (không bị đổi theo). `server/tests/RoomManager.test.js`'s
      `broadcastRoomUpdate(io` call-site inventory (B113) cập nhật đếm
      21→22. `npm test` 1134/1134. Chi tiết đầy đủ:
      [docs/fix-log.md](../fix-log.md) hàng 2026-08-14 12:00 /
      [docs/fix-log/2026-08-14-todo-115-viewer-reconnect-unlimited.md](../fix-log/2026-08-14-todo-115-viewer-reconnect-unlimited.md).
