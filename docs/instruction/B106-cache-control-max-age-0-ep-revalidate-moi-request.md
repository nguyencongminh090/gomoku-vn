# B106 — Sửa `Cache-Control` cho asset tĩnh (nghi là nguyên nhân chính của "sometime lag")

Hướng dẫn thực thi cho TODO.md #106 (chưa làm). **Đây là mục đáng ưu tiên nhất trong nhóm
#105-#110** — lợi ích cao nhất, và không phụ thuộc mục nào khác.

## Cách tiếp cận

- Truyền option cho `express.static()` ở `server/index.js:68`. Điểm mấu chốt là **phân biệt HTML với
  phần còn lại**:

  ```js
  app.use(express.static(clientPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');   // luôn revalidate
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  ```

- **Vì sao HTML phải khác:** file HTML chính là nơi chứa số `?v=N` trỏ tới mọi asset khác. Cache HTML
  lâu = bump `?v=N` không tới được người dùng = tái tạo đúng lớp bug mà cả cơ chế `?v=N` sinh ra để
  chặn (xem #51). `no-cache` (revalidate mỗi lần, dùng lại nếu ETag khớp) chứ **không phải**
  `no-store` — HTML nhỏ và ETag đã có sẵn, revalidate là đủ.
- `immutable` chỉ hợp lệ cho asset có `?v=N` — mà theo quy tắc cache-busting trong CLAUDE.md thì mọi
  `client/css/*` và `client/js/*` đều có. Font trong `client/vendor/` cũng được tham chiếu qua CSS đã
  mang `?v=N`.

## Xác minh (bắt buộc, không bỏ qua)

Đây là loại fix mà tầng quan sát được (trình duyệt) khác tầng phát sinh (origin) — đúng cảnh báo
"Root-cause diagnosis" trong CLAUDE.md. Phải kiểm ở **cả hai**:

1. Origin: `curl -s -I http://localhost:3000/js/i18n.js` → `Cache-Control: public, max-age=31536000,
   immutable`; `curl -s -I http://localhost:3000/index.html` → `Cache-Control: no-cache`.
2. Qua domain thật, **sau khi người dùng khởi động lại server**:
   `curl -s -D - -o /dev/null https://play3cr.dpdns.org/js/i18n.js | grep cf-cache-status`
   → phải chuyển từ `REVALIDATED` sang **`HIT`** (có thể cần 2-3 request đầu để CF nạp cache biên).
   Nếu vẫn `REVALIDATED`/`DYNAMIC` thì origin header chưa tới được CF — điều tra tiếp, **đừng coi là
   xong** chỉ vì header ở localhost đã đúng.
3. Đo lại phân bố TTFB (10 request `index.html` như trong file TODO) và so với baseline đã ghi
   (trung vị 0.30s, 2/10 lần ~0.88-1.03s). Ghi số mới vào fix-log.

## Phạm vi KHÔNG làm

- **Không đụng dashboard Cloudflare trong mục này.** Tunnel chạy bằng token
  (`cloudflared tunnel run --token ...`), không có `config.yml` cục bộ — mọi cấu hình cache nằm trên
  dashboard, tức là ngoài repo và là quyền của người dùng. Sửa header ở origin là đủ để CF chuyển
  sang `HIT`; chỉ đề xuất Cache Rule cho người dùng **sau khi** đã đo và thấy origin header không đủ.
- **Không đụng `Cache-Control: no-store` trên `/api/auth/*`** — đã cố ý đặt ở #66, không được để
  option mới của `express.static` hay bất kỳ middleware chung nào ghi đè. Kiểm lại
  `curl -s -I http://localhost:3000/api/auth/me | grep -i cache` sau khi sửa.
- Không đổi cơ chế `?v=N` (không tự động hoá, không chuyển sang hash nội dung) — đó là việc riêng,
  lớn hơn nhiều.
- Không gộp #105 (compression) vào cùng commit — tách ra để đo được tách bạch mục nào có tác dụng.

## Test

- Test được bằng Jest + `supertest`: GET một `.js` và một `.html`, assert header `Cache-Control`
  khác nhau đúng như trên. Đây là loại assert rẻ và bắt được regression thật (một `app.use` mới chèn
  sai chỗ là hỏng), nên đáng viết.

Liên quan: #105 (compression, cùng vùng code) · #86 (độ trễ ~1s chưa tái hiện được — xem phần "Liên
hệ với #86" trong file TODO, **không** tự kết luận là cùng nguyên nhân).
