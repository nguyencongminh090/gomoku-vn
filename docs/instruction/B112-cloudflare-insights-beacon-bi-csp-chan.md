# §112 — Hướng dẫn: xử lý beacon Cloudflare Insights bị CSP chặn

Bổ sung cho [docs/todo/B112-cloudflare-insights-beacon-bi-csp-chan.md](../todo/B112-cloudflare-insights-beacon-bi-csp-chan.md).

## Điều kiện tiên quyết

- **Hỏi người dùng chọn (A) tắt analytics hay (B) nới CSP trước khi viết code.** Câu hỏi thật là
  "anh có dùng số liệu Web Analytics không?", không phải câu hỏi kỹ thuật. Chọn sai hướng thì hoặc
  là nới CSP vô ích, hoặc là tắt mất thứ người dùng đang dùng.
- Nếu chọn (A): **việc nằm trên dashboard Cloudflare, agent không làm được** — chỉ hướng dẫn, rồi
  đo lại bằng trình duyệt thật để xác nhận lỗi console biến mất. Không có gì để commit.

## Nếu chọn (B) — nới CSP

- Sửa `server/config/csp.js`, thêm `'https://static.cloudflareinsights.com'` vào `scriptSrc`.
  **Đừng dùng wildcard** (`*.cloudflareinsights.com` hay tệ hơn là `*`) — pin đúng host.
- **Phải đo `connectSrc`, đừng đoán.** Beacon còn `POST` số liệu về Cloudflare; nếu `connectSrc`
  vẫn `'self'` thì script tải được nhưng gửi dữ liệu vẫn bị chặn → vẫn không có số liệu, chỉ khác
  là lỗi console đổi loại. Mở DevTools/Playwright trên trình duyệt thật, xem chính xác nó gọi đi
  đâu, rồi mới thêm.
- **Có test sẵn: `server/tests/csp.test.js`.** Bắt buộc cập nhật/thêm case theo quy tắc bug-fix —
  và giữ các assert hiện có chứng minh không mở rộng gì ngoài dự định (vd. vẫn không có
  `'unsafe-inline'`).

## Đừng làm

- **Đừng thêm `'unsafe-inline'` hay `'unsafe-eval'`** dù thông báo lỗi có gợi ý gì đi nữa. #65 vừa
  dọn sạch đúng những thứ đó; đây là beacon từ host bên ngoài, chỉ cần allowlist host.
- **Đừng tự ý tắt CSP cho `*.html`** hay bỏ `contentSecurityPolicy` của helmet để "cho nhanh".
- **Đừng đụng `client/`** — repo không hề tham chiếu beacon này; sửa ở client là sai tầng (chính
  Cloudflare chèn ở biên, xem bằng chứng byte-identical trong file TODO).
- **Đừng gộp với việc khác** — một fix, một nhánh, một commit.

## Xác minh

Không có cách xác minh nào bằng `curl`: **Cloudflare chỉ chèn beacon khi phục vụ trình duyệt thật**
(origin và CF trả HTML giống hệt từng byte). Phải chạy Chromium thật qua domain và đếm lỗi console
— trước fix là 3 lỗi/lần tải, sau fix phải là 0.
