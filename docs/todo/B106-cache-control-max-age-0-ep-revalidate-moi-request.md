# #106 — `Cache-Control: max-age=0` ép revalidate mọi asset dù đã có sẵn cơ chế `?v=N` — nghi là nguyên nhân CHÍNH của "sometime lag"

**Trạng thái:** ✅ ĐÃ XONG (2026-08-12, nhánh `fix/static-cache-control`) — đã đo đủ 3 tầng

Đã thêm `server/config/staticCache.js` (`*.html` → `no-cache`, còn lại →
`public, max-age=31536000, immutable`), nối vào `express.static` và vào nhánh SPA catch-all; 17
unit test mới, `npm test` 1087/1087 xanh.

Xác minh đầy đủ sau khi người dùng dừng server và cho phép tự chạy (DB thật đã được dời sang bên
rồi khôi phục, md5 khớp): origin trả `immutable` cho asset / `no-cache` cho `.html` / `no-store` cho
`/api/auth/*` (#66 còn nguyên); qua Cloudflare `REVALIDATED` → **`HIT`**; trong trình duyệt thật,
lần vào lại đi từ **25 request revalidate xuống 0** (0 KB qua mạng). `index.html` vẫn `DYNAMIC` là
đúng thiết kế. **Chưa kết luận được là đã xoá triệu chứng "sometime lag"** — cả 2 lần đo TTFB trong
phiên đều không tái hiện đỉnh ~1s của baseline; liên hệ #86 vẫn để mở. Chi tiết:
[docs/fix-log/2026-08-12-todo-106-static-cache-control.md](../fix-log/2026-08-12-todo-106-static-cache-control.md)
· [xác minh](../fix-log/2026-08-12-todo-106-verification-through-cloudflare.md).

`server/index.js:68` gọi `express.static(clientPath)` **không truyền option nào**. Mặc định của
Express là `maxAge: 0`, nên mọi asset tĩnh trả về:

```
Cache-Control: public, max-age=0
ETag: W/"739e-19fe53f20c9"
```

`max-age=0` nghĩa là "được cache nhưng phải hỏi lại server trước mỗi lần dùng". Trình duyệt **và**
Cloudflare đều phải gửi request revalidate (`If-None-Match`) về origin cho **từng asset, mỗi lần
tải trang** — kể cả khi file không đổi một byte nào.

Điều này mâu thuẫn trực tiếp với cơ chế cache-busting `?v=N` mà repo đã có sẵn (xem CLAUDE.md —
mọi `<link>`/`<script>`/ES-import đều mang `?v=103`). `?v=N` tồn tại **chính xác để** có thể cache
vĩnh viễn một cách an toàn: đổi nội dung → đổi số → URL mới → cache cũ tự nhiên không còn được
dùng. Hiện tại repo trả giá cho cơ chế đó (phải bump thủ công mọi nơi, đã 2 lần gây bug — xem #51)
nhưng **không hưởng lợi ích của nó**.

## Bằng chứng đo được

Header từ domain thật cho thấy đúng hệ quả:

```
$ curl -s -D - -o /dev/null https://play3cr.dpdns.org/js/i18n.js
cache-control: public, max-age=14400        ← CF ghi đè Browser TTL 4h
cf-cache-status: REVALIDATED                ← nhưng CF vẫn phải hỏi origin
```

`cf-cache-status: REVALIDATED` = Cloudflare CÓ file trong cache biên nhưng vì origin nói
`max-age=0` nên vẫn round-trip về máy nhà mỗi lần. `index.html` còn tệ hơn: `cf-cache-status:
DYNAMIC` (không cache ở biên gì cả).

## Vì sao đây khớp với triệu chứng "sometime lag" người dùng báo

Đo 10 lần liên tiếp `index.html` qua domain thật:

```
run 1: TTFB 0.300s      run 6: TTFB 0.880s   ←
run 2: TTFB 0.362s      run 7: TTFB 0.300s
run 3: TTFB 0.286s      run 8: TTFB 1.034s   ←
run 4: TTFB 0.297s      run 9: TTFB 0.280s
run 5: TTFB 0.297s      run 10: TTFB 0.286s
```

Trung vị ~0.30s nhưng **2/10 lần vọt lên 0.88-1.03s** (gấp ~3.4×). Đây là đặc trưng của round-trip
về origin qua tunnel trên mạng nhà — không ổn định theo bản chất.

Trang sảnh (`index.html`) cần **26 request** (xem #107, #108). Với 26 lần quay số độc lập mà mỗi
lần có ~20% khả năng chạm mức ~1s, việc "thỉnh thoảng" một lần tải trang bị chậm rõ rệt là gần như
chắc chắn xảy ra — khớp đúng mô tả "sometime lag and slow", và giải thích vì sao nó **không** xảy ra
mọi lần.

Đo tổng đường tới hạn qua domain thật (tuần tự, 13 file chính): **12 709 ms**, với các đỉnh lẻ
`index.html` 3.74s, `profanity-classifier-model.js` 2.64s, `i18n.js` 1.38s.

## Liên hệ với #86 (chưa đóng được nguyên nhân)

#86 ("click bàn cờ thỉnh thoảng trễ ~1s, refresh thì hết") đã loại trừ listener trùng, ghi DB đồng
bộ, và tải server (p99 5.35ms), rồi đóng vì **không tái hiện được**. Độ lớn ~1s và tính "thỉnh
thoảng" ở đây trùng khớp đáng chú ý với các đỉnh TTFB đo được ở trên. **Chưa đủ để kết luận là cùng
một nguyên nhân** — #86 là độ trễ trên kết nối WebSocket đã mở, không phải request HTTP tĩnh — nhưng
nếu sửa #106 xong mà #86 không tái phát nữa thì đó là dữ kiện đáng ghi lại.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả: cao nhất trong cả nhóm #105-#110.** Loại bỏ hẳn 26 round-trip revalidate mỗi lần tải
  trang cho người dùng quay lại, và cho phép Cloudflare phục vụ từ biên (`HIT`) thay vì
  `REVALIDATED`/`DYNAMIC`.
- **Rủi ro: có thật, phải làm cẩn thận.** `immutable`/`max-age` dài chỉ an toàn cho asset có `?v=N`.
  **`*.html` KHÔNG được cache dài** — file HTML chính là nơi chứa số `?v=N`, nếu nó bị cache lâu thì
  bump version sẽ không tới được người dùng, tái tạo đúng lớp bug mà `?v=N` sinh ra để chặn.
- **Không cần đổi cấu hình Cloudflare dashboard** để có phần lớn lợi ích: sửa header ở origin là đủ
  để CF chuyển từ `REVALIDATED` sang `HIT`. (Tunnel đang chạy bằng token
  `cloudflared tunnel run --token ...`, tức cấu hình nằm trên dashboard, không có file
  `config.yml` cục bộ để sửa.)

Chi tiết: [docs/instruction/B106-cache-control-max-age-0-ep-revalidate-moi-request.md](../instruction/B106-cache-control-max-age-0-ep-revalidate-moi-request.md).
