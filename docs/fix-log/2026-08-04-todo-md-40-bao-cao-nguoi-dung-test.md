# Fix log entry — 2026-08-04 05:00

## Prompt

TODO.md #40 (báo cáo người dùng test thủ công): dán link `room.html` trần — không `?id=` và không phải vừa tạo/join từ sảnh chờ (không có `sessionStorage` `gvn_room_intent`) — khiến `processRoomIntent()` ([client/js/room-socket.js](client/js/room-socket.js)) không emit `room:create`/`room:join` nào cả, `room:joined` không bao giờ tới, và `#room-entry-overlay` (mặc định hiện, chỉ `hideEntryOverlay()` mới ẩn được, hàm này chỉ gọi từ handler `room:joined`) đứng im vĩnh viễn — đúng như "⏳ Đang vào phòng..." không bao giờ hết.

## Action

Thêm nhánh `else` trong `processRoomIntent()`: khi cả intent lẫn `?id=` đều không có, `window.location.href = 'index.html'` redirect thẳng về sảnh chờ thay vì để nguyên overlay treo. Đây là toàn bộ phạm vi sửa theo đúng `instruction.md` §40 — không đụng `#room-entry-overlay`, `hideEntryOverlay()`, hay 2 nhánh `create`/`join` phía trên. Bump `?v=41` → `?v=42` (4 file HTML + 3 file entry JS).

## Decision

Không thêm toast trước khi redirect — người dùng chọn giữ tối giản đúng nội dung TODO #40 gốc thay vì thêm UI mới (hỏi trực tiếp trước khi làm, xem hội thoại). Redirect ngay lập tức, không delay/setTimeout — khác các case `room:kicked`/`room:destroyed` (có toast + 1.5s delay) vì đây không phải lỗi từ server trả về giữa phiên, mà là điều kiện phát hiện được ngay từ đầu trang, không có gì cần người dùng đọc trước khi rời trang.

## Summary output

`client/js/` chưa có Jest — file mới `e2e/room-no-id-fallback.spec.ts` (Playwright, 2 case): case (1) bare `room.html` không query string → assert redirect đúng `index.html` trong 5s; case (2) hồi quy — `room.html?id=<roomId>` hợp lệ (tạo phòng thật qua host, guest join bằng đúng roomId lấy từ URL) vẫn vào phòng bình thường, không bị bounce nhầm. Mutation-check: `git stash` riêng `room-socket.js`, chạy lại case (1) → tái hiện đúng bug gốc (`page.waitForURL` timeout 5000ms, không bao giờ redirect), khôi phục → xanh lại. `npm test` (server-side, không đổi gì) vẫn 385/385 xanh — đây là fix thuần `client/js/`. **Đã kiểm bằng browser thật qua Playwright** trên server dev thật (cổng 3000, guest auth thật qua `POST /api/auth/guest`) — cả 2 case pass ổn định.
