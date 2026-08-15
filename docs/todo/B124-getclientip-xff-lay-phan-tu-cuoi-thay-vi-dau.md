# #124 — `get-client-ip.js` fallback XFF nên lấy phần tử CUỐI, không phải đầu

**Trạng thái:** chưa làm

**Nguồn:** review vòng 4 (`gomoku-vn-review-2026-08-14.md` mục 13.11/13.12 #6) — nuance mới hơn
`#44` (B44 chỉ thêm ưu tiên đọc `CF-Connecting-IP`, chưa sửa thứ tự lấy phần tử trong nhánh
fallback `X-Forwarded-For`). Đã xác minh lại với code hiện tại 2026-08-15.

## Vấn đề

`server/utils/get-client-ip.js:48`:

```js
if (forwarded) return forwarded.split(',')[0].trim();
```

Nhánh này chỉ chạy khi **không có** `CF-Connecting-IP` **và** peer TCP là loopback (proxy cùng
máy). `X-Forwarded-For` theo quy ước là chuỗi `client, proxy1, proxy2, ...` — client tự viết được
giá trị đầu tiên tuỳ ý, còn giá trị *gần server nhất* (do proxy tin cậy cuối cùng thêm vào) mới là
giá trị đáng tin hơn. Code hiện tại lấy `[0]` (phần tử **đầu**, dễ giả mạo nhất) thay vì phần tử
**cuối**.

## Mức độ — đã xác nhận site vẫn sau Cloudflare thật (13.10 của review)

- Traffic thật qua Cloudflare **luôn có** `CF-Connecting-IP` → nhánh lỗi này **không bị chạm tới**
  trên đường đi thực tế hiện tại — CVSS/mức độ nghiêm trọng **thấp**, không gấp.
- Rủi ro còn lại chỉ xuất hiện nếu: origin lộ cổng ra ngoài trực tiếp (không qua Cloudflare Tunnel),
  hoặc đổi sang proxy khác không set `CF-Connecting-IP` trong tương lai.

## Đề xuất sửa

```js
if (forwarded) return forwarded.split(',').pop().trim();
```

Đổi `[0]` → `.pop()`. Đúng 1 dòng, không đổi logic còn lại (ưu tiên `CF-Connecting-IP`, chỉ tin XFF
khi peer loopback — giữ nguyên).

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** đóng nốt khe hở giả mạo IP trong nhánh fallback, cho các deployment tương lai không
  đi qua Cloudflare hoặc khi origin vô tình lộ cổng.
- **Rủi ro:** thấp — 1 dòng, có test bảo vệ (`server/tests/get-client-ip.test.js` đã có sẵn cho
  hàm này, đơn giản mở rộng case).
- **Test:** thêm case mới trong `server/tests/get-client-ip.test.js` — nhiều giá trị XFF cách nhau
  dấu phẩy (`"1.1.1.1, 10.0.0.5"`), peer loopback, không có `CF-Connecting-IP` → phải trả về phần
  tử **cuối** (`10.0.0.5`), không phải đầu.

Chi tiết thực thi: [docs/instruction/B124-getclientip-xff-lay-phan-tu-cuoi-thay-vi-dau.md](../instruction/B124-getclientip-xff-lay-phan-tu-cuoi-thay-vi-dau.md).
