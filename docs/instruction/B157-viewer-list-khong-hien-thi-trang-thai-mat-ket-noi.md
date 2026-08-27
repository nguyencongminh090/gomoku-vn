# B157 — Danh sách khán giả không hiển thị trạng thái mất kết nối

Hướng dẫn thực thi cho TODO.md #157 (đã làm 2026-08-27).

## Cách đã làm

- Sửa duy nhất `renderUsersList()` trong `client/js/room-ui.js` — thêm nhánh đọc `g.presence`, gọi
  lại thẳng `renderStatusDot(g)` (không viết hàm mới) khi `g.presence` là `'disconnected'` hoặc
  `'away'`; guest bình thường không hiện chấm. `renderStatusDot()`/`playerStatusInfo()` an toàn để
  tái dùng cho guest vì nhánh cuối của `playerStatusInfo()` (phụ thuộc `player.ready`, khái niệm
  không áp dụng cho khán giả) không bao giờ được chạy tới — guest chỉ gọi hàm này khi đã chắc
  presence là 1 trong 2 giá trị đầu.
- Thêm `.user-name-group` (flex, `gap: 5px`) trong `room.css` để bọc tên + chấm — `.users-list li`
  vốn dùng `justify-content: space-between` cho đúng 2 phần tử (tên | nút kick); thả chấm làm con
  thứ 3 trực tiếp sẽ phá cách canh đó.
- Bump `?v=138→139` toàn repo (đụng `client/css/room.css` + `client/js/room-ui.js`).

## Nhánh và test

- Bug tồn tại trên cả `main` (đã xác nhận bằng `git show main:client/js/room-ui.js` trước khi chọn
  base) ⇒ branch `fix/viewer-list-presence-indicator` off `main`, không phải `dev`, theo đúng tiền
  lệ B92 ("bug này có trên cả `main` nên branch off `main`, không off `dev`").
- `client/js/` CÓ hạ tầng test jsdom (tiền lệ `client/tests/room-zen-drawer-collapsed-recovery.
  test.js` của B134) — không bỏ qua unit test. Viết `client/tests/room-ui-viewer-presence-dot.
  test.js` theo đúng khuôn mẫu: đọc `<body>` thật từ `client/room.html`, `jest.resetModules()` +
  `require('../js/room-ui.js')` lại cho mỗi test.
- **Bẫy cụ thể gặp phải:** `escape-utils.js` là UMD, `require()` dưới Jest/CommonJS đi nhánh
  `module.exports` chứ không tự gắn vào `global.EscapeUtils` (nhánh đó chỉ chạy khi không có
  `module` — tức trình duyệt thật). Phải gán thủ công `window.EscapeUtils =
  require('../js/escape-utils.js')` trước khi `require('../js/room-ui.js')`, nếu không
  `room-ui.js:61`'s `global.EscapeUtils.escapeAttr` ném `TypeError`.
- Mutation-kill: `git stash` chỉ 2 file `room-ui.js`/`room.css`, chạy lại 4 test — 3/4 fail đúng như
  kỳ vọng (test "guest bình thường không có chấm" vẫn pass vì đó là hành vi cũ cũng đúng).

## Phạm vi KHÔNG làm

- Không đụng `TODO.md #115` (viewer-ma nằm lại `room.users` vô thời hạn) — hành vi đã chốt, task
  này chỉ sửa hiển thị.
- Không đụng `DisconnectHandler.js`/`RoomManager.js` phía server — dữ liệu `presence` đã đúng.
- Không thêm nhãn "online"/"connected" mới trong i18n — quyết định giữ nguyên tắc "không chấm =
  bình thường" của `renderStatusDot()` gốc thay vì thêm trạng thái hiển thị mới.
- Không đụng `TODO.md #158` (đếm `userCount` ở sảnh) — việc khác, đang chờ người dùng chọn công
  thức đếm.

Xem báo cáo gốc:
[docs/todo/B157-viewer-list-khong-hien-thi-trang-thai-mat-ket-noi.md](../todo/B157-viewer-list-khong-hien-thi-trang-thai-mat-ket-noi.md).
