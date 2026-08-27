# B124 — `get-client-ip.js` lấy phần tử cuối của XFF

Hướng dẫn thực thi cho TODO.md #124 (chưa làm).

## Cách tiếp cận khi làm

- Sửa đúng `server/utils/get-client-ip.js:48`: `forwarded.split(',')[0].trim()` →
  `forwarded.split(',').pop().trim()`.
- **Không đụng** nhánh ưu tiên `CF-Connecting-IP` (dòng phía trên) và **không đụng**
  `LOOPBACK_ADDRESSES`/điều kiện chỉ tin XFF khi peer loopback — cả 2 vẫn đúng, giữ nguyên.
- Hàm này dùng chung cho cả Socket.io (`resolveClientIp`) lẫn Express (`getClientIpFromReq`) — sửa
  1 chỗ là áp dụng cho cả 2 đường gọi, không cần sửa 2 nơi.

## Test

- Mở `server/tests/get-client-ip.test.js`, thêm case: `X-Forwarded-For: "1.1.1.1, 10.0.0.5"`, peer
  loopback, không có `CF-Connecting-IP` → assert kết quả là `"10.0.0.5"` (phần tử cuối), không phải
  `"1.1.1.1"`.
- Chạy lại toàn bộ suite phụ thuộc hàm này nếu có (`auth-rate-limit-ip.test.js`,
  `games`/`tournamentGames` rate-limit test nếu B92/B93 đã dùng chung logic) để chắc không hồi quy.

## Phạm vi KHÔNG làm

- Không đổi cách Socket.io hay Express gọi hàm này (`state.js`, `routes/*.js`) — chỉ sửa bên trong
  `resolveClientIp()`.
- Không thêm `trust proxy` config mới ở Express — vẫn dùng `req.socket.remoteAddress` trực tiếp
  như hiện tại (lý do đã ghi trong comment gốc của file).

Xem thêm: [docs/todo/B124-getclientip-xff-lay-phan-tu-cuoi-thay-vi-dau.md](../todo/B124-getclientip-xff-lay-phan-tu-cuoi-thay-vi-dau.md).
Liên quan: `#44` (B44, ưu tiên `CF-Connecting-IP`), `#92`/`#93` (rate limiter dùng chung hàm này).
