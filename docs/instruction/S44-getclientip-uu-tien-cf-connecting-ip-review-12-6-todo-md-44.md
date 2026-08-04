# §44. `getClientIp()` ưu tiên `CF-Connecting-IP` (review 12.6, TODO.md #44)

## §44 — `getClientIp()` ưu tiên `CF-Connecting-IP` (review 12.6, TODO.md #44)

**Bối cảnh xác nhận (2026-08-04, qua Cloudflare API, không phải giả định):**
zone `play3cr.dpdns.org` (id `5008081877e47332e151721d4d3cc8c9`) là zone
riêng trên Cloudflare, `status: active`, bản ghi CNAME trỏ tới tunnel
`aae65c10-cae3-4fdf-8e61-42e3c59a954f.cfargotunnel.com` với `proxied: true`.
Tunnel `GomokuApp` chỉ có 1 ingress rule (`play3cr.dpdns.org →
http://localhost:3000`, `originRequest: {}`, không override gì). Hai dữ kiện
này cùng xác nhận: (1) mọi request public đều đi qua Cloudflare edge thật —
Cloudflare **tự set** `CF-Connecting-IP` ở edge, ghi đè bất kỳ giá trị client
tự gửi, không thể giả mạo; (2) `cloudflared` nối vào Node qua loopback trần,
đúng như `trust proxy: 'loopback'`/`getClientIp()` hiện tại đang giả định.

**Chỗ sửa:** `getClientIp(socket)` trong `server/socket/state.js`. Thứ tự ưu
tiên mới:
1. `socket.handshake.headers['cf-connecting-ip']` nếu có mặt — dùng thẳng,
   không cần kiểm `socket.handshake.address` có phải loopback hay không
   (Cloudflare tự đảm bảo tính đúng đắn của header này ở edge, khác
   `X-Forwarded-For` vốn client tự viết được).
2. Không có `CF-Connecting-IP` (vd. dev local không qua Cloudflare) → giữ
   nguyên logic cũ: đọc `X-Forwarded-For` **chỉ khi** `socket.handshake.
   address` là loopback, ngược lại dùng thẳng `socket.handshake.address`.

**Vì sao vẫn giữ fallback thay vì xoá hẳn nhánh `X-Forwarded-For`:** dev
local (`npm start` không qua tunnel) và bất kỳ deployment tương lai nào khác
Cloudflare Tunnel vẫn cần đường vào cũ hoạt động — đừng coi cấu hình hiện tại
là vĩnh viễn.

**Không đụng:** phía Express (`app.set('trust proxy', 'loopback')` trong
`server/index.js`) — đây là tầng khác (HTTP route, dùng cho `authLimiter`),
không liên quan tới `getClientIp()` (tầng socket, dùng cho
`MAX_ROOMS_PER_IP`). Không gộp 2 tầng lại dù chúng dùng chung ý tưởng
"loopback nghĩa là tin cậy".

**Test dự kiến:** thêm case vào `server/tests/LobbyHandler.test.js` (hoặc
file test hiện có của `getClientIp`) — (a) có header `cf-connecting-ip` →
dùng đúng giá trị đó dù `x-forwarded-for` khác; (b) không có
`cf-connecting-ip`, peer loopback, có `x-forwarded-for` → hành vi y hệt
trước khi sửa (regression guard); (c) không có cả hai → dùng
`socket.handshake.address`. Mutation-check: gỡ nhánh ưu tiên
`cf-connecting-ip` → case (a) phải đỏ.

---
