# #105 — Server không có compression middleware: mọi asset text gửi nguyên si, phí 70-87% băng thông

**Trạng thái:** chưa làm

`server/index.js` không `app.use(compression())` ở bất kỳ đâu, và `compression` cũng không có trong
`package.json` (`dependencies` chỉ có `bcrypt`, `better-sqlite3`, `enquirer`, `express`,
`express-rate-limit`, `google-auth-library`, `helmet`, `jsonwebtoken`, `socket.io`, `uuid`).
Hệ quả: `express.static()` trả về mọi file HTML/CSS/JS **nguyên kích thước gốc**, không nén.

Xác nhận bằng đo thật (origin `localhost:3000`, request có `Accept-Encoding: gzip, deflate, br`):

```
$ curl -s -I -H "Accept-Encoding: gzip, deflate, br" http://localhost:3000/js/i18n.js
Cache-Control: public, max-age=0
ETag: W/"11efb-19ff1cc7cca"
Content-Length: 73467          ← không có Content-Encoding, trả nguyên 73 KB
```

## Mức lãng phí đo được (gzip -9 trên chính các file đó)

| File | Gốc | gzip -9 | Giảm |
|---|---|---|---|
| `vendor/phosphor/bold/style.css` | 85 761 B | 11 960 B | **87%** |
| `vendor/phosphor/regular/style.css` | 78 081 B | 12 030 B | **85%** |
| `client/index.html` | 25 298 B | 4 939 B | **81%** |
| `css/lobby.css` | 29 598 B | 6 194 B | **80%** |
| `js/i18n.js` | 73 467 B | 18 063 B | **76%** |
| `css/main.css` | 16 388 B | 4 454 B | **73%** |
| `css/settings-panel.css` | 5 555 B | 1 638 B | **71%** |
| `js/lobby.js` | 24 274 B | 7 395 B | **70%** |
| `js/profanity-filter.js` | 39 166 B | 12 349 B | **69%** |
| `js/profanity-classifier-model.js` | 53 122 B | 18 992 B | **65%** |
| `js/socket-client.js` | 9 855 B | 3 667 B | **63%** |

## Lưu ý quan trọng: Cloudflare ĐÃ nén, nên đây không phải nguyên nhân chính

Đo qua domain thật `play3cr.dpdns.org` cho thấy Cloudflare tự thêm Brotli ở biên:

```
$ curl -s -I -H "Accept-Encoding: gzip, br" https://play3cr.dpdns.org/js/i18n.js
content-encoding: br
server: cloudflare
```

Nghĩa là **người dùng cuối đã được nhận bản nén rồi** — phần chưa nén chỉ là chặng
origin → Cloudflare (qua tunnel, chạy trên máy nhà). Vẫn đáng sửa vì:

- Chặng origin → CF đi qua đường lên (upload) của mạng nhà, thường hẹp hơn nhiều đường xuống —
  đây đúng là chặng đắt nhất, và mỗi lần CF revalidate (xem #106) là một lần truyền lại nguyên si.
- Truy cập trực tiếp `localhost:3000` (dev, test thủ công, Playwright) không có CF nên không được
  nén gì cả.
- Không phụ thuộc vào việc Cloudflare có bật/giữ nguyên cấu hình nén hay không.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **An toàn:** cao. `compression` là middleware chuẩn của Express, chỉ cần đặt **trước**
  `express.static()` và các route. Không đổi logic ứng dụng.
- **Hiệu quả:** trung bình (không phải cao như tưởng ban đầu, vì CF đã nén cho người dùng cuối) —
  lợi chủ yếu ở chặng origin→CF và ở môi trường dev/test.
- **Cần chú ý:** không nén lại nội dung đã nén (font `.woff2` — `compression` mặc định đã bỏ qua
  theo `Content-Type`, cần xác nhận), và cân nhắc tương tác với socket.io
  (`perMessageDeflate`) — xem phần "Phạm vi KHÔNG làm" trong instruction.

Chi tiết: [docs/instruction/B105-khong-co-compression-middleware.md](../instruction/B105-khong-co-compression-middleware.md).
