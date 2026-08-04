# Phần A #10. Hành vi thật của `cloudflared` với `X-Forwarded-For` do client tự gửi

**Nguồn:** `gomoku-vn-review(1).md` vòng 3, mục 12.6 (kiểm chứng 2026-08-02)


#### 10. ~~Hành vi thật của `cloudflared` với `X-Forwarded-For` do client tự gửi~~

**→ Chuyển sang Phần B #44 (2026-08-04).** Kiểm bằng Cloudflare API (không
cần request thật/half-open probe): zone `play3cr.dpdns.org` là zone riêng
trên Cloudflare (`5008081877e47332e151721d4d3cc8c9`), **active**, bản ghi
CNAME trỏ vào tunnel với **`proxied: true`** — tức traffic đi qua Cloudflare
edge thật (không phải DNS pass-through trần của dịch vụ dpdns.org), nên
Cloudflare **luôn tự set `CF-Connecting-IP`** ở edge và **không cho client
giả mạo** (ghi đè, không phải nối thêm — khác hẳn giả định ban đầu về
`X-Forwarded-For`). Tunnel `GomokuApp` (`aae65c10-cae3-4fdf-8e61-42e3c59a954f`)
chỉ có đúng 1 ingress rule `play3cr.dpdns.org → http://localhost:3000`,
`originRequest: {}` không override gì — khớp đúng giả định `cloudflared` nối
vào Node qua loopback trần mà `trust proxy: 'loopback'`/`getClientIp()` hiện
tại đang dựa vào. Với dữ kiện này, đọc thẳng `CF-Connecting-IP` thay vì tiếp
tục vá đường vòng qua `X-Forwarded-For` là việc sửa được bằng code, không
còn cần xác nhận qua traffic thật nữa — xem Phần B #44.
