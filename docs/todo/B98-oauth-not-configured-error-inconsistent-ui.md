# #98 — Lỗi "OAuth chưa cấu hình" không nhất quán, thoát khỏi UI lỗi đăng nhập có style

**Trạng thái:** chưa làm

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

Khi thiếu `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (`!googleClient`), 2 route xử lý khác nhau:

- `GET /api/auth/google` (`server/routes/auth.js:428-431`) → `503` kèm JSON
  `{ error, code: 'OAUTH_NOT_CONFIGURED' }`.
- `GET /api/auth/google/callback` (dòng 465) → `503` kèm `res.send()` (text thuần, không có `code`).

Cả 2 route đều là điều hướng trang đầy đủ (người dùng bấm `<a href="/api/auth/google">`, không phải
gọi qua `fetch`/AJAX — comment trong chính file này ở dòng ~52 xác nhận điều đó: "cannot be shown
inside an AJAX response"). Nhưng 2 nhánh lỗi KHÁC của cùng route callback (state mismatch dòng ~485,
verify thất bại dòng ~522) lại `redirect('/login.html?error=oauth_state'|'oauth_failed')` — được
`client/js/login.js` (dòng 54-63) đọc và hiển thị bằng banner lỗi `login.err_oauth_fail` có style.
Chỉ riêng nhánh "chưa cấu hình" là không đi qua con đường đó.

## Hậu quả

- Deploy thiếu biến môi trường (môi trường mới, hoặc biến bị rớt khi cấu hình lại): người dùng bấm
  "Đăng nhập với Google" → trình duyệt điều hướng hẳn ra khỏi `login.html`, hiển thị JSON/text trần
  không style, không cách quay lại ngoài nút Back — khác hẳn trải nghiệm mọi lỗi OAuth khác.
- Chỉ xảy ra khi deploy sai cấu hình, không phải lỗi runtime bình thường.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp — chỉ lộ ra khi deploy thiếu env var, không có báo cáo người dùng cụ thể.
- **Fix dự kiến khi làm:** cả 2 route dùng chung 1 cách phản hồi khi `!googleClient` — hợp lý nhất là
  redirect `error=oauth_not_configured` (thêm key i18n riêng, khác nội dung với `oauth_failed`/
  `oauth_state` để không đánh lừa người dùng nghĩ là do họ), giữ nguyên hành vi "không hiển thị được
  trong AJAX" đã ghi trong comment nhưng đưa cả 2 route về cùng 1 UI lỗi có style thay vì 1 route JSON
  1 route text.

Chi tiết hướng làm: [docs/instruction/B98-oauth-not-configured-error-inconsistent-ui.md](../instruction/B98-oauth-not-configured-error-inconsistent-ui.md).
