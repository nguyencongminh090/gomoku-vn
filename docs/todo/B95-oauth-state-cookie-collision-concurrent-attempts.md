# #95 — OAuth state cookie bị đè khi có 2 lần thử đăng nhập Google gần-đồng-thời

**Trạng thái:** ✅ ĐÃ XONG

## Đã sửa (2026-08-10, nhánh `fix/oauth-state-cookie-collision` → `dev`)

Đổi tên cookie state từ cố định (`gvn_oauth_state`) sang self-describing theo chính giá trị `state`
đó (`gvn_oauth_state_<state>`, `server/routes/auth.js`) — mỗi lần thử `/google` giờ ghi vào 1 cookie
riêng, không còn slot chung để đè lẫn nhau. Callback dựng lại đúng tên cookie từ query param `state`
để kiểm tra tồn tại (thay cho so sánh 2 giá trị tách biệt); `state` phải khớp `OAUTH_STATE_RE`
(32 hex ký tự, đúng định dạng `crypto.randomBytes(16).toString('hex')` sinh ra) TRƯỚC khi được dùng
dựng tên cookie — chặn giá trị `state` từ query (attacker-controlled) rơi thẳng vào cookie-name lookup
chưa kiểm định dạng.

An toàn CSRF giữ nguyên: callback chỉ thành công khi tồn tại đúng cookie mang tên state đó — cookie
này chỉ browser đã thực sự nhận `Set-Cookie` từ `/google` mới có, y hệt double-submit cookie pattern
cũ, chỉ khác chỗ disambiguate theo tên thay vì theo giá trị so sánh.

Test: cập nhật `server/tests/auth-google-oauth.test.js` theo cookie name mới, thêm 1 test mới mô
phỏng đúng kịch bản báo cáo (2 `GET /google` liên tiếp lấy 2 cookie khác tên, cả 2 callback tương ứng
đều thành công). `npm test`: 1037/1037 pass.

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

`GET /api/auth/google` luôn ghi vào **cùng một** cookie tên `gvn_oauth_state`
(`server/routes/auth.js:434-441`); `GET /api/auth/google/callback` luôn đọc/xoá đúng cookie đó
(dòng 470-471) mà không phân biệt cookie này thuộc lần thử nào.

Nếu người dùng mở `login.html` ở 2 tab và bấm "Đăng nhập với Google" ở cả 2 (hoặc bấm 1 lần, đổi ý,
quay lại, bấm lại lần nữa trước khi hoàn tất consent screen của lần đầu), request `/google` thứ 2 ghi
đè giá trị `state` của lần đầu lên cùng 1 cookie. Khi lần thử ĐẦU hoàn tất consent và callback của nó
chạy, `expectedState` đọc được lúc đó đã là giá trị của lần thử THỨ 2 → `state !== expectedState` →
redirect `error=oauth_state` dù không có gì bị giả mạo. `res.clearCookie` ở nhánh lỗi này còn xoá luôn
cookie mà lần thử thứ 2 (đang chờ hoàn tất) cần dùng — khiến lần thứ 2 cũng lỗi theo khi nó hoàn tất
sau đó.

## Hậu quả

- Không phải lỗi bảo mật (không ai chiếm được phiên của ai) — CSRF-state vẫn được kiểm tra đúng nghĩa,
  chỉ là kiểm tra nhầm giá trị. Người dùng chỉ gặp lỗi giả ("oauth_state") dù thao tác hợp lệ.
- Kịch bản thực tế: 2 tab cùng lúc, hoặc double-click chậm mạng tưởng nút không phản hồi rồi bấm lại.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp — chỉ ảnh hưởng khi có 2 lần thử OAuth chưa hoàn tất song song từ cùng 1 trình
  duyệt; không có báo cáo người dùng cụ thể, phát hiện qua review chủ động.
- **Fix dự kiến khi làm:** đặt tên cookie theo state ngẫu nhiên đó luôn (vd. `gvn_oauth_state_<state
  rút gọn>` hoặc mã hoá state kèm 1 nonce riêng cho từng cookie), hoặc đơn giản hơn: nhúng state vào
  chính giá trị cookie kiểu self-describing (double-submit cookie pattern chuẩn — cookie value == state
  value, so sánh giá trị cookie với query param `state` thay vì so 2 nguồn tách biệt) để 2 lần thử
  song song không đụng nhau. Cân nhắc kỹ trước khi chọn hướng vì đổi cách lưu state ảnh hưởng cả set
  và clear.

Chi tiết hướng làm: [docs/instruction/B95-oauth-state-cookie-collision-concurrent-attempts.md](../instruction/B95-oauth-state-cookie-collision-concurrent-attempts.md).
