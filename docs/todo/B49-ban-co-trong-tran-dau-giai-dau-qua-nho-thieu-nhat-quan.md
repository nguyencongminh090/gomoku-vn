# #49. Bàn cờ trong trận đấu giải đấu (tournament match) quá nhỏ, kích thước không nhất quán với phòng chơi thường — cả Mobile lẫn PC

**Nguồn:** báo cáo người dùng kèm ảnh chụp màn hình, 2026-08-06.

## Hiện trạng đã xác nhận (đọc code, chưa sửa)

Ảnh chụp màn hình người dùng gửi thực ra là từ `client/tournament-detail-mockup.html`
(banner "Front-end mockup only" — file mockup tĩnh Phase 6, đã bị thay thế bởi trang
thật `client/tournament-match.html`). Bàn cờ trong file mockup dùng `.mock-board`
(`grid-template-columns: repeat(15, 26px)` — cố định 390px, không responsive) — đây
chỉ là hình minh hoạ thiết kế, không phải bug cần sửa vì không phải code đang chạy.

Tuy nhiên khi đọc trang thật (`tournament-match.html` + `client/css/tournament.css` +
`client/js/board.js`), có 2 điểm khiến bàn cờ trận đấu giải đấu **thực sự nhỏ hơn**
bàn cờ phòng chơi thường (`room.html`), tái hiện đúng cảm giác "board too small" mà
người dùng báo cáo dù không cùng file:

1. **`client/css/tournament.css:163`** — `.match-board-canvas-wrap { width: 100%;
   max-width: 640px; ... }`. Không có class tương đương nào giới hạn `max-width` cho
   bàn cờ ở `room.html` (`.board-canvas-wrap` gốc trong `room.css` không có
   `max-width`). Trong khi đó `client/js/board.js:193` (`BoardRenderer.resize()`) tính
   kích thước canvas lên tới trần **860px** trên desktop rộng — cùng một hàm
   `resize()` dùng chung cho cả hai trang (qua `window.addEventListener('resize', ...)`
   ở `tournament-match.js:171`). Kết quả: trên màn hình rộng, bàn cờ trận đấu giải đấu
   bị chặn ở 640px trong khi bàn cờ phòng thường có thể lên tới 860px — không nhất
   quán, và vì `.match-board-canvas-wrap`/`.board-area`/`.board-area-shell` không có
   `overflow: hidden` ở nhánh này (khác `room.css`'s `.board-area-inner`), phần canvas
   vượt quá 640px có thể tràn ra ngoài khung `.match-board-canvas-wrap` một cách không
   kiểm soát thay vì bị cắt gọn gàng — cần kiểm tra thực tế trên trình duyệt để xác
   nhận đúng hành vi tràn/co.

2. **Khoảng trống breakpoint 769–900px (tablet ngang / màn hình nhỏ)** —
   `tournament.css:151` chuyển `.match-shell` sang 1 cột (`grid-template-columns: 1fr`)
   ở `max-width: 900px`, nhưng phần CSS "full-bleed mobile" cho `.board-area-shell`/
   `.board-area` (bỏ padding/border, chiếm `calc(100% + 32px)`...) trong `room.css` chỉ
   kích hoạt ở `max-width: 768px`. Ở khoảng 769–900px, layout đã xuống 1 cột nhưng
   `.board-area-shell` vẫn giữ `height: calc(100vh - 76px)` và padding/border desktop
   — khả năng tạo khoảng trắng thừa quanh bàn cờ hoặc bàn cờ trông lệch/nhỏ bất
   thường trong dải độ rộng này. Cần kiểm tra trực tiếp trên trình duyệt ở vài mốc
   (768px, 800px, 900px) để xác nhận mức độ ảnh hưởng.

3. (Phụ, không phải nguyên nhân chính) — `tournament.css:150` cột phải cố định
   `300px` cho panel lịch sử nước đi, trong khi `room.css` dùng
   `clamp(320px, 28vw, 420px)` cho panel bên phải của phòng thường — không liên quan
   trực tiếp tới kích thước bàn cờ nhưng là một điểm không nhất quán UI đáng gộp sửa
   chung nếu động vào các class này.

## Việc cần làm khi triển khai fix

- Xác nhận trực tiếp trên trình duyệt (desktop rộng, tablet 769–900px, mobile ≤768px)
  hành vi thực tế trước khi sửa — phân tích ở trên chỉ dựa trên đọc source, chưa chạy
  live server + trận đấu thật để screenshot.
- Xem `docs/instruction/B49-...md` để biết hướng tiếp cận đề xuất và ranh giới không
  nên đụng.
