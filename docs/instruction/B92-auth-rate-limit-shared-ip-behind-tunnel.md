# B92 — `express-rate-limit` gộp mọi client thành 1 IP đằng sau Cloudflare Tunnel

Hướng dẫn thực thi cho TODO.md #92. Phát hiện trong lúc người dùng xác minh thủ công Google OAuth
(TODO.md #91) qua `https://play3cr.dpdns.org` — không phải bug của OAuth, mà là 1 lỗ hổng có sẵn
trong hạ tầng rate-limit lộ ra khi thử qua tunnel.

## Cách tiếp cận bắt buộc

- **Tái dùng logic CF-Connecting-IP đã có ở `socket/state.js`'s `getClientIp(socket)` (§44)**,
  KHÔNG viết lại từ đầu. Trích phần lõi (không phụ thuộc `socket`) ra 1 file dùng chung
  (`server/utils/get-client-ip.js`), rồi cho cả `getClientIp(socket)` lẫn hàm mới cho Express
  cùng gọi vào đó — đảm bảo 2 nơi không bao giờ lệch nhau về sau.
- **Dùng `req.socket.remoteAddress`, KHÔNG dùng `req.ip`**, khi viết hàm cho Express. `req.ip` đã
  được Express tự trộn X-Forwarded-For vào (theo `trust proxy` config) TRƯỚC khi hàm này thấy nó —
  làm mất khả năng phân biệt "peer là loopback → được tin X-Forwarded-For" khỏi "peer không phải
  loopback → PHẢI bỏ qua X-Forwarded-For" (đúng lỗ hổng giả mạo mà logic gốc ở §44 được viết ra để
  chặn). `req.socket.remoteAddress` luôn là peer TCP thô, không bị `trust proxy` ảnh hưởng — khớp
  chính xác với `socket.handshake.address` mà bản gốc dùng.
- **Bắt buộc dùng `express-rate-limit`'s `ipKeyGenerator()` helper khi viết `keyGenerator` tùy
  chỉnh** (`require('express-rate-limit').ipKeyGenerator`) — thư viện (v8+) tự kiểm tra source
  code của `keyGenerator` và cảnh báo nếu thiếu, vì thiếu nó cho phép 1 client IPv6 xoay địa chỉ
  trong cùng subnet /56 để né rate limit vô hạn. Không tự viết chuẩn hoá IPv6.
- **Sửa `authLimiter` trước, KHÔNG tự mở rộng sang `gamesLimiter`/`tournamentGamesLimiter`** dù
  cả 3 có đúng lỗi gốc y hệt (cùng thiếu `keyGenerator`) — người dùng chỉ báo cụ thể luồng
  đăng nhập/đăng xuất bị ảnh hưởng, và theo "Bug-fix workflow: scope discipline" (CLAUDE.md) không
  tự suy diễn sang phạm vi chưa được xác nhận. Đã ghi lại 2 route kia thành việc riêng — xem
  TODO.md #93 / `docs/instruction/B93-*.md`.

## Điểm dễ sai (đã tránh)

- **Đừng tưởng đây là bug của OAuth (#91).** Route `/api/auth/google`/`/callback` chỉ TÌNH CỜ là
  nơi lộ ra lỗi này (vì luồng test lặp đi lặp lại đăng nhập/đăng xuất tạo nhiều request nhất) —
  `authLimiter` áp dụng cho MỌI route trong `auth.js` (`register`/`login`/`guest`/`logout` đều
  chung 1 ngân sách), không riêng gì OAuth.
- **Đừng nới ngưỡng 20 request/15 phút để "sửa"** — đúng như "Đừng làm" đã ghi trong
  `instruction.md` ("Đừng nới rate limiter trong code production chỉ để tự test được"). Vấn đề
  không phải ngưỡng quá thấp, mà là NGƯỠNG ĐÓ ĐANG BỊ CHIA SẺ SAI giữa nhiều client thật — sửa
  đúng chỗ là xác định lại đúng client, không phải nới ngưỡng.
- **Bug này CÓ TRÊN CẢ `main`** (đã xác minh bằng `git show main:server/routes/auth.js`) — không
  phải chỉ có trên `dev`/`feature/oauth-login`. Theo quy tắc git workflow chung, branch off `main`
  (`fix/auth-rate-limit-shared-ip`), không branch off `dev` dù phát hiện ra nó trong lúc test
  nhánh `feature/oauth-login`.
- **Đánh số TODO #92 (không phải #90)** dù `TODO.md` trên `main` lúc branch chỉ mới tới #89 — vì
  `dev` đã dùng #90 (B90, tournament scroll bug) và #91 (B91, OAuth) cho 2 việc KHÁC. Nếu file này
  lấy số #90 trên `main`, khi `dev` → `main` merge sau này 2 file `TODO.md` sẽ có `#90` trỏ tới 2
  nội dung khác nhau — xung đột đánh số thật, không chỉ là merge-conflict văn bản thông thường.
  Luôn cộng thêm 1 vào số lớn nhất đã dùng ở BẤT KỲ branch nào đang hoạt động, không chỉ dựa vào
  số lớn nhất trong chính file đang sửa.

## Phạm vi KHÔNG làm (ngoài yêu cầu gốc)

- Không sửa `gamesLimiter`/`tournamentGamesLimiter` (xem TODO.md #93 — việc riêng, chưa làm).
- Không nới/đổi ngưỡng 20 request/15 phút của `authLimiter`.
- Không đụng logic `getClientIp(socket)`'s hành vi quan sát được — chỉ refactor để dùng chung code,
  test cũ (`get-client-ip.test.js`) phải xanh nguyên vẹn không sửa 1 assertion nào.

Xem tóm tắt triển khai + kết quả test: [docs/todo/B92-auth-rate-limit-shared-ip-behind-tunnel.md](../todo/B92-auth-rate-limit-shared-ip-behind-tunnel.md).
