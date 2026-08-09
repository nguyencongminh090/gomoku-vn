# A67. Xác minh HSTS qua Cloudflare Tunnel (TODO.md #67)

**Nguồn:** `network_security_audit.md`, TODO.md #67.

## Cách tiếp cận

- Đây là việc **đo**, không phải sửa code — giống toàn bộ nhóm Phần A khác. Đừng thêm
  `hsts: {...}` vào `helmet()` trong `server/index.js` chỉ vì audit gợi ý — code hiện tại đã đúng
  (Helmet bật HSTS mặc định), thêm lại là dư thừa, không phải fix.
- Chạy `curl -sI https://<domain thật>` từ máy ngoài mạng nội bộ (không phải localhost — cần đi
  qua Cloudflare Tunnel thật) và đọc header `Strict-Transport-Security`.
- Nếu người dùng không có quyền truy cập domain production lúc thực hiện, ghi rõ "chưa đo được,
  cần người dùng cung cấp domain/quyền truy cập" — không suy đoán kết quả.

## Đừng làm

- Đừng sửa `server/index.js` dựa trên claim của audit — claim đó (thiếu HSTS trong Helmet default)
  sai, đã đối chiếu trong docs/todo/A67.
