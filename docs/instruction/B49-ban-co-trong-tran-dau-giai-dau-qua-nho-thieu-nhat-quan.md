# B49. Bàn cờ trận đấu giải đấu quá nhỏ / thiếu nhất quán (TODO.md #49)

## Hướng tiếp cận đề xuất

- **Bỏ hoặc nới `max-width: 640px` ở `.match-board-canvas-wrap`**
  (`client/css/tournament.css:163`) để khớp với hành vi không giới hạn của
  `.board-canvas-wrap` gốc trong `room.css`, cho phép `BoardRenderer.resize()`
  (`client/js/board.js`) tự quyết định kích thước tới trần 860px như ở `room.html`,
  thay vì để hai cơ chế giới hạn kích thước (JS 860px và CSS 640px) mâu thuẫn nhau.
  Đây là điểm khởi đầu hợp lý nhất vì `resize()` đã có đầy đủ logic responsive dùng
  chung — không cần viết lại, chỉ cần bỏ giới hạn CSS chặn ngang nó.
- **Vá khoảng trống breakpoint 769–900px**: hoặc hạ ngưỡng `@media (max-width: 900px)`
  ở `tournament.css:151` xuống khớp `768px` (đồng bộ với ngưỡng mobile của
  `room.css`), hoặc thêm một dải `@media` riêng cho `.board-area-shell`/`.board-area`
  trong khoảng 769–900px áp dụng khi nằm trong `.match-shell`. Cân nhắc phương án đơn
  giản hơn (đồng bộ ngưỡng) trước khi thêm rule mới.
- **Bắt buộc kiểm chứng bằng trình duyệt thật trước khi coi là xong** — đây là bug UI
  responsive, không có unit test nào bắt được lỗi layout dạng này. Dùng Playwright
  hoặc chạy dev server thủ công, chụp màn hình ở tối thiểu 3 mốc độ rộng
  (≈1440px desktop, 800px tablet, 390px mobile) cả trước và sau khi sửa để so sánh.
  **Nhắc lại quy tắc Playwright/e2e trong `CLAUDE.md`**: phải di chuyển
  `server/db/gomoku.db` (+ `-wal`/`-shm`) sang chỗ khác trước khi khởi động server để
  test, và khôi phục lại đúng file gốc sau khi xong — không được để trận đấu thử
  nghiệm ghi đè dữ liệu thật của người dùng.
- Vì trận đấu giải đấu cần state thật (đăng nhập, tạo giải đấu, cặp đấu `ongoing`) để
  `tournament-match.html` render bàn cờ qua socket, kiểm chứng bằng trình duyệt sẽ tốn
  công dựng dữ liệu test — cân nhắc test trực tiếp trên `room.html` trước (đã dùng
  chung `board.js`/`resize()`) để xác nhận giới hạn 860px hoạt động đúng, sau đó chỉ
  cần xác nhận riêng phần CSS `max-width`/breakpoint đặc thù của
  `tournament-match.html`.

## Ranh giới — đừng đụng

- **Đừng sửa `client/js/board.js`'s `resize()`** — logic responsive đã dùng chung cho
  cả `room.html` và `tournament-match.html`, và đã có nhiều comment giải thích các
  trường hợp biên (mobile bleed, focus mode, DPR) đúc kết từ các lần sửa trước. Bug
  nằm ở CSS giới hạn thêm phía `tournament.css`, không phải ở hàm tính toán này.
- **Đừng động vào `client/tournament-detail-mockup.html`** — đây là file mockup thiết
  kế tĩnh (Phase 6), không phải code đang chạy; ảnh chụp màn hình gốc của người dùng
  tình cờ trùng với file này nhưng bug thật nằm ở `tournament-match.html`/
  `tournament.css`. Sửa mockup không có tác dụng với người dùng thật.
- **Đừng gộp sửa luôn khoảng cách cột phải 300px vs `clamp(...)` (mục 3 trong
  TODO.md #49)** trừ khi việc sửa 2 điểm chính ở trên đụng chung đúng khối CSS đó —
  đây là điểm phụ, không phải nguyên nhân "board too small".
