# B109 — Đưa production về chạy bản build thật

Hướng dẫn thực thi cho TODO.md #109 (chưa làm). **Rủi ro cao nhất nhóm #105-#110 — làm sau cùng.**

## Điều kiện tiên quyết (không được bỏ)

- **Hỏi người dùng trước khi làm bất cứ điều gì ở mục này.** Người dùng là người khởi động và vận
  hành server thật (`start.sh`, tunnel đang chạy). Đổi cách production phục vụ file mà không có sự
  đồng ý là vượt quyền.
- **Làm #105-#108 trước và đo lại.** Có khả năng thật là sau 4 mục kia thì tải trang đã đủ nhanh và
  #109 không còn đáng đánh đổi rủi ro. Đừng bắt đầu bằng mục này chỉ vì nó nghe "đúng bài".

## Cách tiếp cận

- **Tuyệt đối không chỉ đặt `NODE_ENV=production` rồi coi là xong.** `dist/` đang cũ hơn `client/`
  4 ngày (build 08-08, `client/` sửa tới 08-12) — làm vậy sẽ đẩy production lùi về trước cả #103,
  #104 và toàn bộ đợt OAuth #95-#102. Biến vấn đề hiệu năng thành sự cố chức năng.
- Thứ tự bắt buộc: (1) `npm run build` lại, (2) **xác minh artifact trong `dist/` khớp `client/`**
  — không phải chỉ xem timestamp, mà mở `dist/index.html` kiểm chứng nó có các thay đổi gần đây
  (vd. `touch-action` của #104, luật WALL của #103), (3) rồi mới bàn tới `NODE_ENV`.
- **Vấn đề thật cần sửa là quy trình, không phải biến môi trường.** Nếu không có bước nào đảm bảo
  `dist/` luôn được build lại trước khi phục vụ, thì `NODE_ENV=production` mãi là mìn hẹn giờ. Đề
  xuất tối thiểu: thêm `npm run build` vào `start.sh` ngay trước khi khởi động server, để không thể
  chạy production trên bản build cũ. Bàn phương án với người dùng thay vì tự chọn.
- Tiền lệ bắt buộc đọc trước khi làm: **#65** — CSP đã sửa đúng ở `client/` nhưng `dist/` cũ vẫn
  ship HTML có lỗ hổng ra production. Cùng đúng một cơ chế hỏng.

## Phạm vi KHÔNG làm

- **Không sửa `vite.config.js`, đặc biệt là plugin `copyClassicScripts()`**, trừ khi build thật sự
  hỏng. Plugin đó xử lý các `<script>` non-module (theme/ui-mode preload IIFE, các module UMD như
  `escape-utils.js`/`audio-manager.js`/`profanity-*.js`) mà Vite bỏ qua — đã từng gây 404 ở
  production một lần, và danh sách file được **quét động** từ `client/*.html` đúng để tránh drift.
  Đọc kỹ comment dài trong file đó trước khi đụng vào.
- Không thêm CI/CD pipeline mới trong mục này — nếu thấy cần thì ghi thành việc riêng.
- Không xoá `dist/` khỏi repo, không đổi `outDir`.
- Không gộp với #105-#108 vào cùng commit — mục này cần rollback độc lập được.

## Test

- `npm test` phải xanh (không liên quan trực tiếp nhưng là điều kiện cần).
- **Bắt buộc chạy Playwright/thủ công trên bản build `dist/`**, không chỉ trên `client/`. Đây đúng
  là tình huống mà "chạy được ở dev" không nói lên gì về production — theo quy tắc "Root-cause
  diagnosis" trong CLAUDE.md, phải xác minh trên artifact thật sự được phục vụ.
- Nếu chạy server để test: tuân thủ nguyên tắc bảo vệ DB thật trong CLAUDE.md (`mv` `gomoku.db` ra
  chỗ khác trước, khôi phục sau, kiểm chứng đã khôi phục đúng).
