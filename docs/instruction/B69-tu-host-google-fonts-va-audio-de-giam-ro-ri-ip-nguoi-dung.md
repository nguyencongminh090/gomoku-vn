# B69. Tự host font + audio (TODO.md #69)

**Nguồn:** `network_security_audit.md`, TODO.md #69.

## Cách tiếp cận

- Làm theo đúng khuôn mẫu B65 đã dùng cho Phosphor icons: tải file thật về `client/vendor/`, đổi
  `<link>`/CSS `url()` sang path nội bộ, rồi thu hẹp CSP `font-src`/`media-src` lại còn `'self'`.
- **Kiểm tra license Freesound trước khi vendor** — mỗi sound trên Freesound có license riêng (CC0,
  CC-BY, CC-BY-NC...), không phải toàn bộ được phép redistribute tự do; nếu license yêu cầu
  attribution, giữ file `CREDITS.md`/comment ghi nguồn trong `client/vendor/audio/`.
- Việc nhỏ, độ ưu tiên thấp — không chặn task khác, làm khi rảnh.
