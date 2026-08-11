# #107 — Cả 4 trang nạp bản socket.io **debug chưa minify** (156 KB) thay vì `socket.io.min.js` (47 KB)

**Trạng thái:** ✅ ĐÃ XONG (2026-08-12, nhánh `fix/socket-io-min-js`)

Đã đổi đủ 4 chỗ sang `socket.io.min.js` (155 836 B → 46 822 B, −109 014 B/trang). Không thêm `?v=`
vào URL này và không bump `?v=N` (chỉ đụng `client/*.html`, không đụng `client/css|js/` — quy tắc
cache-busting không kích hoạt; grep kiểm tra vẫn ra đúng một giá trị `?v=103`). Không có unit test
(thay đổi thuần client HTML, repo chưa có runner cho tầng này). Xác minh bằng trình duyệt thật qua
domain (phải qua domain vì `CORS_ORIGIN` chỉ cho phép origin thật): socket kết nối qua WebSocket,
danh sách online có dữ liệu, chỉ `.min.js` được yêu cầu, không lỗi console từ mã repo. Chi tiết:
[docs/fix-log/2026-08-12-todo-107-socket-io-min-js.md](../fix-log/2026-08-12-todo-107-socket-io-min-js.md).

Cả 4 trang dùng socket.io đều tham chiếu `/socket.io/socket.io.js`:

- `client/index.html:478`
- `client/room.html:170`
- `client/tournament.html:204`
- `client/tournament-match.html:184`

`/socket.io/socket.io.js` là bản **development, chưa minify** mà server socket.io tự phục vụ. Bản
minify nằm ngay cạnh nó và server đã sẵn sàng trả về, không cần cài hay build gì thêm:

```
$ curl -s -o /dev/null -w "%{size_download} %{http_code}" http://localhost:3000/socket.io/socket.io.js
155836 200
$ ... /socket.io/socket.io.min.js
46822 200      ← nhỏ hơn 109 014 B (70%)
$ ... /socket.io/socket.io.esm.min.js
40435 200
```

**156 KB chưa nén là file lớn NHẤT trên đường tới hạn của trang sảnh** — lớn hơn cả `i18n.js`
(73 KB) và hơn cả 2 file font Phosphor `.woff2` (147 KB + 150 KB) tính riêng từng cái.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **An toàn: rất cao.** Đổi 4 chuỗi ký tự trong 4 file HTML, `socket.io.js` → `socket.io.min.js`.
  Cùng một thư viện, cùng phiên bản, cùng API — chỉ khác việc đã bỏ comment/whitespace và rút gọn
  tên biến nội bộ. Không có API nào chỉ tồn tại ở bản debug.
- **Hiệu quả: cao so với công sức bỏ ra** — tiết kiệm 109 KB/trang (chưa nén) với 4 dòng sửa. Đây là
  tỉ lệ lợi ích/công sức tốt nhất trong cả nhóm #105-#110.
- **Chi phí đánh đổi duy nhất:** stack trace từ bên trong socket.io khi debug sẽ khó đọc hơn. Chấp
  nhận được — không có quy trình debug nào của repo hiện phụ thuộc vào việc đọc nội bộ socket.io
  (`docs/` không có mục nào như vậy), và có thể tạm đổi lại 1 dòng khi cần.
- **Nhớ bump `?v=N`?** Không — đường dẫn `/socket.io/socket.io.js` do server socket.io phục vụ, không
  nằm trong `client/` và hiện không mang `?v=`. Xem instruction để biết vì sao **không** nên thêm.

Chi tiết: [docs/instruction/B107-socket-io-ban-debug-khong-minify.md](../instruction/B107-socket-io-ban-debug-khong-minify.md).
