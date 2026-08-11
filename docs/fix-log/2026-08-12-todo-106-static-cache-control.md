# Fix log entry — 2026-08-12 05:52

## Prompt

> Do #107 (trivial) → #106 (the actual fix) → #108a/c → measure again

Mục #106: `express.static(clientPath)` gọi không option → `Cache-Control: public, max-age=0` cho
mọi asset, ép trình duyệt VÀ Cloudflare revalidate về origin mỗi lần tải trang.

## Action

- Thêm `server/config/staticCache.js` chứa `setStaticCacheHeaders`/`staticOptions`:
  `*.html` → `no-cache`, phần còn lại → `public, max-age=31536000, immutable`.
- `server/index.js`: `express.static(clientPath, staticOptions)`.
- `server/index.js`: nhánh catch-all SPA (`res.sendFile(login.html)`) **không** đi qua `setHeaders`
  của `express.static`, nên đặt `Cache-Control: no-cache` tường minh ở đó — cùng chính sách, cùng
  loại file.
- Test mới `server/tests/static-cache-control.test.js` (17 case, tất cả xanh).

## Decision

- **Tách file riêng thay vì đặt option nội tuyến trong `index.js`** — theo đúng khuôn mẫu
  `server/config/csp.js`: `server/index.js` gọi `listen()` ngay khi require, nên logic muốn test
  được thì phải nằm ngoài nó.
- **Không dùng `supertest`** như instruction gợi ý: repo không có `supertest` trong
  `package.json`, và khuôn mẫu sẵn có của repo (`server/tests/auth-cache-control.test.js`) là dựng
  express nhỏ + `http.createServer` + `fetch`. Đi theo khuôn mẫu sẵn có thay vì thêm dependency —
  đây là chỗ duy nhất lệch khỏi instruction, và lệch về cách viết test chứ không phải nội dung.
- Test phủ **hai tầng** cố ý: hàm chính sách thuần (bảng phân lớp tương đương theo loại file +
  biên `.html` — `html-utils.js`, `index.html.js`, `.htm`, `.HTML` phải vẫn immutable), và một
  mount `express.static` thật phục vụ thư mục `client/` thật (hàm đúng không chứng minh nó đã được
  nối vào middleware).
- Case 304 dùng `http.get` thô chứ **không** dùng `fetch`: undici có HTTP cache riêng và trả lại
  304 cho caller thành 200 kèm body đã cache — dùng `fetch` ở đây sẽ che mất hồi quy thật. Đã kiểm
  chứng bằng `curl` trên server thật: `If-None-Match` → `304`.
- Không đụng dashboard Cloudflare, không đổi cơ chế `?v=N`, không gộp #105 (compression) vào —
  đúng phần "phạm vi KHÔNG làm".
- Không bump `?v=N`: chỉ đụng `server/`, không đụng `client/css|js/`.

## Summary output

```
$ npx jest server/tests/static-cache-control.test.js
Tests:       17 passed, 17 total
$ npm test
Test Suites: 51 passed, 51 total
Tests:       1087 passed, 1087 total
```

`no-store` của #66 trên `/api/auth/*` không bị ảnh hưởng: `express.static` không khớp đường dẫn
`/api`, và `server/tests/auth-cache-control.test.js` vẫn xanh trong lần chạy đầy đủ trên.

**Chưa xác minh được ở tầng origin thật và qua Cloudflare tại thời điểm commit này** — server thật
đang chạy (pid 582452) là tiến trình của người dùng, và CLAUDE.md cấm khởi động lại hay can thiệp
vào server mình không tự khởi động; `DB_PATH` lại hardcode nên không thể dựng bản thứ hai mà không
đụng DB thật. Header đo được **trước** khi sửa (baseline, để so sánh sau khi người dùng khởi động
lại):

```
origin  /js/i18n.js                     Cache-Control: public, max-age=0
origin  /index.html                     Cache-Control: public, max-age=0
domain  /js/i18n.js                     cf-cache-status: REVALIDATED
domain  /index.html                     cf-cache-status: DYNAMIC
domain  TTFB index.html ×10             0.282–0.298s (lần đo này không có đỉnh ~1s)
```

Bước còn lại (bắt buộc, chưa làm): sau khi người dùng khởi động lại server, `curl -I` ở origin phải
ra `immutable` cho `.js` và `no-cache` cho `.html`, và `cf-cache-status` qua domain phải chuyển
`REVALIDATED` → `HIT`. **Không coi mục #106 là đóng hoàn toàn cho tới khi đo được bước này** —
đúng cảnh báo "Root-cause diagnosis" trong CLAUDE.md (tầng quan sát ≠ tầng phát sinh).
