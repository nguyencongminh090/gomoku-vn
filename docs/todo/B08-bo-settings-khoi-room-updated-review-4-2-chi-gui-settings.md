# Phần B #8. Bỏ `settings` khỏi `room:updated` (review 4.2) — chỉ gửi `settings`

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


8. ~~**Bỏ `settings` khỏi `room:updated`** (review 4.2) — chỉ gửi `settings`
   khi thực sự đổi.~~
   **✅ ĐÃ XONG** (2026-08-02, commit `09a6de1`, merge `3f01271`) — thêm
   `RoomManager.serializeRoomUpdate()` (= `serializeRoom` bỏ `settings`), đổi
   **đủ 17/17 điểm emit**, trừ đúng 1 điểm ở handler `room:settings` (chỗ duy
   nhất settings thật sự đổi). Client `room-socket.js` chuyển sang **merge**
   thay vì replace — **bắt buộc**, vì `room-ui.js:315` và `game-ui.js:62` đọc
   `roomData.settings` **không** optional-chain (đúng rủi ro mục này cảnh báo),
   replace là throw ngay update đầu tiên. Bump `?v=28` → `?v=29`.
   Test: `RoomManager.test.js` 14 → 20 case, trong đó có **quét source** đếm
   đủ 17 điểm emit và bắt buộc 16 dùng `serializeRoomUpdate` — đây mới là thứ
   chặn được rủi ro "sót 1 điểm"; mutation-check: đổi 1 điểm về `serializeRoom`
   thì test đỏ. `npm test` 209/209 xanh. **Đã kiểm browser thật** (6 guest
   trong 1 phòng): settings sống sót qua `room:updated`, đổi board size 17→19
   thì cả 2 phía cập nhật, 0 lỗi JS. **Đo thật:** 809B/bản × 6 người = 4854B
   mỗi hành động, so với 5898B trước — **giảm 17.7%**, càng đông càng lợi
   (≈3480B/hành động ở 20 người). Chưa làm phần delta "user X đổi slot"
   (`instruction.md` §B8 ghi rõ đây là bước tuỳ chọn). Chi tiết: `docs/fix-log.md`.

   **✅ Phần delta "xa hơn" cũng đã làm xong (2026-08-03)** — loại hẳn độ phức
   tạp O(n²) còn lại (không chỉ giảm hằng số như bản trên): thêm
   `broadcastRoomUpdate(io, room[, opts])` trong `server/socket/state.js`,
   diff `users[]` thành `{upserts, removed}` theo từng người (chỉ user nào
   thật sự đổi field mới vào `upserts`, kể cả đổi `role` do host handover) và
   `scoreTable` chỉ gửi khi thật sự đổi — cùng kỹ thuật diff-tại-lúc-phát đã
   dùng cho `lobby:patch` (mục 9), áp dụng thêm cho `room:updated`. Cả **17/17
   điểm gọi** đổi sang `broadcastRoomUpdate` (điểm settings dùng
   `{ settings: true }`). Client `room-socket.js` merge `users` theo `userId`
   (Map, giống `lobby.js`) thay vì gán thẳng cả mảng. Thêm
   `clearRoomUpdateSnapshot(roomId)` gọi từ sự kiện `room_destroyed`
   (`SocketHandler.js`) để không rò rỉ Map theo thời gian.
   Test: file mới `server/tests/room-update-delta.test.js` (13 case: upsert
   đầu tiên, không đổi thì bỏ hẳn `users`, chỉ đúng 1 user đổi thì chỉ user đó
   vào `upserts`, rời phòng vào `removed`, host handover đổi role cả 2 phía,
   2 phòng diff độc lập nhau, `scoreTable` tương tự, field vô hướng luôn gửi,
   `settings` chỉ khi yêu cầu, `clearRoomUpdateSnapshot` reset đúng baseline);
   cập nhật lại test guard "17 điểm emit" trong `RoomManager.test.js` (đếm
   `broadcastRoomUpdate(io` thay vì `serializeRoomUpdate(` trực tiếp — điểm
   emit thô giờ chỉ còn đúng 1 chỗ, bên trong `broadcastRoomUpdate`).
   Mutation-check: revert `state.js` → cả 13 test đỏ (function không tồn tại);
   mutation tinh hơn (bỏ điều kiện diff, luôn gửi full `users`) → đúng 3/13
   test đỏ (những test kiểm tra "bỏ hẳn khi không đổi"), không phải toàn bộ —
   xác nhận test bắt đúng hành vi chứ không chỉ bắt "hàm có tồn tại không".
   `npm test`: 313/313 xanh (+13 case). Bump `?v=36` → `?v=37`.
   **Đã kiểm bằng browser thật** (Playwright, không phải chỉ tin unit test):
   chạy lại **toàn bộ 18 file spec `e2e/*.spec.ts`** sau khi restart server
   dev (code server không hot-reload), từng file/nhóm file riêng để tránh
   cạn quota `MAX_ROOMS_PER_IP=3` dùng chung 1 IP loopback giữa các lần chạy
   — **tất cả pass**, gồm cả các luồng đụng trực tiếp `room:updated`: sit/
   stand/ready/kick/leave/disconnect-resume/host-transfer/spectator-join/
   swap2/resign/draw-offer. **Bài học phương pháp:** lần đầu chạy dồn cả 18
   file cùng lúc ra hàng loạt lỗi giả `#room-id-nav` rỗng — không phải do code
   sai, mà do (1) server dev đang chạy từ trước phiên này, còn giữ code cũ
   trong bộ nhớ (client là static file đọc lại mỗi request, còn server-side
   code Node cache theo tiến trình, cần restart) và (2) nhiều spec tạo phòng
   liên tiếp trong cùng 1 tiến trình server dùng chung 1 IP cộng dồn vượt
   `MAX_ROOMS_PER_IP=3` — đúng giới hạn đã biết từ `scripts/capacity-test/
   README.md`, không phải bug mới.
