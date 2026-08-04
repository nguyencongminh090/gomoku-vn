# A10. `cloudflared` với `X-Forwarded-For` thật — chuyển sang §44 (review 12.6)

### A10. ~~`cloudflared` với `X-Forwarded-For` thật~~ — chuyển sang §44 (review 12.6)

**Đã đóng, chuyển sang Phần B #44 (2026-08-04).** Không cần request thật đi
qua tunnel để xác minh nữa — kiểm bằng Cloudflare API (`mcp__cloudflare-api`)
xác nhận zone `play3cr.dpdns.org` proxied thật (`proxied: true`), nên
Cloudflare edge luôn tự set `CF-Connecting-IP`, ghi đè chứ không cho client
nối thêm/giả mạo. Đọc thẳng header đó thay vì tiếp tục suy luận qua
`X-Forwarded-For` là việc sửa được bằng code — xem §44 bên dưới.
