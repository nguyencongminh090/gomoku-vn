# B102 — Trùng logic "lưu user + chuyển hướng lobby" + 2 điểm kém hiệu quả nhỏ

Hướng dẫn thực thi cho TODO.md #102 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).
Gồm 3 phần độc lập, có thể làm riêng lẻ hoặc gộp chung 1 lần sửa.

## Cách tiếp cận khi làm

- **Phần 1 (trùng logic):** thêm `GvnSession.completeLogin(user)` vào `client/js/session.js` (gộp
  `setUser(user)` + `window.location.replace('index.html')`), cho `login.js`'s `onAuthSuccess(data)`
  và `oauth-complete.js`'s nhánh thành công cùng gọi. Chú ý chữ ký tham số khác nhau giữa 2 nơi hiện
  tại (1 bên `{user}`, 1 bên `user` trần) — chuẩn hoá về 1 kiểu khi gộp.
- **Phần 2 (SELECT thừa):** ở `server/routes/auth.js`'s `GET /google/callback`, nhánh tạo user mới —
  bỏ `db.getUserById(userId)` ngay sau `db.createUser()`, dựng object `user` trực tiếp từ các field
  đã có trong scope thay vì đọc lại DB.
- **Phần 3 (round-trip thừa, cân nhắc kỹ hơn 2 phần trên):** đánh giá lại có nên bỏ hẳn
  `oauth-complete.html` không — nếu làm, redirect callback thẳng tới `/index.html#<payload>`, thêm
  đoạn parse fragment ngắn ở đầu `index-entry.js` TRƯỚC khi `requireAuth()` chạy. Đọc kỹ
  `index-entry.js` hiện tại trước khi đổi để không phá vỡ thứ tự khởi tạo các module khác.

## Phạm vi KHÔNG làm

- Không đổi nội dung `onAuthSuccess`/`completeLogin` ngoài việc gộp code — không thêm tính năng mới
  (analytics, redirect param, v.v.) trong lúc làm finding này.
- Phần 3 không bắt buộc làm cùng lúc với Phần 1/2 — có thể để riêng nếu đánh giá rủi ro thay đổi
  `index-entry.js` không đáng với lợi ích (bớt 1 round-trip) mang lại.

Xem báo cáo gốc: [docs/todo/B102-oauth-client-duplication-and-minor-inefficiency.md](../todo/B102-oauth-client-duplication-and-minor-inefficiency.md).
