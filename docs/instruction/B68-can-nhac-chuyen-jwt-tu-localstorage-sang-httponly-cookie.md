# B68. Cân nhắc JWT → HttpOnly cookie (TODO.md #68)

**Nguồn:** `network_security_audit.md`, TODO.md #68; đã nêu ra ngoài phạm vi ở B65.

## Cách tiếp cận

- **Không code trực tiếp.** Theo quy tắc "New requirements/tasks" trong `CLAUDE.md`, mở
  `features/jwt-httponly-cookie/` (hoặc tên tương tự) để thảo luận trước: `user_story.md` nêu rõ
  actor nào bị ảnh hưởng (user thường, guest, socket reconnect), `planning.md` liệt kê câu hỏi mở —
  quan trọng nhất là Socket.IO hiện lấy token từ `localStorage` để gửi vào `auth: { token }` lúc
  handshake ([socket-client.js](../../client/js/socket-client.js)); nếu cookie `HttpOnly`, client JS
  không đọc được token nữa, cần xác định cookie có tự động đính kèm vào WS upgrade request hay
  không (có, với cùng-origin, nhưng cần server đọc cookie thay vì `auth.token` ở
  `SocketHandler.js`).
- Đừng bắt đầu sửa code trước khi `planning.md` được người dùng xác nhận.

## Cập nhật 2026-08-08 — thảo luận xong, đã chốt phương án C

Điều kiện "đừng code trước khi `planning.md` được xác nhận" ở trên **đã thoả**. Người dùng chốt
*"Follow standard & real-world practices"* → phiên mờ phía server, không phải JWT-trong-cookie.
Bảng quyết định Q1-Q7 + trình tự 12 bước nằm ở
[`features/jwt-httponly-cookie/planning.md`](../../features/jwt-httponly-cookie/planning.md);
không chép lại ở đây để tránh hai bản lệch nhau.

### Cạm bẫy đã biết (đọc trước khi code)

1. **Bảng `sessions` KHÔNG được `REFERENCES users(id)`.** Guest mang id `guest_<uuid8>` và không bao
   giờ có hàng trong `users` (`server/routes/auth.js` `POST /guest`). Khoá ngoại sẽ làm mọi phiên
   guest chết ngay. Khuôn mẫu đúng đã có sẵn hai lần trong `schema.sql`:
   `games.black_player_id` ("null for guests") và `tournament_players` (PK là `entry_id`,
   `player_id` nullable).
2. **Có HAI bản `getUserInfo()` gần như y hệt** — `client/js/socket-client.js:147` và
   `client/js/settings-panel.js:27`. Gộp làm một **trước** khi đổi hành vi; sửa một mà quên bản kia
   là kịch bản lỗi rõ ràng nhất của cả task.
3. **Id phiên là bí mật ngang token.** Không được để lọt vào body JSON, log, hay URL — chỉ đi qua
   `Set-Cookie`. Lọt vào body là quay lại đúng vấn đề #68 định giải quyết.
4. **`session:kicked` phải ghi `revoked_at` TRƯỚC khi ngắt socket** (`SocketHandler.js:119-126`).
   Chỉ ngắt socket thì bị đá xong kết nối lại là vào tiếp — "thu hồi được" chỉ có trên giấy.
5. **`cors.origin` của Socket.IO KHÔNG bảo vệ WebSocket** (trình duyệt không áp CORS cho WS). Kiểm
   `Origin` phải làm tường minh, nếu không là đổi lỗ hổng XSS-trộm-token lấy lỗ hổng CSWSH.
6. **Cờ `Secure` phải suy từ request, không hardcode.** Prod chạy HTTPS sau Cloudflare Tunnel, dev
   chạy `http://localhost:3000` — hardcode `Secure: true` làm cookie bị bỏ im lặng ở dev
   (`trust proxy: 'loopback'` đã có sẵn để suy `req.secure`).
7. **`/upgrade-session` giữ nguyên hạn còn lại của JWT cũ**, không gia hạn thêm 7 ngày — nếu không
   thì migration âm thầm kéo dài mọi phiên.

### Ranh giới — đừng làm

- Không đụng `JWT_SECRET`, thuật toán ký, hay chính sách thời hạn (7d/24h giữ nguyên).
- Không thêm refresh token / rotation / reuse detection — đã loại ở khảo sát ngành, quá nặng cho
  app này.
- Không thêm xác thực cho `/api/games/*` (đang công khai read-only có chủ đích).
- Không xây "đăng xuất mọi thiết bị" / danh sách phiên trong đợt này — bảng `sessions` mở đường cho
  chúng, nhưng chúng là tính năng riêng.

## Độ ưu tiên

~~Thấp~~ → **Trung bình** sau khi chốt C. Không phải vì rủi ro XSS tăng (B65 vẫn giữ nguyên tác
dụng), mà vì phạm vi đã bao gồm một năng lực còn thiếu thật sự: **không thu hồi được phiên**. Hôm
nay token lộ là dùng được tới 7 ngày kể cả sau khi đổi mật khẩu, và `session:kicked` không thực sự
đá được ai.
