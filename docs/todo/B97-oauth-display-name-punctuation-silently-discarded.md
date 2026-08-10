# #97 — Tên hiển thị Google có dấu câu bị âm thầm thay bằng tên khách ngẫu nhiên

**Trạng thái:** chưa làm

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

`server/routes/auth.js:496`:

```js
displayName = isValidDisplayName(payload.name) ? payload.name.trim() : generateGuestName();
```

`isValidDisplayName()` (dòng 141) từ chối tên chứa `<`, `>`, `&`, `"`, `'` hoặc ký tự điều khiển. Tên
Google thật rất phổ biến có dấu nháy đơn (`O'Brien`) hoặc `&` — những tên này KHÔNG bị lỗi/khước từ
đăng nhập, mà bị âm thầm thay bằng 1 tên khách ngẫu nhiên (`generateGuestName()`) không liên quan gì
đến tên thật, không có thông báo/log nào cho biết vì sao.

## Hậu quả

- Trải nghiệm ấn tượng đầu tiên xấu: người dùng thật đăng nhập Google lần đầu bằng tên hợp lệ, nhận
  ngay 1 tên hiển thị ngẫu nhiên kiểu khách vãng lai, không hiểu vì sao.
- Không phải lỗi bảo mật (`isValidDisplayName` chặn đúng mục đích chống XSS/injection trong tên hiển
  thị) — vấn đề là cách xử lý khi validation fail (thay bằng ngẫu nhiên) chứ không phải bản thân việc
  validate.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** trung bình — ảnh hưởng mọi tài khoản Google mới có ký tự trong danh sách chặn ở tên
  hiển thị (khá phổ biến với tên có dấu nháy/apostrophe kiểu tiếng Anh), xảy ra ngay lần đăng nhập đầu.
- **Fix dự kiến khi làm:** thay vì từ chối toàn bộ tên khi gặp ký tự bị chặn, cân nhắc chỉ loại bỏ
  (strip) đúng những ký tự đó khỏi `payload.name` rồi validate lại phần còn lại (nếu còn lại rỗng/quá
  ngắn mới rơi về `generateGuestName()`) — giữ được phần tên thật nhiều nhất có thể mà vẫn không phá
  vỡ lý do `isValidDisplayName()` được viết ra (chặn `<script>` v.v. trong tên hiển thị hiện ở UI).
  Cần xem lại `isValidDisplayName()` dùng chung ở đâu khác trước khi đổi hành vi, tránh ảnh hưởng
  luồng đăng ký username/password thường.

Chi tiết hướng làm: [docs/instruction/B97-oauth-display-name-punctuation-silently-discarded.md](../instruction/B97-oauth-display-name-punctuation-silently-discarded.md).
