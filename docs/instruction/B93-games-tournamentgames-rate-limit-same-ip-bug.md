# B93 — `gamesLimiter`/`tournamentGamesLimiter` có đúng lỗi IP-gộp y hệt #92

Hướng dẫn thực thi cho TODO.md #93 (chưa làm — chỉ ghi lại khi phát hiện).

## Cách tiếp cận khi làm

- **Tái dùng nguyên `getClientIpFromReq()` + `ipKeyGenerator()` từ #92**
  (`server/utils/get-client-ip.js`) — không viết logic IP-resolution mới, không điều tra lại từ
  đầu. Chỉ thêm `keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '')` vào 2
  `rateLimit()` call ở `games.js` và `tournamentGames.js`, đúng khuôn mẫu `authLimiter` đã sửa.
- **Đo trước khi sửa nếu cần xác nhận mức độ nghiêm trọng thật** — #92 chỉ sửa vì có báo cáo người
  dùng cụ thể ("My phone cannot log out"); #93 hiện chưa có báo cáo tương tự cho `/api/games`
  hay `/api/tournaments/:id/games`. Cân nhắc hỏi lại người dùng có thực sự cần ưu tiên hay để đó,
  vì ngưỡng 300 req/15 phút khó chạm tới hơn nhiều so với 20 req/15 phút của auth.
- **Viết test theo đúng khuôn mẫu `server/tests/auth-rate-limit-ip.test.js`** (mount router thật,
  không mock `express-rate-limit`, xác nhận 2 IP khác nhau nhận 2 ngân sách độc lập) nếu quyết định
  làm.

## Phạm vi KHÔNG làm

- Không đổi ngưỡng 300 request/15 phút.
- Không đụng logic đã có ở `get-client-ip.js` — chỉ wiring thêm 2 chỗ gọi.

Xem #92 (fix gốc cùng nguyên nhân): [docs/todo/B92-auth-rate-limit-shared-ip-behind-tunnel.md](../todo/B92-auth-rate-limit-shared-ip-behind-tunnel.md).
