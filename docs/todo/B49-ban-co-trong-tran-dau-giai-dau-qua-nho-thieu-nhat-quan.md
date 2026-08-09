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

## Trạng thái: đã xong (2026-08-06)

Áp dụng 2 phần đề xuất trong `instruction.md` (bỏ `max-width: 640px`, đồng bộ breakpoint
900px→768px). Kiểm chứng bằng trình duyệt thật (bắt buộc theo `instruction.md`) — dựng
một trận đấu giải đấu thật end-to-end qua `socket.io-client` (tạo giải đấu → đăng ký 2
guest → start → report/confirm/ready → `InProgress`), rồi mở `tournament-match.html`
thật bằng Playwright/Chromium với token phiên hợp lệ — phát hiện 2 phần sửa trên **chưa
đủ**: bàn cờ vẫn cố định ~246×246px ở cả 1440px lẫn 800px.

Nguyên nhân gốc thứ 3, quan trọng hơn 2 điểm đã nêu: `.board-area-shell` là con trực
tiếp của `.match-board-wrap` (`display:flex; flex-direction:column; align-items:center`).
Ở `room.html`, `.board-area-shell` tương đương lại là grid item của `.room`
(`display:grid`), có `align-self:stretch` mặc định nên nhận đủ chiều rộng cột để
`resize()` tính toán. Trong `.match-board-wrap`, `align-items:center` khiến
`.board-area-shell` co lại theo kích thước nội dung (kích thước canvas mặc định rất
nhỏ) — `resize()` đọc lại `clientWidth` nhỏ đó và bàn cờ giữ nguyên nhỏ bất kể màn hình
rộng bao nhiêu. Sửa bằng một rule phạm vi hẹp:
`.match-board-wrap > .board-area-shell { align-self: stretch; width: 100%; }` (không
đụng `align-items` chung của `.match-board-wrap` để `.match-clocks`/`.match-actions`
vẫn được căn giữa như cũ).

Kết quả đo được (canvas trước → sau, cùng trận đấu thật):
- Desktop 1440px: 246px → **492px**
- Tablet 800px: 246px → **408px**
- Mobile 390px: 382px → 358px (đã đúng theo width từ trước, thay đổi nhỏ do đồng bộ
  breakpoint)
- Quét 769/800/850/900px: 377/408/458/508px — không còn khoảng trống/gãy layout.

Không đụng `board.js`'s `resize()` (đúng ranh giới trong `instruction.md`) và không gộp
sửa mục 3 (cột phải 300px vs `clamp(...)`) vì không đụng chung dòng CSS nào với 3 thay
đổi trên. Không viết unit test (bug CSS/layout thuần, không có hạ tầng test layout —
đúng theo `instruction.md`). `npm test`: 806/806 pass (không đổi, chỉ sửa CSS). Bump
cache-bust `?v=63 → ?v=64`. Chi tiết đầy đủ:
[docs/fix-log/2026-08-06-todo-49-tournament-match-board-too-small.md](../fix-log/2026-08-06-todo-49-tournament-match-board-too-small.md).
