# Phần A #67. Xác minh header HSTS thực tế có tới trình duyệt qua Cloudflare Tunnel không

**Nguồn:** báo cáo `network_security_audit.md` (Antigravity IDE, 2026-08-08)

## Vấn đề audit nêu — và điểm cần sửa lại

Audit ghi: *"No `Strict-Transport-Security` header via Helmet's default config — would need explicit
HSTS opt-in"*. **Claim này sai với hiện trạng code**: `server/index.js` gọi `helmet({
contentSecurityPolicy: { directives: cspDirectives } })` — chỉ override `contentSecurityPolicy`, các
middleware mặc định khác của Helmet (gồm `hsts`, mặc định `max-age=180 ngày`,
`includeSubDomains: true`) vẫn bật nguyên. Vậy Node tự thân **đã** gửi HSTS.

Việc còn lại không phải "thêm HSTS" mà là **đo thật** xem header này có sống sót qua
Cloudflare Tunnel tới trình duyệt hay không — vì tunnel/CDN có thể thêm, giữ nguyên, hoặc lược bỏ
header tùy cấu hình phía Cloudflare (Transform Rules, "Always Use HTTPS", HSTS riêng ở dashboard
Cloudflare). Đây là lý do xếp vào Phần A (không sửa được chỉ bằng đọc code — cần đo trên deploy
thật), tiếp nối [[A01]] (TLS/HTTPS đã xác nhận do Cloudflare Tunnel xử lý).

## Việc cần làm (đo đạc, không phải code)

- Dùng `curl -sI https://<domain thật>` (hoặc DevTools Network) kiểm tra response thật có
  `Strict-Transport-Security` không, giá trị `max-age` là bao nhiêu.
- Nếu header có mặt nhưng giá trị do Cloudflare ghi đè khác với Helmet default — ghi nhận giá trị
  thật, không cần sửa code.
- Nếu header **không** có mặt ở response thật (bị tunnel/CDN lược bỏ) — đó là lúc cần bật HSTS ở
  tầng Cloudflare dashboard (Edge Certificates → HSTS), không phải sửa `server/index.js` (Node đã
  đúng).

## Kết quả mong đợi

Một dòng ghi nhận thật: "đã đo, HSTS có/không tới trình duyệt, giá trị max-age = X" — thay claim sai
của audit gốc bằng số đo thật, giống cách [[A01]] đã làm với TLS.

## Trạng thái

Chưa đo.
