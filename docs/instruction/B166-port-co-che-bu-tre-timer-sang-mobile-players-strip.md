# B166 — Hướng dẫn thực thi

**Điều kiện tiên quyết:** B165 đã xong và cơ chế bù trễ (half-RTT / ease) đã chốt. Viết chi tiết
hàm ở đây **sau khi** biết B165 chốt cơ chế nào — đừng đoán trước.

## Ranh giới

- **Chỉ nhân bản cơ chế B165 xuống hai hàm mobile** — không thiết kế cơ chế bù trễ khác.
- Hai điểm sửa: `renderStripPlayer` (`client/js/room-ui.js:236`) và `updateStripTimers()`
  (`client/js/room-ui.js:330`).
- `predictedTurn` overlay giữ nguyên nguyên lý B155: render-only, **không ghi `gameState`**.
- Không đụng desktop turn-bar (đã xong ở B155/B165).

## Pitfalls

- `updateStripTimers` repaint mỗi giây — đảm bảo đọc cùng nguồn giá trị đã-bù-trễ với
  `game-ui.js` `renderTimers` (tách helper chung nếu cần, đừng copy công thức lệch nhau).
- `renderStripPlayer` có trạng thái `players-strip__track--idle` — khi `predictedTurn.active`, người
  vừa đi phải chuyển sang "not my turn" ngay, đối thủ sang "turn".
- Bump `?v=N` toàn `client/`.

## Test

- Mở rộng test client cho `room-ui` (`updateStripTimers`/`renderStripPlayer`): `predictedTurn.active`
  → strip đổi turn ngay; giá trị số khớp desktop `renderTimers` với cùng `halfRttMs` mock.
- `npm test` xanh.
