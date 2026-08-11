# Fix log entry — 2026-08-12 06:41

## Prompt

> I stoppoed my server, you can run on your own during test

Tiếp nối [2026-08-12-todo-106-static-cache-control.md](2026-08-12-todo-106-static-cache-control.md),
vốn đóng lại với bước xác minh còn thiếu vì server thật là tiến trình của người dùng. Người dùng đã
dừng server và cho phép tự chạy.

## Action

Theo đúng quy tắc "Playwright/e2e testing: never run against the real user database" trong CLAUDE.md:

1. `md5sum server/db/gomoku.db` → `333fe279b589df4c480fdbf472431b75` (372 736 B), không có
   `-wal`/`-shm`.
2. `mv server/db/gomoku.db server/db/gomoku.db.pre-e2e` → khởi động `node server/index.js`, server
   tự tạo DB rỗng mới từ `schema.sql`.
3. Đo (kết quả bên dưới).
4. Dừng server, xoá DB tạm, `mv` DB thật trở lại, kiểm chứng lại md5 **và** đếm số dòng.

## Decision

- Không dùng DB thật cho lần đo này dù chỉ đo header — server chạy migration lúc boot, và quy tắc
  không có ngoại lệ "chỉ đọc thôi".
- Xác minh ở **cả ba** tầng như instruction yêu cầu (origin → Cloudflare → phân bố thời gian), chứ
  không dừng ở localhost.
- `index.html` giữ `cf-cache-status: DYNAMIC` là **đúng thiết kế**, không phải lỗi còn sót:
  `no-cache` nghĩa là Cloudflare không được phục vụ HTML từ biên mà không hỏi origin — đó chính là
  điều kiện để `?v=N` mới tới được người dùng ngay lần tải đầu.

## Summary output

**1. Origin** (`curl -I http://localhost:3000/...`):

```
/js/i18n.js                              Cache-Control: public, max-age=31536000, immutable
/css/main.css                            Cache-Control: public, max-age=31536000, immutable
/vendor/phosphor/regular/Phosphor.woff2  Cache-Control: public, max-age=31536000, immutable
/index.html                              Cache-Control: no-cache
/definitely-not-a-real-page (SPA catch-all)  Cache-Control: no-cache
/api/auth/me                             Cache-Control: no-store      ← #66 còn nguyên
```

**2. Qua Cloudflare** (3 request liên tiếp mỗi URL):

| URL | trước | sau |
|---|---|---|
| `/js/i18n.js` | `REVALIDATED` (mọi lần) | `REVALIDATED` → **`HIT`** → **`HIT`** |
| `/css/main.css` | `REVALIDATED` | `REVALIDATED` → **`HIT`** → **`HIT`** |
| `/vendor/.../Phosphor.woff2` | `REVALIDATED` | `REVALIDATED` → **`HIT`** → **`HIT`** |
| `/index.html` | `DYNAMIC` | `DYNAMIC` (đúng thiết kế — xem phần Decision) |

Cloudflare cũng thôi ghi đè Browser TTL: header trả về client giờ là chính
`public, max-age=31536000, immutable` chứ không còn `public, max-age=14400`.

**3. Trình duyệt thật** (Chromium, qua domain, đo bằng `performance.getEntriesByType('resource')`):

```
cold (xoá sạch cache):  27 resource | 25 qua mạng | 0 từ cache | 290.1 KB truyền
lần vào lại:            27 resource |  0 qua mạng | 25 từ cache |   0.0 KB truyền
```

Đây là hiệu quả thật của #106: **lần vào lại trước đây phải revalidate 25 lần về origin, giờ là 0
request mạng.**

**4. TTFB** (10 request/URL qua domain):

```
/index.html   0.281–0.300s (trung vị 0.29s) — không đổi, đúng như dự đoán: HTML vẫn về origin
/js/i18n.js   0.218–0.231s sau khi vào cache biên (lần đầu 0.295s)
```

`index.html` không nhanh lên là **đúng kỳ vọng** — nó cố ý không được cache ở biên. Cái mất đi là 25
round-trip còn lại, mỗi cái từng phải quay về origin qua tunnel mạng nhà; đó mới là nguồn của các
đỉnh ~1s trong baseline (2/10 lần vọt 0.88-1.03s), và cũng là lý do triệu chứng "thỉnh thoảng" chứ
không phải "luôn luôn".

**Lưu ý về baseline:** cả hai lần đo TTFB `index.html` trong phiên này (trước và sau) đều **không**
tái hiện được đỉnh ~1s ghi trong file TODO — 20/20 request đều trong khoảng 0.28-0.30s. Nên **không
được kết luận #106 đã sửa xong triệu chứng "sometime lag"** chỉ từ số liệu này; cái đo được chắc
chắn là 25 round-trip biến mất mỗi lần vào lại, còn việc điều đó có xoá hẳn triệu chứng người dùng
báo hay không thì cần người dùng dùng thật một thời gian mới biết. Liên hệ #86 vẫn để mở đúng như
file TODO đã ghi.

**5. Khôi phục DB:**

```
md5sum server/db/gomoku.db  →  333fe279b589df4c480fdbf472431b75   (khớp lúc đầu)
users 12 · games 64 · tournaments 1 · sessions 39
```

Không còn tiến trình `node server/index.js` nào chạy (server của người dùng đã dừng từ trước, bản
tạm đã bị dừng — **người dùng cần tự khởi động lại server của mình**).
