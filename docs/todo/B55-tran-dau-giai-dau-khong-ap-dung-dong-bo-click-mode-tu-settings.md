# #55. Trận đấu giải đấu không áp dụng/đồng bộ click mode từ Cài đặt — khác hành vi với phòng chơi thường

**Nguồn:** báo cáo người dùng, 2026-08-07 — "Inside of Tournament-room, user cannot set UI as Room,
Click mode not work / not sync with user settings."

## Nguyên nhân đã xác nhận (đọc code, chưa sửa)

So sánh trực tiếp `room.html`/`game-ui.js` (hoạt động đúng) với `tournament-match.html`/
`tournament-match.js` (đang lỗi):

- **`room.js:82-85`** đọc `localStorage.getItem('gomoku_click_mode')` vào `RoomState.clickMode` lúc
  khởi tạo trang.
- **`game-ui.js:96`** truyền `clickMode: st.clickMode` khi khởi tạo `BoardRenderer` — đây là cách
  `room.html` áp dụng đúng lựa chọn single/double-click của người dùng.
- **`room-ui.js:560`** có listener `window.addEventListener('clickmodechange', ...)` để đồng bộ
  ngay khi người dùng đổi setting lúc đang ở trong phòng (không cần load lại trang) — khớp với
  `settings-panel.js:74-78`'s `setClickMode()` phát sự kiện `clickmodechange` mỗi khi đổi.
- **`tournament-match.js`'s `initBoard()`** khởi tạo `BoardRenderer` **không truyền `clickMode`
  gì cả** — không đọc `localStorage`, không có state tương đương `RoomState.clickMode`.
- **`board.js:50`**: `this.clickMode = opts.clickMode || 'double'` — khi không truyền, `BoardRenderer`
  tự rơi về mặc định cứng `'double'`.
- **`tournament-match.js` không có listener `clickmodechange` nào** — nên dù người dùng mở panel
  Cài đặt (gear icon, `settings-panel.js` vẫn được load qua `tournament-match-entry.js`) và đổi
  sang "single", hành vi trên bàn cờ trận đấu giải đấu **không đổi gì cả**, luôn cố định ở chế độ
  double-click — đúng như báo cáo "Click mode not work / not sync".

## Việc cần làm khi triển khai fix

- Thêm đọc `localStorage.getItem('gomoku_click_mode')` (hoặc tái dùng
  `settings-panel.js`'s `getClickMode()` đã export sẵn logic này — ưu tiên tái dùng thay vì chép
  lại literal `'gomoku_click_mode'` lần thứ 3 trong codebase) khi khởi tạo `BoardRenderer` trong
  `tournament-match.js`'s `initBoard()`, truyền vào `clickMode: ...` giống `game-ui.js:96`.
- Thêm listener `window.addEventListener('clickmodechange', ...)` trong `tournament-match.js` để
  đồng bộ sống, cùng cơ chế `room-ui.js:560` đã dùng — cập nhật `boardRenderer.clickMode` (xem
  `board.js` có setter/method nào cho việc đổi mode runtime chưa, hay cần thêm).
- Đây là bug hẹp, đúng 1 điểm thiếu sót khi B48/B50 dựng `tournament-match.js` (không tái dùng lại
  đúng phần khởi tạo `BoardRenderer` của `game-ui.js`) — không phải thiết kế mới, không cần quay
  lại `features/` để thảo luận.
