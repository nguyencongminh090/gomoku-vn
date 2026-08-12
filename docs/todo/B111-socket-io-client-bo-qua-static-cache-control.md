# #111 — `/socket.io/socket.io.min.js` không đi qua `express.static` nên vẫn `max-age=0`: lỗ hổng còn lại của #106

**Trạng thái:** chưa làm

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
