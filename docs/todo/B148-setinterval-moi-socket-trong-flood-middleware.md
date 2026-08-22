# #148 — Middleware chống flood tạo **một `setInterval(1s)` cho MỖI socket** (nợ khả năng mở rộng)

**Trạng thái:** chưa làm. Ưu tiên thấp — nợ scale, **không** phải vấn đề latency của HAR hiện tại.

**Nguồn:** đọc code trong lúc phân tích HAR #145 (2026-08-22). Không phải do HAR chỉ ra — HAR chỉ
có 1 kết nối nên hoàn toàn không thấy được vấn đề này.

## Vấn đề

`server/socket/SocketHandler.js`, middleware chống flood:

```js
io.use((socket, next) => {
  let eventCount = 0;
  ...
  const resetInterval = setInterval(() => { ... eventCount = 0; ... }, 1000);
  ...
  socket.on('disconnect', () => clearInterval(resetInterval));
  next();
});
```

Một timer 1 giây **cho mỗi kết nối**. Ở 1 000 người online là 1 000 timer đánh thức event loop mỗi
giây; ở 6 000 (quy mô đã dùng trong stress test §10 / #28) là 6 000. Mỗi lần thức đều là công việc
vô ích khi socket đang im — và nó phạt **tất cả mọi người**, vì Node chỉ có một event loop.

Cleanup thì đúng (`clearInterval` trong `disconnect`) ⇒ **không rò rỉ**. Đây thuần tuý là chi phí
thường trực, không phải bug.

## Việc cần làm

Bỏ timer-per-socket, thay bằng token bucket **tính lười** (lazy): lưu `tokens` + `lastRefillMs` trên
socket, mỗi lần `onevent` thì nạp lại theo thời gian đã trôi rồi trừ đi 1. Không cần timer nào cả.

Phương án thay thế nếu muốn giữ nguyên hình dạng logic hiện tại: **một** interval dùng chung quét
một `Set` các socket đang hoạt động. Kém hơn token bucket (vẫn thức đều đặn) nhưng là 1 timer thay
vì N.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa đo)

- **Hiệu quả:** 0 với 1 người chơi. Có ý nghĩa từ vài trăm kết nối trở lên — giảm jitter event loop.
  **Phải đo mới được khẳng định**, đừng viết con số vào code như một sự thật.
- **An toàn:** trung bình. Đây là code **chống lạm dụng**, không phải code tiện ích — sửa sai thì
  hoặc mở cửa cho flood, hoặc ngắt nhầm người chơi bình thường. `violationStreak` /
  `FLOOD_DISCONNECT_STREAK` (ngắt sau N giây liên tiếp vi phạm) là ngữ nghĩa **theo cửa sổ thời
  gian**, không map 1-1 sang token bucket — phải giữ được hành vi tương đương, xem instruction.
- **Test:** có hạ tầng thật ⇒ bắt buộc. Phải phủ cả đường "vượt ngưỡng thì bị chặn + nhận
  `RATE_LIMITED` đúng 1 lần mỗi cửa sổ" lẫn đường "vi phạm liên tiếp đủ streak thì bị ngắt", và
  đường biên "vi phạm rồi ngoan lại thì streak reset".
