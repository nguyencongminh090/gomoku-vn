# Fix log entry — 2026-08-09 18:19

## Prompt

Phát hiện giữa lúc xác minh thủ công Google OAuth (TODO.md #91) qua `https://play3cr.dpdns.org`:

> Too many requests, please try again later.
> hmm?
> [...]
> It just affect same IP?
> My phone cannot log out

## Action

Xác nhận `authLimiter` (`server/routes/auth.js`) dùng key mặc định của `express-rate-limit` —
`req.ip`. Đây chính là lớp Express's `trust proxy`-aware IP resolution — đằng sau Cloudflare
Tunnel, `req.socket.remoteAddress` luôn là loopback (cloudflared kết nối vào Node process qua đó),
nên `req.ip` (nếu không có `keyGenerator` riêng) rủi ro gộp MỌI client thật thành 1 "IP" quan sát
được, chia sẻ chung 1 ngân sách 20 request/15 phút thay vì mỗi người 1 ngân sách. Đây là cùng lớp
bug đã từng gặp ở TODO.md #44/§44 cho room quota (`socket.handshake.address` luôn `127.0.0.1` sau
tunnel) — nhưng bản vá đó (`getClientIp(socket)`, đọc `CF-Connecting-IP`) chỉ áp dụng cho
Socket.io, chưa từng áp dụng cho 3 `express-rate-limit` instance ở tầng HTTP
(`auth.js`/`games.js`/`tournamentGames.js`).

Xác nhận bug tồn tại trên CẢ `main` (`git show main:server/routes/auth.js`) — không phải riêng
`dev`/`feature/oauth-login` — nên branch off `main` theo đúng git workflow chung:
`fix/auth-rate-limit-shared-ip` (worktree riêng `gomoku-vn-fix-rate-limit-ip`, song song với
`gomoku-vn-oauth-login`).

Trích phần lõi CF-Connecting-IP/X-Forwarded-For/loopback của `getClientIp(socket)` ra file dùng
chung `server/utils/get-client-ip.js` (`resolveClientIp(headers, remoteAddress)` +
`getClientIpFromReq(req)` cho Express, đọc `req.socket.remoteAddress` thô — KHÔNG dùng `req.ip`,
vì `req.ip` đã tự trộn X-Forwarded-For vào trước khi hàm thấy được). Refactor
`socket/state.js`'s `getClientIp(socket)` gọi lại hàm dùng chung — hành vi/test cũ giữ nguyên
100%. Gắn `keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '')` vào `authLimiter`
— `ipKeyGenerator()` là helper bắt buộc của `express-rate-limit` v8 khi viết `keyGenerator` tùy
chỉnh (chuẩn hoá IPv6 về subnet /56, tránh bypass).

Không mở rộng fix sang `gamesLimiter`/`tournamentGamesLimiter` (có đúng lỗi y hệt) — người dùng
chỉ báo cụ thể luồng đăng nhập/đăng xuất; ghi lại thành `TODO.md #93`/`docs/todo/B93-*.md` theo
đúng "Bug-fix workflow: scope discipline".

## Decision

Đánh số `#92` (không phải `#90`, dù `TODO.md` trên `main` lúc branch chỉ mới tới `#89`) — vì `dev`
đã dùng `#90`/`#91` cho 2 việc khác (tournament scroll bug, Google OAuth). Đánh `#90` trên `main`
sẽ tạo xung đột đánh số thật khi `dev` → `main` merge sau này (2 nội dung khác nhau cùng trỏ 1 số).

Viết `server/tests/auth-rate-limit-ip.test.js` — suite DUY NHẤT trong repo mount `authLimiter`
thật (không mock `express-rate-limit`, khác mọi suite auth khác) để chứng minh trực tiếp: dùng hết
20 request của 1 `cf-connecting-ip` → request thứ 21 = 429; 1 `cf-connecting-ip` KHÁC ngay sau đó
vẫn 200. Đây là bằng chứng end-to-end cho đúng bug người dùng báo, không chỉ test hàm
`getClientIpFromReq()` cô lập.

## Summary output

- Branch: `fix/auth-rate-limit-shared-ip` (off `main`, worktree `gomoku-vn-fix-rate-limit-ip`)
- File mới: `server/utils/get-client-ip.js`, `server/tests/auth-rate-limit-ip.test.js`
- File sửa: `server/socket/state.js` (refactor `getClientIp` gọi hàm dùng chung, hành vi không đổi),
  `server/routes/auth.js` (`authLimiter` thêm `keyGenerator`), `server/tests/get-client-ip.test.js`
  (thêm describe block `getClientIpFromReq()`, 6 test case)
- `npm test`: 984/984 pass (mọi test cũ giữ nguyên, +15 test case mới)
- `TODO.md #92`/`docs/todo/B92-*.md` đánh dấu ✅ đã xong trong cùng lượt commit này.
- `TODO.md #93`/`docs/todo/B93-*.md` (mới, CHƯA làm): `gamesLimiter`/`tournamentGamesLimiter` có
  cùng lỗi, mức độ thấp hơn (300 req/15 phút), không có báo cáo người dùng cụ thể — ghi lại làm
  việc riêng.
