# B107 — Đổi sang `socket.io.min.js`

Hướng dẫn thực thi cho TODO.md #107 (chưa làm). Đây là mục **dễ nhất** trong nhóm #105-#110 — làm
trước để lấy 109 KB/trang gần như miễn phí.

## Cách tiếp cận

- Đổi `src="/socket.io/socket.io.js"` → `src="/socket.io/socket.io.min.js"` ở đúng 4 chỗ:
  `client/index.html:478`, `client/room.html:170`, `client/tournament.html:204`,
  `client/tournament-match.html:184`.
- **Sửa cả 4, không sửa lẻ.** Bỏ sót một trang là trang đó vẫn kéo 156 KB, và kiểu bug "chỉ sót một
  chỗ" đúng là thứ đã tái diễn 2 lần với `?v=N` (xem CLAUDE.md). Kiểm bằng:
  ```
  grep -rn "socket.io/socket.io" client/*.html
  ```
  phải ra 4 dòng, tất cả đều `.min.js`, không còn dòng nào `.js` trần.

## Phạm vi KHÔNG làm

- **KHÔNG thêm `?v=N` vào URL này.** Đường dẫn `/socket.io/socket.io.min.js` do chính server
  socket.io phục vụ (không phải `express.static` từ `client/`), phiên bản của nó đi theo phiên bản
  package trong `node_modules` chứ không theo repo — thêm `?v=` vào đây chỉ tạo ấn tượng sai rằng nó
  nằm trong cơ chế cache-busting của repo, và sẽ thành một chỗ nữa phải nhớ bump vô ích.
- **Vẫn phải bump `?v=N` cho phần còn lại** vì có sửa file trong `client/` — nhưng lưu ý ở đây là ta
  sửa `client/*.html`, mà quy tắc cache-busting yêu cầu bump khi đụng `client/css/` hoặc
  `client/js/`. Sửa HTML thuần (không đụng css/js) thì **không cần** bump; kiểm lại quy tắc trong
  CLAUDE.md trước khi bump hay không bump, đừng làm theo phản xạ.
- Không đổi sang `socket.io.esm.min.js` (40 KB, nhỏ hơn nữa) — các trang đang nạp nó như classic
  `<script>` và dựa vào global `io`, chuyển sang ESM là thay đổi cách nạp module, rủi ro cao hơn
  hẳn so với lợi ích thêm 6 KB. Nếu muốn cân nhắc thì tách mục riêng.
- Không nâng/hạ phiên bản `socket.io` (xem #89 về `socket.io-parser`) — mục này chỉ đổi biến thể
  bundle của đúng phiên bản đang cài.

## Test

- Không có test tự động phù hợp (đây là thay đổi ở tầng `client/`, repo chưa có test runner cho
  `client/js/` — nêu rõ điều này thay vì bỏ qua im lặng).
- **Bắt buộc xác minh thủ công trong trình duyệt thật**: mở cả 4 trang, xác nhận socket kết nối được
  (danh sách người online hiện ra ở sảnh, vào phòng chơi được một nước), console không lỗi. Bản
  minify cùng API nên rủi ro thấp, nhưng "thấp" không phải "không" — phải mở thật.
