## B45. Text không dịch / hardcode tiếng Việt ở English mode (TODO.md #45)

**Nguồn:** báo cáo người dùng, xác nhận qua audit code trực tiếp (không phải
suy đoán) — xem đầy đủ danh sách phát hiện trong
[docs/todo/B45-...](../todo/B45-text-khong-dich-hardcode-tieng-viet-khi-o-che-do-english.md).

### Hướng tiếp cận đề xuất, theo mức ưu tiên

1. **Root cause lớn nhất trước: pattern `data.error || t(...)` ở
   `client/js/login.js`.** Vì server luôn trả `error` tiếng Việt khi có lỗi,
   nhánh `t(...)` chết. Cách sửa đúng: server trả **mã lỗi** (error code,
   VD `USER_NOT_FOUND`, `INVALID_PASSWORD`) thay vì message tiếng Việt sẵn,
   client tra mã đó qua khoá i18n tương ứng (`login.err_*` đã có sẵn trong
   `i18n.js` — chỉ cần map code → key). **Không** đổi ngược lại thành để
   server tự chọn ngôn ngữ trả về (server không có state ngôn ngữ đáng tin,
   dễ desync với client).
   - Áp dụng tương tự cho `client/js/history.js` (`alert(data.error || ...)`)
     và các chỗ khác dùng cùng pattern.

2. **Socket-level error/message (GameEngine, RoomManager, các *Handler)**:
   cùng hướng — đổi các event lỗi (`game:error`, `room:error`, v.v.) sang gửi
   kèm một `code` bên cạnh `message` (giữ `message` tiếng Việt để không phá
   log/debug hiện có nếu cần), client dùng `code` để tra `t()`. Đây là thay
   đổi rộng (chạm ~7 file server), nên làm thành các fix nhỏ theo từng
   handler thay vì 1 PR khổng lồ — có thể tách thành sub-item nếu khi bắt tay
   vào thấy quá lớn cho 1 commit theo quy tắc "one fix, one branch, one
   commit".
   - Message hệ thống trong chat (`GameHandler.js:667`,
     `"Ván đấu bắt đầu! Đen đi trước."`) nên theo cùng cơ chế code→key thay vì
     text cứng.
   - Message `'Tài khoản của bạn vừa đăng nhập ở một thiết bị khác.'` ở
     `SocketHandler.js` nên dùng lại khoá `login.session_kicked` đã có sẵn
     (qua code, không hardcode text riêng nữa) — tránh 2 bản dịch lệch nhau
     theo thời gian.

3. **`client/js/game-ui.js` (Swap2 + đề nghị hoà)**: thêm khoá mới vào
   `TRANSLATIONS.vi`/`TRANSLATIONS.en` trong `i18n.js` cho từng chuỗi, đổi
   template string sang gọi `t()`. Việc này độc lập với phần server-side, có
   thể làm riêng, ít rủi ro.

4. **`client/history.html` + `client/js/history.js`**: trang này chưa từng
   được đưa vào hệ thống i18n — cần thêm `data-i18n`/`data-i18n-placeholder`/
   `data-i18n-title` cho toàn bộ markup tĩnh, và đổi các string dựng động
   trong `history.js` (`getResultText`, `getResultTextFull`, header bảng,
   alert/confirm) sang `t()`. Khối lượng việc tương đương xây lại 1 trang
   nhỏ theo chuẩn — cân nhắc tách thành sub-item riêng nếu triển khai thật,
   vì nó độc lập hoàn toàn với phần game/socket ở trên.

5. **Các tooltip/title lẻ tẻ đã có khoá sẵn nhưng chưa dùng**:
   `room-ui.js:115` (`title="Nhấn để ngồi vào"` → dùng khoá
   `room.click_to_sit` có sẵn qua `data-i18n-title` hoặc gọi `t()` trực
   tiếp), `index.html:79,133`, `room.html:63`. Đây là các sửa nhỏ, an toàn,
   nên làm chung 1 batch vì cùng loại lỗi (thiếu `data-i18n-title`/
   `data-i18n` trên attribute) — nhưng vẫn tính là các file khác nhau, cân
   nhắc gộp vào cùng 1 commit nếu chúng thực sự chỉ là "thêm attribute còn
   thiếu" không đổi logic.

### Điểm cần lưu ý khi sửa
- **Không** sửa bằng cách nới lỏng `t()` để tự fallback sang tiếng Anh cho mọi
  string lạ — phải thêm khoá thật trong cả `vi` và `en` để giữ tính nhất quán
  với cách `i18n.js` đang hoạt động (đã xác nhận 182/182 khoá khớp 2 bên,
  đừng phá invariant đó).
- Đây là nhiều điểm sửa rải rác qua nhiều file/nhiều lớp (client HTML, client
  JS, server error payload) — **không gộp thành 1 commit khổng lồ**. Theo quy
  tắc git workflow của repo, tách theo từng nhóm logic ở trên (client-only
  Swap2/hoà, history.html, tooltip lẻ, và root-cause server error-code — nhóm
  cuối này có thể cần tách tiếp theo từng handler).
- Phần server đổi sang gửi `code` là thay đổi API/contract giữa client-server
  — kiểm tra không có nơi nào khác đang parse trực tiếp `message` text (thay
  vì chỉ hiển thị) trước khi đổi, tránh phá hành vi ẩn.
