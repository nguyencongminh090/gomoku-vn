# Phần A #9. Audit an ninh toàn bộ server + client — không phải diff, không có PR đang mở

**Status update 2026-10-09:** rescoped — 2026-08-03 audit had no HIGH/MEDIUM. Re-run AFTER #177 (avatar upload/profile) and #175-#178; focus on upload, profile, club authz.

**Recheck 2026-10-09 (code only):** the displayName defense-in-depth gap noted here is closed (#32 DONE). Remaining reason to re-run: new platform surfaces (upload, profile, clubs).

**Nguồn:** security review toàn bộ codebase (2026-08-03, yêu cầu người dùng "Does my website safe?")


#### 9. Audit an ninh toàn bộ server + client — không phải diff, không có PR đang mở

- Bối cảnh: `main` sạch, không có commit/diff đang chờ (`git status` "nothing to
  commit"), nên không dùng được flow `/security-review` chuẩn (vốn review diff).
  Đã chuyển sang audit toàn bộ codebase qua sub-agent thay vì review diff rỗng.
- Phạm vi đã kiểm: SQL injection (`server/db/database.js`, `server/routes/
  games.js`), stored XSS qua `displayName`, JWT lưu ở `localStorage`, JWT alg
  confusion/`alg:none`, authorization bypass nước đi/lượt (`GameEngine.js`),
  authorization phòng (host-only actions, `RoomManager.js`), SQL interpolation
  trong `server/scripts/admin.js`, lộ id nội bộ qua `/api/games`.
- **Kết quả: không có finding HIGH/MEDIUM đạt ngưỡng tin cậy ≥0.8.** Toàn bộ 8
  candidate đều bị loại (confidence exploit 1-2/10) — chi tiết lý do loại từng
  cái nằm trong báo cáo đã gửi người dùng (không chép lại ở đây, xem lịch sử
  hội thoại nếu cần tra lại lý do cụ thể của từng candidate).
- **Điểm không đạt ngưỡng "finding" nhưng đáng ghi nhận (không phải lỗ hổng
  đang mở, là thiếu phòng thủ chiều sâu):** `isValidDisplayName`
  (`server/routes/auth.js`) chỉ kiểm độ dài (2-24 ký tự), không giới hạn ký
  tự — thứ duy nhất chặn stored XSS qua `displayName` là việc mọi điểm render
  phía client (`room-ui.js`, `lobby.js`, `history.js`) đều gọi đúng
  `escapeHtml`/`escapeAttr`/`escapeJsString` trước khi chèn vào `innerHTML`.
  Không có lớp chặn nào ở nguồn (server) nếu một điểm render tương lai quên
  escape. **Đã tách thành việc sửa được bằng code → xem Phần B #32.**
