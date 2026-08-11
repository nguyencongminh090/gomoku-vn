# B105 — Thêm compression middleware

Hướng dẫn thực thi cho TODO.md #105 (chưa làm).

## Cách tiếp cận

- `npm i compression`, rồi `app.use(compression())` trong `server/index.js` **trước**
  `app.use(express.static(clientPath))` và trước mọi route. Đặt sau `helmet()` là được — thứ tự
  giữa 2 cái này không quan trọng vì helmet chỉ set header.
- **Đặt kỳ vọng cho đúng: đây KHÔNG phải fix cho triệu chứng người dùng báo.** Cloudflare đã nén
  Brotli cho người dùng cuối rồi (`content-encoding: br` đo được trên domain thật). Mục này chỉ cải
  thiện chặng origin→CF và môi trường dev/test. Nếu định sửa đúng một mục để trị "sometime lag" thì
  đó là **#106**, không phải mục này.
- Xác minh bằng `curl -s -I -H "Accept-Encoding: gzip" http://localhost:3000/js/i18n.js` — phải thấy
  `Content-Encoding: gzip` và không còn `Content-Length: 73467`.

## Phạm vi KHÔNG làm

- **Không đụng `perMessageDeflate` của socket.io.** `compression` chỉ áp cho HTTP response của
  Express; socket.io có cơ chế nén riêng cho WebSocket frame và mặc định đang tắt ở phía server —
  bật nó là một quyết định khác hẳn (tốn CPU trên mỗi nước cờ, ảnh hưởng độ trễ realtime — thứ mà
  #86/#20 đã tốn nhiều công đo). Ngoài phạm vi mục này.
- **Không nén lại font `.woff2`/`.ttf`.** `compression` mặc định bỏ qua theo `Content-Type` qua
  `compressible`; xác nhận điều đó đúng thay vì tự thêm filter — nén lại nội dung đã nén chỉ tốn CPU
  và có khi còn to hơn.
- **Không chỉnh `level`/`threshold` nếu không có số đo.** Mặc định (`level: 6`) là đánh đổi hợp lý;
  bảng gzip -9 trong file TODO chỉ để ước lượng trần lợi ích, không phải đề xuất dùng level 9.
- Không đụng `Cache-Control` trong mục này — đó là #106, sửa riêng để đo được tách bạch.

## Test

- Có thể test được bằng Jest: mount app thật (hoặc một app tối giản dùng cùng chuỗi middleware),
  `supertest` GET một file tĩnh với `Accept-Encoding: gzip`, assert `Content-Encoding`. Nếu repo
  chưa có `supertest`, cân nhắc test ở mức "middleware có mặt và đúng thứ tự" thay vì thêm
  dependency mới chỉ cho một assert.

Liên quan: #106 (`Cache-Control`, cùng vùng code `express.static`) —
[docs/todo/B106-cache-control-max-age-0-ep-revalidate-moi-request.md](../todo/B106-cache-control-max-age-0-ep-revalidate-moi-request.md).
