# Phần A #11. Hành vi khi bật `permessage-deflate`

**Nguồn:** `gomoku-vn-review(1).md` vòng 3, mục 12.6 (kiểm chứng 2026-08-02)


#### 11. Hành vi khi bật `permessage-deflate`

- Dự án không cấu hình gì cho `perMessageDeflate` của engine.io/socket.io —
  giả định đang tắt theo mặc định, **chưa xác minh runtime thật**.
- Cần quyết định: có bật hay không (đánh đổi CPU nén ↔ băng thông), rồi đo lại
  băng thông/độ trễ thật trên server đang chạy nếu bật. Là quyết định vận
  hành/cấu hình, không phải lỗi code cần sửa.

---
