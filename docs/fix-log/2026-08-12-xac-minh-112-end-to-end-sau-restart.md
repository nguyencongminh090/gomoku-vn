# Fix log entry — 2026-08-12 10:47

## Prompt

> I have restarted.

## Action

Xác minh #112 end-to-end trên domain thật bằng Chromium (phần trước không làm được vì server còn
chạy CSP cũ). Chỉ đọc, **không dời DB** — server thật đang chạy, đúng bài học đã ghi ở entry
trước.

## Decision

Không sửa gì thêm. Ghi lại một **đính chính** và một **quan sát làm rõ thiết kế**.

## Summary output

**#112 đạt, đúng tiêu chí đã đặt ra từ đầu:**

| | Trước | Sau |
|---|---|---|
| Lỗi CSP mỗi lần tải trang | 3 | **0** |
| `beacon.min.js` | bị chặn | **HTTP 200** |
| `window.__cfBeacon` | — | `object` (beacon đã khởi tạo) |

CSP trên domain thật: `script-src 'self' https://static.cloudflareinsights.com` /
`connect-src 'self' https://cloudflareinsights.com`. Không còn lỗi console nào khác (0 lỗi non-CSP).

**#105-#111 không hồi quy:** WebSocket kết nối, `#online-panel-count` = 1, lần đầu 27 resource /
204 266 B.

### Quan sát: beacon gửi số liệu về CHÍNH domain mình, không phải `cloudflareinsights.com`

Request thật quan sát được là **`/cdn-cgi/rum` (300 B) — đường dẫn tương đối trên
`play3cr.dpdns.org`**, tức đúng **trường hợp thứ 3** đã dự đoán khi soi chỗ dựng host động
`window.location.origin` trong `beacon.min.js` (xem mục "Đã cân nhắc và BÁC BỎ" trong
`docs/todo/B112-*.md`). Cloudflare cấu hình `send.to` là đường dẫn tương đối, nên nhánh host tuyệt
đối trong script không được dùng.

Endpoint này **được Cloudflare xử lý ở biên, không bao giờ tới server của người dùng** — kiểm
chứng: qua domain trả `server: cloudflare` + `cf-ray`, còn gọi thẳng `localhost:3000/cdn-cgi/rum`
trả 404 (app không hề có route đó). Tức analytics không thêm tải nào cho origin.

**Hệ quả cho CSP: mục `connect-src https://cloudflareinsights.com` hiện KHÔNG được dùng tới.** Nó
phủ nhánh dự phòng trong `beacon.min.js`
(`p.send && p.send.to ? p.send.to : (void 0 === p.version ? "https://cloudflareinsights.com/cdn-cgi/rum" : null)`)
— chỉ chạy khi Cloudflare không đặt `send.to`. **Cố ý giữ lại**: là host pin chính xác, rủi ro
không đáng kể, và nếu Cloudflare đổi cấu hình chèn thì không phải sửa CSP lại. Ghi ra đây để lần
sau ai đọc `connect-src` khỏi tưởng nó đang có tác dụng.

### Đính chính con số "lần vào lại 0 byte"

Entry `2026-08-12 09:31` ghi **lần vào lại: 0 request / 0 byte**. Đo lại sau khi bật beacon:
**27 resource, 1 request qua mạng, 300 B** — chính là POST analytics `/cdn-cgi/rum`. Toàn bộ asset
tĩnh vẫn 0 byte (từ cache) đúng như trước; 300 B thêm vào là **cái giá của việc bật Web Analytics**,
do người dùng chủ động chọn, không phải hồi quy của #106/#111. Con số cũ vẫn đúng tại thời điểm đo
đó (beacon khi ấy đang bị CSP chặn).
