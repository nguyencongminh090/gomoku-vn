# Phần B #80. Đồng hồ trận đấu giải đấu thiếu hiệu ứng nhấp nháy khi còn ≤10s (chỉ có phòng thường)

**Nguồn:** báo cáo người dùng — "no time alert for 10s left in tournament room (normal room has
it)" (2026-08-09). Xác nhận bằng cách đọc `room-socket.js`, `tournament-match.js`, `game.css`,
`tournament.css`.

## Vấn đề đã xác nhận

Không phải thiếu hẳn cảnh báo — cơ chế cảnh báo (đổi màu đỏ + beep âm thanh mỗi giây) đã tồn tại
đồng nhất ở cả 2 nơi từ `TODO.md #74` (`tournament-match.js:498-501` port đúng logic
`room-socket.js:274-285`). Gap thật sự là **hiệu ứng nhấp nháy (pulse animation)**:

- Phòng thường: `.turn-bar__timer--low` (`game.css:102-105`) có
  `animation: timer-pulse 0.6s ease-in-out infinite alternate;` — số giây nhấp nháy liên tục khi
  ≤10s.
- Trận đấu giải đấu: `.match-clock__time.is-low` (`tournament.css:202`, trước khi sửa) chỉ đổi màu
  `color: var(--c-error)`, không có animation nào — số giây đứng yên, chỉ đỏ tĩnh.

Kết quả: cảnh báo tồn tại nhưng "nhẹ" hơn hẳn ở trận đấu giải đấu (không nhấp nháy, chỉ còn dựa vào
beep — dễ bị bỏ lỡ nếu người dùng tắt tiếng hoặc không chú ý tab), khớp với báo cáo "không có cảnh
báo".

## Việc cần làm

Thêm animation `timer-pulse` (dùng lại keyframe có sẵn từ `game.css`, đã load trước
`tournament.css` trong `tournament-match.html`) vào `.match-clock__time.is-low`.

## Đánh giá hiệu quả / an toàn

Hiệu quả cao, an toàn cao — thêm 1 dòng CSS, tái dùng keyframe đã có sẵn, không đổi logic JS/state
nào.

## Trạng thái

✅ ĐÃ XONG (2026-08-09, branch `fix/tournament-clock-low-time-pulse` trên `dev`).

**Đã làm:** thêm `animation: timer-pulse 0.6s ease-in-out infinite alternate;` vào
`.match-clock__time.is-low` (`client/css/tournament.css:202`). Bump `?v=90` → `?v=91` theo
`CLAUDE.md`, verify bằng grep còn đúng 1 giá trị. Chi tiết đầy đủ trong
`docs/fix-log/2026-08-09-todo-80-tournament-clock-low-time-pulse.md`.
