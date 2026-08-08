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

## Độ ưu tiên

Thấp — B65 đã giảm rủi ro XSS-đọc-token đáng kể. Đây là phòng thủ theo chiều sâu, không phải vá lỗ
hổng đang khai thác được.
