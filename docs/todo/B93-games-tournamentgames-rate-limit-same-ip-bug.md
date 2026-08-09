# #93 — `gamesLimiter`/`tournamentGamesLimiter` có đúng lỗi IP-gộp y hệt #92, chưa sửa

**Trạng thái:** chưa làm

Phát hiện phụ khi sửa #92 (`authLimiter` gộp mọi client thành 1 IP đằng sau Cloudflare Tunnel, vì
dùng `req.ip` mặc định của `express-rate-limit` thay vì đọc CF-Connecting-IP). Cùng nguyên nhân gốc
tồn tại y hệt ở 2 rate limiter khác:

- `server/routes/games.js`'s `gamesLimiter` (`rateLimit({ windowMs: 15 * 60 * 1000, max: 300 })`)
- `server/routes/tournamentGames.js`'s `tournamentGamesLimiter` (cùng cấu hình)

Cả 2 đều KHÔNG có `keyGenerator` tùy chỉnh — giống hệt `authLimiter` trước khi sửa ở #92.

## Vì sao chưa sửa cùng lúc với #92

Theo "Bug-fix workflow: scope discipline" (CLAUDE.md): người dùng chỉ báo cụ thể lỗi ở luồng
đăng nhập/đăng xuất ("My phone cannot log out"), không phải ở `/api/games`/`/api/tournaments/:id/games`.
Mở rộng fix sang 2 route chưa được xác nhận là đang thật sự gây vấn đề là suy diễn ngoài phạm vi đã
cho — ghi lại thành việc riêng thay vì gộp vào fix #92.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ nghiêm trọng thấp hơn #92 đáng kể:** ngưỡng 300 request/15 phút (so với 20 của auth) —
  khó chạm tới hơn nhiều trong sử dụng bình thường, kể cả khi nhiều client thật bị gộp chung 1 "IP"
  quan sát được qua tunnel. Không có báo cáo người dùng nào cho thấy đây là vấn đề thực tế.
- **Fix dự kiến khi làm:** tái dùng nguyên `getClientIpFromReq()`/`ipKeyGenerator()` đã thêm ở #92
  (`server/utils/get-client-ip.js`) — không cần logic mới, chỉ thêm `keyGenerator` vào 2
  `rateLimit()` call, đúng khuôn mẫu `authLimiter` đã sửa.

Chi tiết: [docs/instruction/B93-games-tournamentgames-rate-limit-same-ip-bug.md](../instruction/B93-games-tournamentgames-rate-limit-same-ip-bug.md).
