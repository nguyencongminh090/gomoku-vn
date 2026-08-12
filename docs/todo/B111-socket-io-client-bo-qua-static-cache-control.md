# #111 — `/socket.io/socket.io.min.js` không đi qua `express.static` nên vẫn `max-age=0`: lỗ hổng còn lại của #106

**Trạng thái:** ✅ ĐÃ XONG (2026-08-12, nhánh `fix/socket-io-client-cache-control`)

**Cả 2 hướng sửa đề xuất bên dưới đều KHÔNG khả thi — đã đo và bác bỏ trước khi code:**

1. *"Chèn route Express ghi đè header"* — **sai.** engine.io chiếm toàn bộ prefix `/socket.io/`
   ở tầng HTTP server (nó `removeAllListeners('request')` rồi tự lọc URL), nên **Express không
   bao giờ nhìn thấy request này**. Probe: middleware Express đặt `X-Express-Saw` → header không
   xuất hiện, biến cờ vẫn `false`.
2. *"Tắt `serveClient`, tự phục vụ qua `express.static` dưới `/socket.io`"* — cũng **sai**: với
   `serveClient: false`, engine.io vẫn nuốt `/socket.io/*` và trả **400**, không rơi xuống
   `express.static`. Probe cho status 400 / 40 byte.
3. `max-age=0` là **hardcode** trong `socket.io/dist/index.js:360`, không có option cấu hình.

**Cách đã làm:** phục vụ file từ một path **ngoài** `/socket.io/` —
`app.use('/vendor/socket.io', express.static(<socket.io/client-dist>, socketIoClientOptions))` —
và đổi `src` ở đúng 4 file HTML sang `/vendor/socket.io/socket.io.min.js`.

- **`serveClient` cố ý GIỮ BẬT**: URL cũ vẫn chạy, nên HTML cũ còn cache hoặc `dist/` cũ
  (xem #109) chỉ tụt về hành vi cũ chứ **không vỡ** vì mất global `io` — đúng cảnh báo trong
  instruction.
- **`max-age=86400` (1 ngày), KHÔNG `immutable`** — theo đúng khuyến nghị an toàn: URL này không
  có `?v=N`, nội dung đổi khi `npm update socket.io`, nên `immutable` sẽ ghim client cũ tới 1 năm.
  Chính sách nằm ở export **riêng** `socketIoClientOptions`/`SOCKET_IO_CLIENT` trong
  `staticCache.js`, **không** đụng `setStaticCacheHeaders()` (17 test của #106 giữ nguyên ngữ
  nghĩa "chỉ cho asset của `client/`").
- **Không bump `?v=N`**: chỉ sửa `client/*.html`, không đụng `client/css/` hay `client/js/` — cùng
  lý do đã ghi ở fix-log #107.

**Xác minh bằng Chromium thật** (server tạm cổng 3001, DB thật dời sang bên rồi khôi phục,
`md5sum -c` OK, 12 users / 64 games):

- `/vendor/socket.io/socket.io.min.js` → `200 public, max-age=86400`, **0 lỗi console**.
- WebSocket mở thật (`ws://.../socket.io/?EIO=4&transport=websocket`), `#online-panel-count` = **1**
  → chứng minh có round-trip server→client thật, không chỉ "trang tải xong".
  (Lần đo đầu ra `0` là do `CORS_ORIGIN` trong `.env` trỏ domain thật trong khi test qua
  `localhost` — **không phải hồi quy**; chạy lại với `CORS_ORIGIN` khớp thì ra `1`.)
- **Lần vào lại: 25/25 resource lấy từ cache, 0 byte qua mạng** (`transferSize === 0` cho toàn bộ,
  gồm cả `socket.io.min.js`) — tức đã xoá hẳn round-trip mà mục này nhắm tới.

13 unit test mới (`server/tests/socket-io-client-cache.test.js`), `npm test` **1114/1114 xanh**.
Test có pin cả ràng buộc "engine.io chiếm `/socket.io/`" để không ai 'dọn dẹp' lại thành hỏng.

Chi tiết: [docs/fix-log/2026-08-12-todo-111-socket-io-client-cache-control.md](../fix-log/2026-08-12-todo-111-socket-io-client-cache-control.md).

Phát hiện khi **đo lại** sau khi #106 + #107 + #108(a,c) đã xong (2026-08-12). #106 đã sửa đúng
`express.static`, nhưng file client của socket.io **không do `express.static` phục vụ** — nó do
middleware riêng của chính socket.io (`serveClient`) trả về, nằm ngoài `staticOptions`. Kết quả:
sau khi #106 xong, đây là **asset duy nhất** (ngoài `*.html`, vốn cố ý `no-cache`) còn phải
round-trip về origin ở **mọi lần tải trang, trên cả 4 trang**.

## Bằng chứng đo được (origin, 2026-08-12, sau #106/#107/#108)

```
$ curl -sD- -o/dev/null http://localhost:3001/socket.io/socket.io.min.js
Cache-Control: public, max-age=0          ← KHÔNG phải immutable như asset khác
ETag: "4.8.3"                             ← chính là số phiên bản thư viện
content-encoding: gzip                    ← socket.io tự nén sẵn (nên #105 không đụng tới file này)

$ curl -H 'If-None-Match: "4.8.3"' ...    → HTTP 304
```

So với asset đi qua `express.static` sau #106:

```
/js/i18n.js?v=104                  public, max-age=31536000, immutable
/vendor/phosphor/regular/style.css public, max-age=31536000, immutable
/index.html                        no-cache        ← cố ý, đúng thiết kế
/socket.io/socket.io.min.js        public, max-age=0   ← lỗ hổng
/api/auth/me                       no-store        ← #66 còn nguyên
```

Đếm trên đồ thị request thật của trang sảnh (25 request mà trình duyệt thật tải):
**23/25 asset đã `immutable`, chỉ còn 2 request phải hỏi lại origin mỗi lần** — `index.html`
(đúng thiết kế) và `socket.io.min.js` (lỗi này). Tức #106 đã đạt ~92% mục tiêu; mục này là phần
còn lại.

## Vì sao đáng sửa dù chỉ 304

- 304 vẫn là **một round-trip đầy đủ về origin qua Cloudflare Tunnel** — đúng loại round-trip mà
  #106 đo được là hay vọt lên 0.88-1.03s (2/10 lần). Nó chỉ tiết kiệm phần thân 46 822 B, không
  tiết kiệm độ trễ.
- `ETag: "4.8.3"` là **số phiên bản thư viện**, chỉ đổi khi nâng cấp `socket.io` — tức nội dung
  file ổn định y hệt các asset đã được `immutable`. Không có lý do kỹ thuật nào để nó phải
  revalidate mỗi lần.
- Nó nằm trên **đường tới hạn**: `socket-client.js` cần `io` toàn cục trước khi kết nối được, nên
  round-trip này chặn thời điểm sảnh hiện danh sách phòng.
- Ảnh hưởng cả 4 trang (`index`/`room`/`tournament`/`tournament-match`), vì #107 đã đổi cả 4 sang
  bản `.min.js`.

## Hướng sửa (chưa chốt — xem instruction)

Hai lựa chọn, cần cân nhắc:

1. **Tắt `serveClient` và tự phục vụ file từ `node_modules`** qua `express.static` với chính
   `staticOptions` đã có — thống nhất chính sách ở một chỗ, nhưng phải tự thêm `?v=N` hoặc chấp
   nhận rủi ro cache cứng khi nâng cấp socket.io.
2. **Chèn một route ghi đè header trước middleware của socket.io** — ít xâm lấn hơn, giữ nguyên
   cơ chế phục vụ sẵn có, chỉ đổi `Cache-Control`.

**Rủi ro chính của cả hai:** `immutable` + `max-age` dài trên một URL **không có `?v=N`** nghĩa là
khi nâng cấp `socket.io`, trình duyệt cũ sẽ dùng file client cũ tới 1 năm trong khi server đã chạy
bản mới — đúng lớp bug mà `?v=N` sinh ra để chặn (xem CLAUDE.md). **Không được bê nguyên
`max-age=31536000, immutable` vào đây mà không xử lý chuyện đó.** Một TTL trung bình (vd. vài giờ /
vài ngày), hoặc thêm phiên bản vào URL, an toàn hơn nhiều so với `immutable`.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả: trung bình.** Bỏ 1/2 round-trip origin còn lại mỗi lần tải trang × 4 trang. Nhỏ hơn
  #106 nhiều, nhưng là phần dư trực tiếp của cùng một lỗi.
- **Rủi ro: trung bình** — không phải vì code khó, mà vì chọn sai TTL sẽ ghim bản socket.io cũ vào
  máy người dùng. Xem cảnh báo ở trên.
- **Nên làm cùng lúc với việc chốt #105**, vì cả hai đều là chỉnh middleware ở `server/index.js`.

Chi tiết hướng dẫn: [docs/instruction/B111-socket-io-client-bo-qua-static-cache-control.md](../instruction/B111-socket-io-client-bo-qua-static-cache-control.md).
