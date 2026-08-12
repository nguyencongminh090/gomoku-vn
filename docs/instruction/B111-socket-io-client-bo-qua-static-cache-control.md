# §111 — Hướng dẫn: đóng lỗ hổng `Cache-Control` của `/socket.io/socket.io.min.js`

Bổ sung cho [docs/todo/B111-socket-io-client-bo-qua-static-cache-control.md](../todo/B111-socket-io-client-bo-qua-static-cache-control.md).

## Bối cảnh: vì sao #106 không bắt được chỗ này

`server/index.js:72` gọi `express.static(clientPath, staticOptions)` — đúng và đủ cho mọi thứ nằm
trong `client/`. Nhưng `/socket.io/socket.io.js(.min.js)` **không nằm trong `client/`**: nó do
`new Server(...)` của socket.io tự đăng ký một handler riêng (tuỳ chọn `serveClient`, mặc định
`true`) và đọc file thẳng từ `node_modules/socket.io-client-dist/`. Handler đó tự đặt
`Cache-Control: public, max-age=0` + `ETag: "<version>"` và tự gzip, hoàn toàn không biết tới
`staticOptions`.

Đây đúng là dạng lỗi mà quy tắc "Root-cause diagnosis" trong CLAUDE.md cảnh báo: #106 sửa đúng
tầng nơi *đa số* asset đi qua, nhưng một asset đi bằng đường khác nên không được sửa — và chỉ lộ
ra khi **đo lại toàn bộ đồ thị request** thay vì kiểm vài file mẫu.

## Cách xác minh trước khi sửa

Đo bằng đúng lệnh đã dùng để phát hiện:

```
curl -sD- -o/dev/null http://localhost:<port>/socket.io/socket.io.min.js | grep -i 'cache\|etag'
```

Và sau khi sửa, **kiểm lại cả đồ thị**, đừng chỉ kiểm file này — dùng lại script crawl đã viết khi
đo #105-#110 (fetch `index.html`, đệ quy theo `import`/`url()`, in `Cache-Control` từng request).
Tiêu chí đạt: mọi request **trừ `*.html`** đều không còn `max-age=0`.

## Pitfall lớn nhất: đừng dán `immutable` lên URL không có `?v=N`

Toàn bộ cơ chế `?v=N` của repo (xem CLAUDE.md) là điều kiện tiên quyết để `immutable` an toàn:
đổi nội dung → đổi URL. URL `/socket.io/socket.io.min.js` **cố định**, nội dung lại đổi khi
`npm update socket.io`. Nếu đặt `max-age=31536000, immutable`:

- người dùng cũ giữ client socket.io cũ tới 1 năm,
- server chạy bản mới,
- lỗi sẽ hiện ra dưới dạng "kết nối được nhưng vài sự kiện im lặng không chạy" — cực khó chẩn đoán,
  đúng kiểu hỏng âm thầm mà repo đã dính 2 lần với `?v=N` (xem `docs/fix-log/2026-08-04-*` và
  `2026-08-06-tournaments-lobby-duplicate-module-import.md`).

**Chọn một trong hai, đừng nửa vời:**

- **(1) TTL vừa phải, không `immutable`** — vd. `public, max-age=86400` (1 ngày). Đơn giản nhất,
  không đụng cơ chế phục vụ, xoá được round-trip mỗi-lần-tải mà vẫn tự lành trong 1 ngày sau khi
  nâng cấp. **Đây là lựa chọn khuyến nghị** nếu không muốn phát sinh việc.
- **(2) Tự phục vụ kèm phiên bản trong URL** — `io.serveClient(false)` rồi
  `app.use('/socket.io', express.static(require('path').dirname(require.resolve('socket.io-client-dist/socket.io.min.js')), staticOptions))`
  và thêm `?v=N` vào 4 file HTML. Được `immutable` thật, nhưng kéo `socket.io.min.js` vào diện
  phải bump `?v=N` — nhớ cập nhật luôn quy tắc cache-busting trong CLAUDE.md nếu chọn hướng này,
  vì lệnh grep xác minh hiện tại không cover đường dẫn `/socket.io/`.

## Đừng làm

- **Đừng đặt `serveClient: false` mà quên thay thế** — 4 trang đều có
  `<script src="/socket.io/socket.io.min.js">`, tắt không kèm route thay thế là hỏng toàn site
  ngay lập tức (không có `io` toàn cục → không trang nào kết nối được).
- **Đừng đụng `staticCache.js` để "gộp luôn socket.io vào"** — module đó cố ý chỉ mô tả chính sách
  cho asset của `client/` và đang có 17 unit test bám theo ngữ nghĩa đó (`*.html` → `no-cache`,
  còn lại → `immutable`). Thêm ngoại lệ cho một đường dẫn ngoài `client/` vào đây sẽ làm nó
  không còn kiểm được độc lập như thiết kế của #106.
- **Đừng gộp chung commit với #105.** Hai thứ cùng đụng `server/index.js` nhưng là hai fix khác
  nhau — theo quy tắc "one fix, one branch, one commit".
- **Đừng tự nâng cấp `socket.io` nhân tiện** — ngoài phạm vi mục này.

## Test

Có sẵn hạ tầng test (`server/tests/**/*.test.js`), nên **bắt buộc viết unit test** theo quy tắc
bug-fix của CLAUDE.md. Tối thiểu:

- `/socket.io/socket.io.min.js` trả `Cache-Control` không chứa `max-age=0`;
- vẫn trả đúng nội dung JS (status 200, `content-type` là javascript) — chống hồi quy cho pitfall
  "tắt `serveClient` mà quên thay thế";
- `*.html` vẫn `no-cache` và asset `client/` vẫn `immutable` (chứng minh không phá #106);
- `/api/auth/*` vẫn `no-store` (chứng minh không phá #66).
