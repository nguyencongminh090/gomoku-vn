# B104 — Hướng dẫn thực thi

Hai lỗi độc lập cộng dồn, sửa cả hai, không sửa riêng một cái rồi coi là xong:

1. **`client/js/board.js`'s `_onTouchEnd`**: `e.preventDefault()` nằm SAU guard
   `!interactive || !isMyTurn || !onCellClick` nên không chạy khi không phải lượt mình — dời
   `preventDefault()` lên dòng đầu tiên của hàm, TRƯỚC guard. An toàn vì `preventDefault()` trên
   `touchend` chỉ chặn synthetic click + scroll của trình duyệt, không chặn logic JS phía sau.
2. **`client/css/game.css`'s `.board-canvas-wrap canvas`**: thiếu `touch-action: none` (so với
   `#match-canvas` trong `tournament.css` đã có) — thêm vào, để trình duyệt giao hẳn touch event
   cho JS thay vì tự quyết định pan/scroll trước khi JS kịp chạy.

Không đụng logic double-tap/click-mode hiện có trong `_handleCellSelect` — bug này chỉ ở tầng
browser default behavior, không phải logic chọn ô.

Test: viết unit test jsdom cho `_onTouchEnd` (client-side ĐÃ có hạ tầng test qua `client/tests/`,
không phải "chưa có" như mặc định trong CLAUDE.md — kiểm tra `client/tests/*.test.js` trước khi kết
luận không viết được test) khẳng định `preventDefault` luôn được gọi bất kể state. Xác minh test
bắt được lỗi bằng cách chạy lại trên code cũ trước khi merge.
