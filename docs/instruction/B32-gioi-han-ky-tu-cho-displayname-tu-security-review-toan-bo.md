# B32. Giới hạn ký tự cho `displayName` (từ security review toàn bộ codebase, 2026-08-03)

### B32. Giới hạn ký tự cho `displayName` (từ security review toàn bộ codebase, 2026-08-03)

- Đây là phòng thủ chiều sâu — audit xác nhận **không có XSS đang mở** hôm
  nay (mọi điểm render client dùng `escapeHtml`/`escapeAttr`/`escapeJsString`
  đúng cách trước khi chèn `innerHTML`). Không cần coi đây là khẩn cấp, cùng
  tinh thần với B2/B3 ở trên.
- **Ràng buộc quan trọng nhất khi chọn regex:** `displayName` hiển thị tên
  người dùng thật, bao gồm tên tiếng Việt có dấu (Unicode, vd. "Nguyễn Văn
  A"). Regex kiểu `[a-zA-Z0-9 ]+` sẽ **chặn nhầm** phần lớn tên thật của
  người dùng Việt — đây không phải giả thuyết, mà là rủi ro cụ thể do đối
  tượng người dùng của app này. Nếu làm, phải dùng class ký tự Unicode-aware
  (vd. chặn theo danh sách đen `<>&"'` + control character, thay vì chỉ cho
  qua allow-list ASCII) — không chọn hướng allow-list hẹp rồi phát hiện sau
  khi người dùng thật báo lỗi không đặt được tên.
- Không cần thêm gì ở phía escape hiện có (`escapeHtml` v.v. giữ nguyên,
  không phải thay thế) — đây là lớp chặn bổ sung ở nguồn, không phải thay
  cho lớp escape ở đích.
- Test: theo rule "Bug-fix workflow" trong `CLAUDE.md` — viết unit test cho
  `isValidDisplayName` (đã có coverage qua Jest ở `server/tests/`), cover cả
  case reject (`<script>`, control character) và case accept (tên tiếng Việt
  có dấu, khoảng trắng giữa tên) để tránh chính regression "chặn nhầm tên
  thật" nêu trên.
