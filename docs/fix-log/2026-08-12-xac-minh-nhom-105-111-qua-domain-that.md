# Fix log entry — 2026-08-12 09:31

## Prompt

> I started server for play3cr.dpdns.org.

## Action

Xác minh cả nhóm #105-#111 qua domain thật, đúng tầng mà người dùng thật đi qua
(origin → Cloudflare → trình duyệt). **Chỉ đọc, không đụng tiến trình server của người dùng** —
theo quy tắc "không restart/can thiệp server mình không tự khởi động".

## Decision

Không sửa gì. Ghi nhận kết quả đo, và **mở #112** cho một phát hiện phụ (beacon Cloudflare bị CSP
chặn) thay vì tự sửa — theo quy tắc "stack, don't perform directly", và vì hướng xử lý phụ thuộc
một câu hỏi chỉ người dùng trả lời được (có dùng Web Analytics không).

## Summary output

**Header qua Cloudflare — cả 4 fix đều đã live:**

| URL | encoding | cf-cache-status | Cache-Control |
|---|---|---|---|
| `/` | `br` | DYNAMIC | `no-cache` |
| `/js/i18n.js` | `br` | **HIT** | `max-age=31536000, immutable` |
| `/css/main.css` | `br` | **HIT** | `max-age=31536000, immutable` |
| `/vendor/socket.io/socket.io.min.js` | `br` | MISS → **HIT** | `max-age=86400` |
| `/vendor/phosphor/regular/style.css` | `br` | **HIT** | `max-age=31536000, immutable` |
| `/api/auth/me` | — | DYNAMIC | `no-store` (#66 nguyên vẹn) |

`/socket.io/socket.io.min.js` (URL cũ) vẫn trả **200** — lưới an toàn của #111 cho HTML cũ còn
cache hoạt động đúng như thiết kế.

**Chromium thật qua domain:**

- **Lần đầu: 27 resource / 203 928 B qua mạng.** (Đối chiếu: cùng trang này trước cả nhóm là
  570 164 B **chưa nén** ở origin, và mọi asset đều phải revalidate.)
- **Lần vào lại: 27 resource, 0 request qua mạng, 0 byte.**
- WebSocket `wss://play3cr.dpdns.org/socket.io/?EIO=4&transport=websocket` mở bình thường;
  `#online-panel-count` = **1** → có round-trip server→client thật.

**TTFB `index.html` ×10 (baseline #106: trung vị 0.30s nhưng 2/10 vọt 0.88-1.03s):**

```
0.306  0.295  0.302  0.292  0.304  0.285  0.289  0.303  0.291  0.288
```

10/10 nằm trong 0.285-0.306s, **không có đỉnh nào**. Trung vị không đổi (~0.30s) — đúng như dự
kiến, vì `index.html` cố ý `no-cache` nên vẫn round-trip về origin mỗi lần; cái thay đổi là giờ
nó là **request duy nhất** làm vậy, thay vì 26.

**Chưa kết luận "đã hết sometime lag".** 10 mẫu sạch là dữ kiện tốt nhưng không chứng minh được
một triệu chứng vốn ngắt quãng — lần đo lúc xác minh #106 cũng không tái hiện được đỉnh. Điều nói
chắc được: **số lần quay số về origin cho một lần tải trang đã từ 26 xuống 1**, nên xác suất chạm
phải một round-trip chậm giảm theo đúng tỷ lệ đó. Liên hệ với #86 vẫn để mở, không đóng dựa trên
phiên đo này.

**Phát hiện phụ → mở #112 (không liên quan nhóm này):** Chromium báo 3 lỗi CSP mỗi lần tải trang,
do Cloudflare tự chèn beacon Web Analytics ở biên trong khi CSP (#65) chỉ cho `script-src 'self'`.
Đã kiểm chứng **không** phải do repo và **không** phải do nhóm #105-#111: `grep` trong `client/`
không có tham chiếu nào, và HTML từ origin so với HTML qua Cloudflare **giống hệt từng byte**
(25 237 B, `diff` rỗng) — tức beacon không nằm trong HTML repo phục vụ, Cloudflare chỉ chèn khi
trả cho trình duyệt thật (curl không thấy). Hệ quả: Web Analytics không thu được số liệu nào, và
console bị nhiễu ở mọi đợt QA sau này. Cần người dùng chọn hướng (tắt trên dashboard vs nới CSP).
