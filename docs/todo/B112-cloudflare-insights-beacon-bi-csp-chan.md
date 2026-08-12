# #112 — Cloudflare Web Analytics beacon bị CSP chặn: 3 lỗi console mỗi lần tải trang, và không thu được số liệu nào

**Trạng thái:** chưa làm

Phát hiện khi xác minh nhóm #105-#111 qua domain thật bằng Chromium (2026-08-12). **Không liên
quan tới nhóm fix đó** — đã kiểm chứng là có sẵn từ trước.

## Triệu chứng

Mỗi lần tải trang, console có 3 lỗi giống nhau:

```
Loading the script 'https://static.cloudflareinsights.com/beacon.min.js/v4513226...'
violates the following Content Security Policy directive: "script-src 'self'".
The action has been blocked.
```

## Nguyên nhân

Cloudflare **tự chèn** script beacon của Web Analytics ở biên khi phục vụ cho trình duyệt thật.
CSP của repo (từ #65) chỉ cho `script-src: ["'self'"]` (`server/config/csp.js:19`), nên trình duyệt
chặn.

Bằng chứng đây **không** phải do repo hay do nhóm #105-#111 gây ra:

- `grep -rn "cloudflareinsights\|beacon" client/` → **không có gì**.
- HTML từ origin và HTML qua Cloudflare **giống hệt từng byte** (25 237 B cả hai, `diff` rỗng) —
  tức beacon không nằm trong HTML mà repo phục vụ; Cloudflare chèn khi trả cho trình duyệt thật
  (curl không thấy, Chromium thì thấy).

## Hệ quả

1. **Web Analytics không thu được số liệu nào** — nếu người dùng đang bật tính năng này trên
   dashboard và tưởng là có dữ liệu, thì đó là dữ liệu rỗng.
2. **3 lỗi console mỗi lần tải trang** — làm nhiễu mọi đợt debug/QA sau này (và đúng là đã làm nhiễu
   lần xác minh #111: phải dừng lại kiểm chứng xem có phải do fix của mình không).

## Hai hướng xử lý, cần người dùng chọn

Đây **không** phải quyết định thuần kỹ thuật — phụ thuộc việc người dùng có muốn dùng Cloudflare
Web Analytics hay không:

- **(A) Không cần analytics → tắt Web Analytics trên dashboard Cloudflare.** Sạch nhất: CSP giữ
  nguyên `'self'` (chặt), không còn lỗi console, không nới bề mặt tấn công. **Nằm ngoài repo** —
  chỉ người dùng làm được (tunnel chạy bằng token, cấu hình trên dashboard).
- **(B) Muốn giữ analytics → thêm `https://static.cloudflareinsights.com` vào `scriptSrc`** trong
  `server/config/csp.js` (và có thể cả `connectSrc` cho chỗ beacon gửi dữ liệu về — **phải đo**,
  đừng đoán). Đánh đổi: nới CSP để cho phép một script bên thứ ba — đúng thứ mà #65 vừa dọn đi.

**Khuyến nghị (A)** trừ khi người dùng thật sự đang dùng số liệu đó.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả: thấp** về hiệu năng (beacon bị chặn nên vốn dĩ đã không tải gì) — giá trị thật là
  **dọn nhiễu console** và làm rõ tình trạng analytics.
- **Rủi ro: thấp ở (A), trung bình ở (B)** — (B) nới CSP, cần cân nhắc đúng theo tinh thần #65.
- **Không tự làm (B) mà chưa hỏi người dùng.**

Chi tiết: [docs/instruction/B112-cloudflare-insights-beacon-bi-csp-chan.md](../instruction/B112-cloudflare-insights-beacon-bi-csp-chan.md).
