# Phần B #68. Cân nhắc chuyển JWT từ `localStorage` sang `HttpOnly` cookie

**Nguồn:** báo cáo `network_security_audit.md` (Antigravity IDE, 2026-08-08); đã nêu ở [[B65]] mục
"Ngoài phạm vi" — *"Không đổi `localStorage` sang cookie chỉ vì finding này. Cookie `HttpOnly` là một
quyết định auth/CSRF lớn, cần threat model và migration riêng."* Mục này là task riêng đó.

## Vấn đề đã xác nhận

`gvn_token` (JWT, hạn 7 ngày cho user thường / 24h cho guest) lưu ở `localStorage` — đọc được bởi
bất kỳ JS nào chạy cùng origin. [[B65]] đã chặn script bên thứ ba không tin cậy chạy trong origin
(CSP `script-src 'self'`, bỏ unpkg), giảm mạnh bề mặt tấn công XSS, nhưng không loại bỏ hoàn toàn
rủi ro nếu tương lai có lỗ hổng XSS tự thân (vd. một field user-controlled render sai chỗ).
`HttpOnly` cookie sẽ khiến token không đọc được bằng JS ngay cả khi có XSS.

## Việc cần làm (nếu quyết định làm)

- Đây là thay đổi kiến trúc auth, KHÔNG làm trực tiếp — cần `features/<slug>/` thảo luận trước theo
  quy tắc "New requirements/tasks" trong `CLAUDE.md`: đánh giá CSRF (cookie cần
  `SameSite`/CSRF token đi kèm), tác động lên Socket.IO handshake hiện đang gửi token qua
  `auth: { token }` (client đọc từ `localStorage` — nếu chuyển cookie, cần cơ chế khác để socket lấy
  token, vd. cookie tự động gửi kèm HTTP upgrade request, cần đọc lại `SocketHandler.js` xử lý auth
  thế nào), và migration cho user đang có token cũ trong `localStorage`.
- Không tự quyết định đây là bug cần sửa — độ ưu tiên thấp vì [[B65]] đã giảm rủi ro XSS đáng kể;
  ghi nhận là cải thiện phòng thủ theo chiều sâu (defense-in-depth), không phải lỗ hổng đang bị khai
  thác được.

## Trạng thái

Chưa làm — cần thảo luận `features/` trước khi lên kế hoạch code.
