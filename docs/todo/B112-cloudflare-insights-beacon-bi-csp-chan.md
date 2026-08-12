# #112 — Cloudflare Web Analytics beacon bị CSP chặn: 3 lỗi console mỗi lần tải trang, và không thu được số liệu nào

**Trạng thái:** ✅ ĐÃ XONG (2026-08-12, nhánh `fix/csp-allow-cloudflare-insights`) — người dùng
chọn **hướng (B): giữ analytics, nới CSP**

**Điểm mấu chốt: beacon TẢI VỀ từ một host, nhưng GỬI DỮ LIỆU tới host KHÁC.** Đây đúng là lý do
instruction bắt "phải đo `connectSrc`, đừng đoán":

| | Host | Directive |
|---|---|---|
| tải script | `https://static.cloudflareinsights.com` | `script-src` |
| gửi số liệu | `https://cloudflareinsights.com` (`/cdn-cgi/rum`) | `connect-src` |

Đọc trực tiếp trong `beacon.min.js` (31 612 B) — `grep` toàn bộ URL tuyệt đối trong file chỉ ra
đúng một endpoint: `https://cloudflareinsights.com/cdn-cgi/rum`. **Nếu chỉ allowlist host của
script** (điều mà một người đoán sẽ làm) thì beacon tải được nhưng vẫn không gửi được số liệu —
vẫn "không có dữ liệu", chỉ khác loại lỗi console.

**Đã làm:** thêm đúng 2 host vào `server/config/csp.js` qua 2 hằng số có tên
(`CF_INSIGHTS_SCRIPT`/`CF_INSIGHTS_REPORT`), **pin tuyệt đối, không wildcard**, không đụng
`'unsafe-inline'`/`'unsafe-eval'`, không đụng `client/`.

**Xác minh bằng Chromium thật, có nhóm đối chứng** (server tạm cổng 3001):

| Kiểm tra | Kết quả |
|---|---|
| script từ `static.cloudflareinsights.com` | **LOADED** ✅ |
| `POST` tới `cloudflareinsights.com/cdn-cgi/rum` | CSP **không chặn** ✅ |
| **đối chứng:** script từ `unpkg.com` | **BLOCKED** ✅ (chính sách vẫn chặt) |
| **đối chứng:** `POST` tới `example.com` | **BLOCKED** ✅ |

Nhóm đối chứng là phần quan trọng: nó chứng minh mình **không** nới rộng quá tay. Trình duyệt vẫn
log vi phạm CSP cho `unpkg.com`/`example.com`, và **không** log vi phạm nào cho 2 host Cloudflare.

*(Lưu ý về mục 2: `fetch` thủ công trả `Failed to fetch` — đó là CORS/endpoint từ chối một POST rỗng
từ origin lạ, **không phải CSP**. Bằng chứng: khi CSP chặn thật, Chromium log
"Refused to connect because it violates..." như đã thấy ở `example.com`; với host Cloudflare
**không có** dòng nào như vậy.)*

13 test trong `server/tests/csp.test.js` (7 cũ của #65 giữ nguyên ý nghĩa + 6 mới cho #112),
`npm test` **1124/1124 xanh**. Test #65 "script-src is same-origin only" được nới thành "không có
inline/eval/wildcard" + pin nội dung chính xác ở khối #112 — tức vẫn chặn đúng lớp hồi quy mà #65
nhắm tới, không phải nới lỏng test cho dễ qua.

## Đã cân nhắc và BÁC BỎ: nới rộng hơn nữa (2026-08-12)

Người dùng có đề xuất "fully allow beacon". **Đã phân tích lại rồi quyết định GIỮ NGUYÊN pin chính
xác** — không phải vì thận trọng chung chung, mà vì đo được là **không còn gì để mở**.

Toàn bộ bề mặt request của beacon chỉ có 3 trường hợp, và cả 3 đã được phép sẵn:

| Việc | Được phép nhờ |
|---|---|
| tải script từ `static.cloudflareinsights.com` | `script-src` ✅ |
| gửi số liệu tới `cloudflareinsights.com/cdn-cgi/rum` | `connect-src` ✅ |
| gửi số liệu tới đường dẫn tương đối trên chính domain của mình | `'self'` ✅ |

Trường hợp thứ 3 tìm ra khi soi chỗ **duy nhất** trong `beacon.min.js` có dựng host động:

```js
window.location.origin ? window.location.origin : `${location.protocol}://${location.host}`
```

Đây là beacon đọc origin **của chính trang đang chạy**, chỉ dùng khi Cloudflare cấu hình
`send.to` là đường dẫn tương đối (bắt đầu bằng `/`) — tức gửi về chính domain mình, `'self'` đã
phủ. **Không có trường hợp thứ 4.** Nới thêm chỉ cấp quyền mà beacon không dùng tới, đổi lại là
mất đúng thứ #65 dựng lên để bảo vệ (chặn script lạ đọc JWT trong `localStorage`).

Ghi chú kỹ thuật nếu sau này có ai định dùng wildcard: `https://*.cloudflareinsights.com`
**không** khớp domain gốc `cloudflareinsights.com` — vẫn phải liệt kê riêng host gốc, nên wildcard
còn không gọn hơn cách hiện tại.

**CHƯA xác minh được end-to-end (cần người dùng khởi động lại server):** beacon chỉ được Cloudflare
chèn trên domain thật, mà domain thật đang trỏ vào tiến trình server **đang chạy cấu hình CSP cũ**.
Sau khi restart, kiểm bằng Chromium thật trên `https://play3cr.dpdns.org`: **3 lỗi CSP/lần tải phải
thành 0**, và Web Analytics trên dashboard bắt đầu có dữ liệu (thường trễ vài phút).

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
