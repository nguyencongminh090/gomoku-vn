# Phần B #7. Room quota theo IP (review 3.2) — `RoomManager.createRoom()`, đếm số

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


7. ~~**Room quota theo IP** (review 3.2) — `RoomManager.createRoom()`, đếm số
   phòng theo IP người tạo, chặn khi vượt ngưỡng (không phải 1).~~
   **✅ ĐÃ XONG** (2026-08-02, commit `3abe3a3`, merge `972f695`) — chọn hướng
   (a) của `instruction.md` §B7 (quota theo IP), không chọn (b) cấm guest tạo
   phòng. Thêm `MAX_ROOMS_PER_IP = 3`, room lưu `creatorIp`, `LobbyHandler`
   truyền `socket.handshake.address`. **Không dùng bộ đếm tăng/giảm** — đếm
   trực tiếp bằng cách quét `this.rooms` lúc tạo, nên **không có đường decrement
   nào để quên** (đúng rủi ro mà mục này cảnh báo): phòng bị huỷ là biến khỏi
   map, đếm lại là đúng. Test: mở rộng `RoomManager.test.js` 4 → 14 case (cover
   cả 3 đường huỷ + case xoá thẳng khỏi map + `creatorIp` không lộ ra client);
   mutation-check: bỏ khối quota thì 4/14 đỏ. `npm test` 203/203 xanh.
   **Đã kiểm bằng browser thật:** 3 phòng đầu tạo được, phòng thứ 4 bị từ chối
   kèm toast tiếng Việt, sau khi 1 phòng đóng thì tạo được tiếp.
   **Hạn chế đã biết, đã sửa (2026-08-02, xem mục #30):** sau reverse
   proxy/tunnel thì mọi kết nối từng mang IP của proxy → gộp chung 1 quota;
   `getClientIp()` (`server/socket/state.js`) đã sửa việc này.
   Chi tiết: `docs/fix-log.md`.
