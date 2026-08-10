# #96 — `GET /google/callback` không idempotent khi request bị lặp lại (retry/replay)

**Trạng thái:** chưa làm

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

Nếu trình duyệt (hoặc 1 proxy trung gian) gửi lặp cùng 1 request `GET /google/callback` với cùng
`code`+`state` (network-level retry, hoặc replay request cũ từ lịch sử điều hướng), 2 request này
không được xử lý idempotent:

- Request đầu thành công: `googleClient.getToken({ code, ... })` đổi `code` lấy token, `startSession()`
  set cookie phiên, redirect tới `/oauth-complete.html#...`.
- Request thứ 2 (gần như đồng thời) đọc cùng state cookie (chỉ bị xoá SAU KHI request đầu xử lý xong),
  vẫn đi tiếp gọi `googleClient.getToken({ code, ... })` với `code` đã bị dùng — Google trả lỗi
  `invalid_grant`, rơi vào `catch` chung ở `server/routes/auth.js:543` → redirect
  `error=oauth_failed`.

Nếu response của request thứ 2 điều hướng trình duyệt SAU response của request đầu, người dùng nhìn
thấy trang "Đăng nhập Google thất bại" dù thực ra đã có phiên đăng nhập hợp lệ từ request đầu.

`server/tests/auth-google-oauth.test.js` hiện chỉ test kịch bản 1 request/1 lần — không có test nào
phủ trường hợp callback bị gọi lặp.

## Hậu quả

- Không phải lỗi bảo mật, không mất dữ liệu — chỉ gây trải nghiệm khó hiểu (báo lỗi dù đã đăng nhập
  thành công).
- Kịch bản kích hoạt: mạng chập chờn khiến trình duyệt/proxy tự retry GET, hoặc người dùng bấm Back
  rồi Forward ngay sau khi vừa hoàn tất OAuth.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp — cần đúng điều kiện race (2 request cho cùng 1 `code`) mới trúng, không có báo
  cáo người dùng cụ thể.
- **Fix dự kiến khi làm:** sau khi `startSession()` thành công, đảm bảo request thứ 2 (đọc thấy state
  cookie đã bị request đầu xoá) rơi vào 1 nhánh phân biệt được với "state thật sự sai" — ví dụ kiểm
  tra sớm nếu không có state cookie thì coi là "phiên trước đã xử lý xong rồi" và redirect thẳng về
  trang chủ/`oauth-complete.html` thay vì `error=oauth_state`/`oauth_failed` gây hiểu nhầm; cân nhắc
  thêm test giả lập gọi `getToken` 2 lần liên tiếp cùng `code` để xác nhận nhánh lỗi `invalid_grant`
  không hiển thị "thất bại" nếu đã có session hợp lệ trong request khác.

Chi tiết hướng làm: [docs/instruction/B96-oauth-callback-not-idempotent-duplicate-request.md](../instruction/B96-oauth-callback-not-idempotent-duplicate-request.md).
