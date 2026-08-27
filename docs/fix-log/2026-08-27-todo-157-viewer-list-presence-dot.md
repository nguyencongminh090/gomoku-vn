# Fix log entry — 2026-08-27 05:50

## Prompt

Người dùng: "Do #157" — implement `TODO.md #157` (đã filed trước đó cùng ngày từ báo cáo: "Scope:
Room, User Connect (Player, Viewer), Online List, Reconnection. User out of room but tab-user still
display them name in room... but the list must be truthful.").

## Action

Xác nhận lại bug tồn tại trên cả `main` (`git show main:client/js/room-ui.js`) trước khi chọn
branch base — theo tiền lệ B92, branch off `main` vì code không phải dev-only.

Sửa `client/js/room-ui.js`'s `renderUsersList()`: thêm nhánh đọc `g.presence`, gọi lại
`renderStatusDot(g)` (hàm có sẵn, dùng chung với player ngồi ghế) khi presence là
`'disconnected'`/`'away'`; không hiện chấm khi bình thường. Bọc tên+chấm trong `.user-name-group`
mới (CSS `room.css`) để không phá layout `space-between` 2 cột của `.users-list li`. Bump
`?v=138→139` toàn repo.

Viết 4 test mới `client/tests/room-ui-viewer-presence-dot.test.js` theo khuôn mẫu jsdom đã có
(B134's `room-zen-drawer-collapsed-recovery.test.js`) — gặp bẫy UMD `escape-utils.js` không tự gắn
`global.EscapeUtils` dưới Jest/CommonJS, phải gán thủ công. Mutation-kill xác nhận 3/4 fail khi bỏ
fix ra.

## Decision

- Không dùng nhãn "online"/"connected" mới — giữ nguyên tắc "không chấm = bình thường" đã có sẵn ở
  `renderStatusDot()`, tránh thêm state hiển thị không cần thiết.
- Không mở lại `#115` (viewer-ma nằm lại `room.users` vô thời hạn) — đó là quyết định đã chốt,
  ngoài phạm vi báo cáo lần này (chỉ về hiển thị, không phải dọn dẹp membership).
- Tách `#158` (đếm `userCount` ở sảnh đếm luôn viewer-ma) ra khỏi lần sửa này — cần hỏi người dùng
  công thức đếm trước, không tự quyết.

## Summary output

`fix/viewer-list-presence-indicator` off `main`. `npm test` 1151/1151 (1147 cũ + 4 mới). `?v=138→139`.
Chi tiết: [docs/todo/B157-viewer-list-khong-hien-thi-trang-thai-mat-ket-noi.md](../todo/B157-viewer-list-khong-hien-thi-trang-thai-mat-ket-noi.md).
