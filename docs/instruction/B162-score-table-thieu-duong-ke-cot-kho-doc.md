# B162 — Bảng điểm thiếu đường kẻ cột

**Phạm vi:** CHỈ CSS `.score-table`. Không sửa `renderScoreTable` trong
`client/js/room-ui.js`, không đổi cấu trúc `<table>` trong `room.html`.

**Cách làm:**
- `client/css/room.css` block `.score-table` (~369–387): thêm đường kẻ dọc giữa
  các cột — `th:not(:last-child), td:not(:last-child) { border-right: 1px solid
  var(--c-border-light); }`. KHÔNG đặt `border` quanh `.score-table` (yêu cầu
  "no border" = không viền ngoài).
- Tách header: `border-bottom` mảnh dưới `th` là được, nhưng không bắt buộc —
  ưu tiên đúng yêu cầu (kẻ cột) trước.
- `room-zen.css:559+`: kiểm bản zen. Nếu thiếu thì áp cùng pattern nhưng dùng
  token viền của zen (xem các rule `.score-table td` zen quanh đó, đã có
  `border-bottom` — thêm `border-right` cho đồng bộ).
- Mobile `room.css:913-914`: đảm bảo đường kẻ không làm vỡ layout ở font 10px.

**Pitfall:** `border-collapse: collapse` đang bật → `border-right` trên ô cuối +
`border-left` ô đầu sẽ tạo viền ngoài; dùng `:not(:last-child)` để tránh.

**Verify:** `?v=N` bump toàn `client/` + `grep -rn "?v=" client/*.html
client/js/*.js | grep -v mockup` cho đúng 1 giá trị. Browser thật: tab Bảng điểm
có tỉ số, xem bản thường + zen mode + mobile viewport.
