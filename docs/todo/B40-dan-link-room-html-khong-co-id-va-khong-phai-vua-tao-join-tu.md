# Phần B #40. Dán link `room.html` không có `?id=` (và không phải vừa tạo/join từ

**Nguồn:** báo cáo người dùng — "Reconnect Logic is not very well" (2026-08-04)


40. ~~**Dán link `room.html` không có `?id=` (và không phải vừa tạo/join từ
    sảnh chờ) → màn hình đứng im ở overlay "⏳ Đang vào phòng..." vĩnh viễn,
    không có fallback về sảnh chờ.**~~
    **✅ ĐÃ XONG (2026-08-04)** — thêm nhánh `else` trong `processRoomIntent()`
    (`client/js/room-socket.js`): khi không có `sessionStorage` intent lẫn
    `?id=`, redirect thẳng `index.html` (không toast, theo đúng lựa chọn tối
    giản người dùng chốt) thay vì đứng im ở `#room-entry-overlay`. Đúng phạm
    vi `instruction.md` §40 — không đụng `#room-entry-overlay`,
    `hideEntryOverlay()`, hay nhánh `create`/`join` phía trên. Bump `?v=41` →
    `?v=42` (đủ 4 HTML + 3 entry JS).
    Test: `client/js/` chưa có Jest — file mới `e2e/room-no-id-fallback.spec.ts`
    (Playwright, 2 case): (1) bare `room.html` không query string → redirect
    đúng `index.html` trong 5s; (2) case hồi quy — `room.html?id=<roomId>`
    hợp lệ vẫn vào phòng bình thường, không bị bounce. Mutation-check: stash
    riêng `room-socket.js` → case (1) timeout đúng như bug gốc (đứng ở overlay,
    không bao giờ redirect), khôi phục → xanh lại. `npm test` (server-side,
    không đổi) vẫn 385/385 xanh — fix thuần client.
    **Đã kiểm bằng browser thật qua Playwright** (không chỉ đọc code) — chạy
    trên server dev thật ở cổng 3000, cả 2 case pass ổn định.

    ~~Đọc `instruction.md` §40 trước khi
    làm.~~
    - **Nguyên nhân:** `processRoomIntent()` (`client/js/room-socket.js:377`)
      chỉ emit `room:create`/`room:join` khi có `sessionStorage`
      `gvn_room_intent` HOẶC query param `?id=`. Nếu cả 2 đều không có (ví
      dụ người dùng copy-paste URL trần `.../room.html` rồi dán cho người
      khác, hoặc gõ tay), hàm không emit gì cả và cũng không redirect.
    - `#room-entry-overlay` (`client/room.html:45`) hiển thị mặc định
      (`class="game-overlay visible"`) và chỉ được ẩn bởi
      `hideEntryOverlay()` — hàm này chỉ được gọi từ handler `room:joined`
      (`client/js/room-socket.js:40-41`). Event đó không bao giờ tới →
      overlay giữ nguyên vĩnh viễn, đúng như báo cáo "freeze".
    - **Đánh giá hiệu quả/an toàn:** an toàn để sửa — chỉ thêm 1 nhánh
      `else` fallback trong `processRoomIntent()` (không có intent và không
      có `id` → redirect `index.html`), không đụng luồng join/create hiện
      có; hiệu quả cao vì đây là lỗi UX rõ ràng, dễ tái hiện 100%.
    - **Trạng thái:** mới phát hiện, ghi lại phân tích — Sequence UML
      (mermaid) đã vẽ, chưa sửa code.
    - **Test dự kiến:** `client/js/` hiện chưa có hạ tầng Jest/unit test
      (theo rule "Bug-fix workflow" trong `CLAUDE.md`, nói rõ trường hợp
      này thay vì bỏ qua) — verify bằng Playwright (`e2e/`) hoặc chạy app
      thật: mở `room.html` không tham số, xác nhận redirect về
      `index.html` thay vì đứng im ở overlay.
