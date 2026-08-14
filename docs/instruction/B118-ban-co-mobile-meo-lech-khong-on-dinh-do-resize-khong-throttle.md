# B118 — Bàn cờ mobile méo/lệch, responsive không ổn định (TODO.md #118)

Nguồn: báo cáo người dùng kèm ảnh chụp Safari iOS thật (`play3cr.dpdns.org`, 2026-08-14).

## Bối cảnh

Điều tra ban đầu (CodeGraph + agent, đọc code tĩnh) chỉ ra 2 nghi vấn cộng dồn:
`.board-area-shell` dùng `100vh` thay vì `dvh`/`svh` (`room.css:58`, `room-zen.css:302,955`), và
`window.addEventListener('resize', ...)` ở `game-ui.js:113-114` gọi thẳng
`BoardRenderer.resize()` không debounce/throttle. Trên Safari iOS, thanh địa chỉ ẩn/hiện khi cuộn
bắn nhiều `resize` liên tiếp trong lúc đang animate — nếu `resize()` đọc `innerHeight` giữa chừng,
canvas bị "đóng băng" theo kích thước sai cho tới lần `resize()` kế tiếp.

## Người dùng không có thiết bị Safari iOS

Sau khi hỏi lại (2026-08-14), người dùng chốt: sửa phòng ngừa ngay dựa trên hành vi WebKit đã biết
rõ, thay vì chờ có thiết bị/dịch vụ cloud test. **Đã sửa** theo hướng này — xem `docs/todo/B118-*.md`
mục "Sửa đã áp dụng" cho chi tiết dòng/file. Ghi rõ trong mọi báo cáo là "chưa xác nhận trên thiết bị
thật", không báo cáo là "đã fix xác nhận" — người dùng gốc (báo cáo ảnh) sẽ xác nhận sau khi deploy.

Nếu tương lai cần điều tra tiếp (báo cáo lại vẫn còn lỗi): đọc
`docs/fix-log/2026-08-13-zen-room-board-sizing-and-chat-input.md` trước — cụm `resize()`/đo shell
này đã có tiền lệ bug thật (canvas 825×875 không vuông), và lần sửa đó đã thêm nhiều điểm gọi
`resize()` khác nhau không đồng bộ (`setTimeout(180/400)`, `requestAnimationFrame`,
`refitBoardAfterDrawer()` ở `room.js:119-127,170-184`) — các điểm này KHÔNG được gate bởi fix B118
(chỉ gate đúng 1 điểm: `window resize` listener ở `game-ui.js:113`). Nếu vẫn méo, kiểm tra các điểm
gọi khác trước khi mở rộng cơ chế debounce.

Cũng đọc B90 (`docs/instruction.md`) — tiền lệ đã từng bỏ một lời gọi `resize()` tự động
(`requestAnimationFrame` trong `updateBoardState()` của `tournament-match.js`) vì gây tự động
scroll. B118 không đụng `tournament-match.js` (không nằm trong báo cáo gốc — chỉ có ảnh chụp
`room.html`) trừ khi người dùng xác nhận bug cũng xảy ra ở đó.

## Hướng mở rộng nếu cần (chưa làm — chỉ nếu người dùng xác nhận vẫn còn lỗi sau deploy)

- `visualViewport.addEventListener('resize', ...)` thay cho `window resize` thô trên mobile — tín
  hiệu đáng tin hơn cho ẩn/hiện toolbar Safari, nhưng đừng thêm ngay nếu chưa cần (tránh phức tạp
  hoá không cần thiết).
- Gate thêm các điểm gọi `resize()` khác trong `room.js`/`room-socket.js` nếu xác định chúng cũng
  liên quan.

## Ranh giới — đừng làm

- Đừng đụng `tournament-match.js`/`tournament-match.html` trừ khi có báo cáo/xác nhận riêng (báo
  cáo gốc chỉ có ảnh chụp `room.html`).
- Đừng port "focus mode" hay đổi cơ chế scale-to-fit của bàn cờ để "sửa" bug này (cùng loại cảnh
  báo với B90) — chỉ sửa đúng cơ chế đo/resize.
- Đừng gộp fix này với B90 dù cùng họ vấn đề — 2 file khác nhau (`room.html` vs
  `tournament-match.html`), 2 báo cáo người dùng khác nhau.

## Trạng thái unit test

Không có Jest cho `client/js/`. Verify bằng Playwright hoặc thao tác tay trên trình duyệt/thiết bị
thật — ưu tiên Safari iOS thật hoặc simulator vì bug đặc thù engine đó, Chromium DevTools mobile
emulation không mô phỏng đúng hành vi toolbar `100vh`.
