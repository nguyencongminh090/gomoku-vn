# Phần B #1. Restart-hang: thêm nhánh `else` (review 5.1) — `SocketHandler.js:113-125`,

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


1. ~~**Restart-hang: thêm nhánh `else`** (review 5.1) — `SocketHandler.js:113-125`,
   emit `room:destroyed`/`room:left` khi `!existingRoom` thay vì im lặng.~~
   **✅ ĐÃ XONG** (2026-08-01, commit `b35614e`, merge `3fcb619`) — nhánh `else`
   emit `room:destroyed`; client `room-socket.js` đã có sẵn handler (toast +
   redirect về `index.html`), không phải sửa client. Test: thêm describe mới
   "connection with no surviving room (restart-hang)" (3 case) vào
   `SocketHandler.test.js`; `npm test` 148/148 xanh. Chi tiết: `docs/fix-log.md`.

   **Đính chính (2026-08-02, commit `5b3a9f5`, merge `8678d2e`):** bản đầu gây
   **regression** — nhánh `else` bắn `room:destroyed` cho *mọi* kết nối chưa ở
   phòng, mà trang room mở socket **trước** khi gửi `room:create`/`room:join`,
   nên tạo phòng xong bị đá về sảnh và phòng vừa tạo bị huỷ (rỗng). Đã sửa:
   chỉ bắn khi `socket.handshake.auth.reconnect` (client set cờ này từ
   `socket.io.on('reconnect_attempt')` trong `socket-client.js`). Bump
   `?v=27` → `?v=28`. Thêm 2 test regression; `npm test` 174/174 xanh. Đã kiểm
   bằng browser thật (Playwright): tạo phòng OK, và kịch bản restart server
   thật cho thấy client quay về sảnh (bản `0079f8f` thì treo vĩnh viễn).
