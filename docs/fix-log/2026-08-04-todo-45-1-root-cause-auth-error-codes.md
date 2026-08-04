# Fix log entry — 2026-08-04 14:13

## Prompt

TODO.md #45 (báo cáo người dùng "Text not fully English on English mode"), sub-item 1 theo thứ tự ưu tiên trong `instruction.md` §B45: root cause lớn nhất — pattern `data.error || t(...)` ở [client/js/login.js](client/js/login.js). Server luôn trả `error` tiếng Việt khi có lỗi ở [server/routes/auth.js](server/routes/auth.js), nên nhánh `t(...)` không bao giờ chạy — lỗi đăng nhập/đăng ký luôn hiển thị tiếng Việt kể cả ở English mode.

## Action

`server/routes/auth.js`: thêm field `code` (string, không đổi ngôn ngữ) vào cả 6 nhánh lỗi của `/register` và `/login` — `USERNAME_INVALID`, `DISPLAY_NAME_INVALID`, `PASSWORD_TOO_SHORT`, `USERNAME_TAKEN` (register); `MISSING_CREDENTIALS`, `INVALID_CREDENTIALS` (login). Giữ nguyên field `error` (tiếng Việt) không đổi, theo đúng chỉ dẫn instruction.md §B45 ("giữ `message` tiếng Việt để không phá log/debug hiện có").

`client/js/i18n.js`: thêm 3 khoá mới vào cả `TRANSLATIONS.vi`/`TRANSLATIONS.en` — `login.err_username_taken`, `login.err_invalid_credentials`, `login.err_missing_credentials` (3 khoá còn lại map thẳng vào khoá validation client-side đã có sẵn: `login.err_reg_username`, `login.err_display`, `login.err_pass_short`).

`client/js/login.js`: thêm `ERROR_CODE_KEYS` (map `code` → i18n key) và hàm `errorMessage(data, fallbackKey)`; thay cả 3 chỗ `showAlert(data.error || t('login.err_*_fail'))` (login/register/guest) bằng `showAlert(errorMessage(data, 'login.err_*_fail'))`. `data.error` không còn được đọc ở đâu trong file này.

Bump `?v=49` → `?v=50` toàn bộ (`client/*.html`, `client/js/*-entry.js`) vì đổi `i18n.js` và `login.js`.

## Decision

Không đổi hướng ngược lại (server tự chọn ngôn ngữ trả lỗi) — instruction.md §B45 nói rõ server không có state ngôn ngữ đáng tin, dễ desync với client. `client/js/history.js` dùng cùng pattern `data.error || ...` nhưng thuộc sub-item #4 riêng (history.html/history.js chưa vào hệ thống i18n) — không gộp vào đây theo rule scope discipline.

Phát hiện phụ ngoài phạm vi #45 gốc: `login.js` hàm `togglePassword` đọc `t('login.hide_password')`/`t('login.show_password')` — 2 khoá này không tồn tại trong `i18n.js`, nên `t()` trả về raw key (truthy), khiến `|| 'Ẩn mật khẩu'`/`|| 'Hiện mật khẩu'` không bao giờ chạy và `aria-label` luôn là chuỗi key thô. Không sửa trong fix này (ngoài phạm vi #45 đã audit) — ghi thành TODO.md #46 riêng theo rule "New requirements/tasks: stack, don't perform directly".

## Summary output

`npm test`: 410/410 passing, 22 suites (mới thêm `server/tests/auth-error-codes.test.js`, 9 test case: 4 nhánh lỗi register + trường hợp thành công không có `code`, 4 nhánh lỗi login — bao gồm cả "unknown username" và "wrong password" đều trả `INVALID_CREDENTIALS`, không rò rỉ sự khác biệt giữa 2 trường hợp qua `code`). `server/tests/auth-display-name.test.js`/`auth-login-timing.test.js` (test cũ, không đổi) vẫn xanh — đặc biệt test dòng 167 của `auth-display-name.test.js` khẳng định `body.error` (tiếng Việt, không phải `code`) không đổi.
