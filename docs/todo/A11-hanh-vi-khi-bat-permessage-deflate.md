# Phần A #11. Hành vi khi bật `permessage-deflate`

**Status:** ✅ CLOSED 2026-10-09 — decided: leave socket.io perMessageDeflate off (CPU per move; see server/index.js comment). Revisit with #174 numbers.

**Nguồn:** `gomoku-vn-review(1).md` vòng 3, mục 12.6 (kiểm chứng 2026-08-02)


#### 11. Hành vi khi bật `permessage-deflate`

- Dự án không cấu hình gì cho `perMessageDeflate` của engine.io/socket.io —
  giả định đang tắt theo mặc định, **chưa xác minh runtime thật**.
- Cần quyết định: có bật hay không (đánh đổi CPU nén ↔ băng thông), rồi đo lại
  băng thông/độ trễ thật trên server đang chạy nếu bật. Là quyết định vận
  hành/cấu hình, không phải lỗi code cần sửa.

---
