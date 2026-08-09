# #92 — `express-rate-limit` gộp mọi client thành 1 IP đằng sau Cloudflare Tunnel

**Trạng thái:** ✅ ĐÃ XONG

`authLimiter` (`server/routes/auth.js`, 20 request/15 phút) dùng key mặc định của
`express-rate-limit` — `req.ip`, tức Express's `trust proxy`-aware resolution — trong khi
`cloudflared` kết nối vào Node process qua loopback. Kết quả: MỌI client thật (điện thoại, laptop,
bất kỳ ai) đều rơi vào cùng 1 "IP" quan sát được, chia sẻ chung đúng 1 ngân sách 20 request/15
phút thay vì mỗi người 1 ngân sách riêng — 1 thiết bị test nhiều lần (đăng nhập/đăng xuất lặp lại
lúc debug OAuth, TODO.md #91) đủ để khoá "Too many requests" cho MỌI thiết bị khác đang dùng cùng
domain, kể cả những người chưa từng gửi request nào.

Đã thêm `server/utils/get-client-ip.js` (hàm dùng chung `resolveClientIp()` + wrapper
`getClientIpFromReq()` cho Express) tái dùng đúng logic CF-Connecting-IP đã có ở
`socket/state.js`'s `getClientIp(socket)` (TODO.md #44/§44), refactor `getClientIp(socket)` để gọi
lại hàm dùng chung thay vì có 2 bản logic trùng lặp, và gắn `keyGenerator` (qua
`express-rate-limit`'s `ipKeyGenerator()` helper, bắt buộc từ v8 để tránh bypass qua IPv6) vào
`authLimiter`. `npm test`: 984/984 pass (+8 test case mới cho `getClientIpFromReq()`, +1 test
integration xác nhận 2 IP khác nhau nhận 2 ngân sách độc lập qua chính router thật, không mock).

## Yêu cầu gốc (người dùng, 2026-08-09)

Trong lúc xác minh thủ công Google OAuth (TODO.md #91) qua `https://play3cr.dpdns.org`:

> Too many requests, please try again later.
> hmm?
> [...]
> It just affect same IP?
> My phone cannot log out

## Phạm vi đã làm

- `server/utils/get-client-ip.js` (mới): `resolveClientIp(headers, remoteAddress)` — logic lõi
  dùng chung (CF-Connecting-IP ưu tiên tuyệt đối; nếu vắng thì chỉ tin X-Forwarded-For khi peer
  TCP trực tiếp là loopback, y hệt ngữ nghĩa `trust proxy: 'loopback'` của Express) và
  `getClientIpFromReq(req)` — wrapper đọc `req.headers` + **`req.socket.remoteAddress` thô** (cố
  ý KHÔNG dùng `req.ip`, vì `req.ip` đã tự trộn X-Forwarded-For vào trước khi hàm này thấy được,
  làm mất khả năng phân biệt "peer loopback → tin XFF" khỏi "peer không loopback → bỏ qua XFF").
- `server/socket/state.js`'s `getClientIp(socket)`: refactor gọi lại `resolveClientIp()` dùng
  chung — hành vi/test hiện có (`server/tests/get-client-ip.test.js`) giữ nguyên 100%, không đổi
  gì quan sát được từ bên ngoài.
- `server/routes/auth.js`'s `authLimiter`: thêm `keyGenerator: (req) =>
  ipKeyGenerator(getClientIpFromReq(req) || '')` — `ipKeyGenerator()` là helper chính chủ của
  `express-rate-limit` v8, bắt buộc dùng khi viết `keyGenerator` tùy chỉnh (thư viện tự cảnh báo
  nếu thiếu) để chuẩn hoá địa chỉ IPv6 về subnet /56, chặn 1 client IPv6 xoay vòng địa chỉ trong
  cùng subnet để né rate limit.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** cao — đúng nguyên nhân người dùng gặp phải, xác nhận lại bằng test integration
  dùng chính router thật (không mock `express-rate-limit`): IP A dùng hết 20 request → 429; IP B
  (khác `cf-connecting-ip`, cùng peer loopback y hệt điều kiện tunnel) vẫn 200 ngay sau đó.
- **An toàn:** không nới lỏng rate limit (vẫn 20/15 phút mỗi client) — chỉ sửa cách XÁC ĐỊNH client
  là ai. Dùng lại nguyên logic CF-Connecting-IP đã qua kiểm chứng ở #44 (không tự nghĩ cách mới),
  và dùng `ipKeyGenerator()` chính chủ thay vì tự viết chuẩn hoá IPv6 (tránh đúng loại lỗ hổng thư
  viện đã cảnh báo).
- **Phạm vi CỐ Ý KHÔNG làm:** `server/routes/games.js`'s `gamesLimiter` (300 req/15 phút) và
  `server/routes/tournamentGames.js`'s `tournamentGamesLimiter` (300 req/15 phút) có ĐÚNG lỗi gốc
  y hệt (cùng dùng `req.ip` mặc định, không `keyGenerator`) — nhưng người dùng chỉ báo cụ thể lỗi
  ở luồng đăng nhập/đăng xuất, và ngân sách 300 req/15 phút ít khả năng chạm tới hơn nhiều so với
  20 req/15 phút của auth. Theo đúng quy tắc "Bug-fix workflow: scope discipline" (CLAUDE.md),
  không tự mở rộng fix sang 2 route đó — ghi lại làm việc riêng, xem TODO.md #93.

## Trạng thái unit test

`server/tests/get-client-ip.test.js`: thêm describe block mới `getClientIpFromReq()` (6 test case
— CF-Connecting-IP ưu tiên, fallback XFF khi peer loopback đúng như điều kiện tunnel, bỏ qua XFF
khi peer không loopback, 2 IP thật khác nhau qua cùng peer loopback phải cho 2 kết quả khác nhau,
không có `remoteAddress`/header nào, thiếu hẳn `req.socket`). `server/tests/auth-rate-limit-ip.test.js`
(mới): mount router thật (không mock `express-rate-limit`, khác mọi suite khác của `auth.js`),
dùng hết 20 request ngân sách của 1 `cf-connecting-ip`, xác nhận request thứ 21 → 429, rồi xác nhận
1 `cf-connecting-ip` KHÁC vẫn 200 ngay sau đó. `npm test` toàn bộ repo: 984/984 pass.

Chi tiết đầy đủ: [docs/instruction/B92-auth-rate-limit-shared-ip-behind-tunnel.md](../instruction/B92-auth-rate-limit-shared-ip-behind-tunnel.md).
