# Fix log entry — 2026-08-12 05:35

## Prompt

> Do #107 (trivial) → #106 (the actual fix) → #108a/c → measure again

Mục #107 trong chuỗi đó: cả 4 trang dùng socket.io đang nạp bản debug chưa minify.

## Action

Đổi `src="/socket.io/socket.io.js"` → `src="/socket.io/socket.io.min.js"` ở đúng 4 file:

- `client/index.html:478`
- `client/room.html:170`
- `client/tournament.html:204`
- `client/tournament-match.html:184`

Kiểm bằng lệnh trong instruction — `grep -rn "socket.io/socket.io" client/*.html` ra đúng 4 dòng,
tất cả `.min.js`, không còn dòng `.js` trần.

Kích thước đo từ server đang chạy: `155 836 B` → `46 822 B` (**−109 014 B/trang, −70%**).

## Decision

- **Không thêm `?v=N`** vào URL này, đúng như instruction: đường dẫn do chính server socket.io phục
  vụ (không phải `express.static` từ `client/`), phiên bản đi theo `node_modules`.
- **Không bump `?v=N`** cho phần còn lại: thay đổi chỉ đụng `client/*.html`, không đụng
  `client/css/` hay `client/js/`, nên quy tắc cache-busting trong CLAUDE.md không kích hoạt.
  `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` vẫn ra đúng một giá trị `?v=103`.
- Không đổi sang `.esm.min.js`, không nâng/hạ phiên bản socket.io — đều nằm trong "phạm vi KHÔNG
  làm" của instruction.
- Không có unit test tự động: đây là thay đổi thuần `client/*.html`, repo chưa có test runner cho
  tầng client (nêu rõ thay vì bỏ qua im lặng).

## Summary output

Xác minh thủ công bằng trình duyệt thật (Playwright, chromium) — **phải chạy qua domain thật**, vì
`.env` đặt `CORS_ORIGIN=https://play3cr.dpdns.org` nên socket.io từ chối kết nối khi origin là
`http://localhost:3000` (đây là cấu hình sẵn có, không liên quan thay đổi này):

```
login -> https://play3cr.dpdns.org/index.html
index: online-count= "— 2 đang online" panel-count= "2" users= 2
index: websocket = wss://play3cr.dpdns.org/socket.io/?EIO=4&transport=websocket
tournament: ioType= function
socket.io script requests: https://play3cr.dpdns.org/socket.io/socket.io.min.js
```

Socket kết nối thật (WebSocket mở, danh sách người online có dữ liệu), chỉ có `.min.js` được yêu
cầu, không lỗi console nào từ mã của repo. Lỗi console duy nhất là CSP chặn
`static.cloudflareinsights.com/beacon.min.js` — script do Cloudflare tự chèn, đã có từ trước, không
liên quan mục này.

Không có ván cờ nào được chơi trong lúc xác minh nên không có dòng nào ghi vào DB người dùng.
