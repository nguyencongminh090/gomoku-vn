# B90 — Trang trận đấu giải đấu thỉnh thoảng tự động scroll khi click bàn cờ (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #90 (2026-08-09).

## Bối cảnh kỹ thuật (đã xác nhận qua code, không suy diễn)

`client/js/tournament-match.js`'s `updateBoardState()` (dòng 350-374) gọi
`requestAnimationFrame(() => boardRenderer.resize())` sau MỌI nước đi. `client/js/game-ui.js`'s
`updateBoardState()` (Tables Room, dòng 161-187) không làm vậy — chỉ resize ở init/`window
resize`/`setTurnBarVisible()`. `resize()` (`client/js/board.js` dòng 131-218) ghi lại
`canvas.width`/`height`/`style.width`/`height` dựa trên phép đo DOM sống — 1 write ảnh hưởng
layout. Không có `overflow-anchor: none` ở đâu trong `client/css/*.css` → scroll anchoring mặc
định của trình duyệt đang bật toàn site, và đây là cơ chế hợp lý nhất để giải thích scroll "thỉnh
thoảng" xảy ra ngay sau click.

## Cách làm

1. **Xoá `requestAnimationFrame(() => boardRenderer.resize())` khỏi `updateBoardState()`**
   (`tournament-match.js` dòng 373) — để state sync theo mỗi nước đi chỉ gọi `setState()` +
   `renderTimers()`, không resize canvas. Đây là thay đổi tối thiểu để khớp hành vi với
   `game-ui.js`.
2. **Giữ nguyên các lời gọi `resize()` hợp lệ khác** trong cùng file — `initBoard()` (dòng 347,
   qua `requestAnimationFrame` lúc khởi tạo) và listener `window.addEventListener('resize', ...)`
   (dòng 346) — đây là những chỗ resize thật sự cần thiết (kích thước viewport đổi, hoặc canvas
   chưa có kích thước lần đầu).
3. **Kiểm tra `renderSwap2Board()` và mọi hàm khác gọi `boardRenderer.setState()`** xem có ai khác
   âm thầm gọi `resize()` theo cùng khuôn mẫu không (tìm bằng grep `resize()` trong file) — nếu có,
   áp dụng cùng logic: chỉ giữ resize ở nơi kích thước khung chứa thực sự có thể đổi (window
   resize, focus-mode toggle nếu port sau này), không phải ở mọi lần đồng bộ state.
4. **Verify bằng tay trong trình duyệt thật** (không chỉ đọc code) — vì scroll anchoring là hành vi
   trình duyệt (Chrome/Firefox có thể khác nhau), không có cách nào chứng minh bằng Jest/server
   test. Cách tái hiện: mở `tournament-match.html` trên màn hình đủ cao để trang CẦN thanh scroll
   dọc (thu nhỏ cửa sổ trình duyệt hoặc zoom out ít nếu máy dev màn hình cao), cuộn xuống 1 đoạn
   giữa trang trước khi có tin nhắn/nước đi mới đến, sau đó thực hiện vài nước đi liên tiếp và quan
   sát `window.scrollY` có tự đổi hay không (log tạm `window.addEventListener('scroll', ...)`
   trong console, không commit code debug).
5. Nếu sau khi bỏ `resize()`-mỗi-click mà hiện tượng vẫn còn (khả năng thấp nhưng không loại trừ,
   vì `renderGameControls()`/`renderScorePanel()`/`renderHeader()` cũng đổi chiều cao DOM mỗi nước
   đi) — bước tiếp theo là thêm `overflow-anchor: none` có mục tiêu (ví dụ trên `body` hoặc
   `.room`), nhưng CHỈ sau khi đã xác nhận bằng tái hiện thật rằng đây vẫn là nguyên nhân, không
   thêm phòng ngừa mù.

## Bẫy cụ thể

- **Đừng resize canvas trong cùng tick với các hàm render khác đổi chiều cao DOM** — nếu tương lai
  cần resize theo mỗi nước đi vì lý do khác (ví dụ đổi `boardSize` giữa ván), tách nó ra khỏi
  `requestAnimationFrame` chung với `renderGameControls()`/`renderScorePanel()`, hoặc gộp lại đo 1
  lần sau khi mọi DOM khác đã ổn định.
- **Đừng port focus mode hoặc đổi `.match-page-header` như 1 cách "sửa" bug này** — đó là hướng
  giảm triệu chứng (ít khi cần thanh scroll hơn), không phải sửa nguyên nhân đã xác định
  (resize-mỗi-click + scroll anchoring). Có thể làm sau như tính năng riêng (xem B71 cho port focus
  mode), nhưng không thay thế fix này.
- **Không tự thêm `overflow-anchor: none` trước khi verify** — đây là patch "che" hợp lý, nhưng
  chỉ nên dùng nếu bước 4/5 xác nhận bug vẫn còn sau khi bỏ resize-mỗi-click; thêm mù có thể ẩn 1
  nguyên nhân khác chưa phát hiện.
- **Chưa xác nhận Tables Room (`room.html`) có bị bug tương tự hay không** — người dùng nêu rõ
  "unknown Tables Room has same issue". Vì `game-ui.js` không có resize-mỗi-click, giả thuyết hiện
  tại dự đoán Tables Room ít khả năng bị — nhưng nên hỏi lại người dùng / verify riêng, không giả
  định đã loại trừ hoàn toàn.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không port focus mode sang `tournament-match.html` (đó là B71-style work riêng, tracked khác).
- Không đổi layout `.match-page-header`/scale-to-fit-height — không phải nguyên nhân gốc theo phân
  tích ở trên.
- Không đổi `moveListEl.scrollTop`/chat `scrollTop` — đã xác nhận không liên quan (giới hạn trong
  container có `overflow-y: auto` riêng).
