# Fix log entry — 2026-08-12 10:12

## Prompt

> Modify CSP to Allow Beucon Cloudflare.

Tức hướng **(B)** trong `docs/todo/B112-*.md`: giữ Cloudflare Web Analytics, nới CSP cho đúng host.

## Action

Đọc `docs/instruction/B112-*.md` trước. Nhánh `fix/csp-allow-cloudflare-insights` cắt từ `dev`
(`git show main:TODO.md` không có `#112`).

**Bước đo trước khi sửa — đúng chỗ instruction bắt "phải đo `connectSrc`, đừng đoán":** tải
`beacon.min.js` (31 612 B) rồi `grep` mọi URL tuyệt đối trong đó. Kết quả chỉ có **một** endpoint
dữ liệu:

```
https://cloudflareinsights.com/cdn-cgi/rum
```

**Đây là host KHÁC với host tải script.** Beacon tải từ `static.cloudflareinsights.com` nhưng gửi
số liệu tới `cloudflareinsights.com` (không có `static.`). Xác nhận thêm bằng đoạn code quanh đó:
`...p.send.to?p.send.to:void 0===p.version?"https://cloudflareinsights.com/cdn-cgi/rum":null...`.

Sửa `server/config/csp.js`: 2 hằng số có tên, pin tuyệt đối.

```js
const CF_INSIGHTS_SCRIPT = 'https://static.cloudflareinsights.com';  // -> scriptSrc
const CF_INSIGHTS_REPORT = 'https://cloudflareinsights.com';          // -> connectSrc
```

Nhân tiện sửa một câu comment đã lỗi thời trong cùng file (nó còn ghi socket.io client ở
`/socket.io/socket.io.js`, trong khi #107 đổi sang `.min.js` và #111 chuyển sang
`/vendor/socket.io/`). Chỉ là comment, không đổi hành vi.

## Decision

**Nếu chỉ allowlist host của script thì coi như chưa sửa gì.** Beacon sẽ tải và chạy, nhưng
`connect-src 'self'` chặn đúng cái POST mang dữ liệu đi — kết cục vẫn là "Web Analytics không có số
liệu", chỉ khác là lỗi console đổi từ "Loading the script..." sang "Refused to connect...". Rất dễ
tưởng đã xong vì lỗi cũ biến mất. Đây chính là chế độ hỏng mà instruction cảnh báo trước.

**Không dùng wildcard.** `*.cloudflareinsights.com` sẽ tiện hơn nhưng đây là script bên thứ ba —
đúng lớp thứ mà #65 vừa dọn — nên giữ hẹp nhất có thể vẫn chạy được.

**Test #65 được nới ĐÚNG chỗ, không nới cho dễ qua.** `script-src is same-origin only` (assert
`toEqual(["'self'"])`) không còn đúng nữa. Thay vì xoá, tách làm hai: #65 giữ phần bất biến thật sự
("không `unsafe-inline`/`unsafe-eval`/wildcard, luôn có `'self'`"), còn nội dung chính xác được pin
ở khối #112 (`toEqual(["'self'", CF_INSIGHTS_SCRIPT])`). Lớp hồi quy mà #65 nhắm tới vẫn được chặn.

## Summary output

`npm test`: **1124/1124 xanh** (trước 1118, +6).

**Xác minh bằng Chromium thật, có NHÓM ĐỐI CHỨNG** (server tạm cổng 3001):

| # | Kiểm tra | Kết quả |
|---|---|---|
| 1 | script từ `static.cloudflareinsights.com` | **LOADED** ✅ |
| 2 | `POST` tới `cloudflareinsights.com/cdn-cgi/rum` | CSP **không chặn** ✅ |
| 3 | *đối chứng:* script từ `unpkg.com` | **BLOCKED** ✅ |
| 4 | *đối chứng:* `POST` tới `example.com` | **BLOCKED** ✅ |

Nhóm đối chứng mới là phần chứng minh giá trị: chỉ nói "beacon chạy được" thì không loại trừ khả
năng đã lỡ mở toang chính sách. 3 và 4 cho thấy CSP vẫn chặn nguyên vẹn host lạ.

Mục 2 trả `Failed to fetch` — **không phải CSP**, mà là CORS/endpoint từ chối một POST rỗng từ
origin lạ. Bằng chứng: khi CSP chặn thật, Chromium log `Refused to connect because it violates the
document's Content Security Policy` (thấy đúng như vậy ở `example.com`); với host Cloudflare
**không** có dòng nào như thế.

**Chưa xác minh được end-to-end, và không tự làm được:** beacon chỉ do Cloudflare chèn trên domain
thật, mà domain thật đang trỏ vào tiến trình server **đang chạy CSP cũ**. Sau khi người dùng
restart: mở `https://play3cr.dpdns.org` bằng trình duyệt thật, **3 lỗi CSP/lần tải phải thành 0**;
dashboard Web Analytics bắt đầu có dữ liệu (thường trễ vài phút).

**Ghi nhận một sai sót quy trình của phiên này (không gây hư hại, nhưng đừng lặp lại):** đã dời
`gomoku.db` sang bên để chạy server tạm **trong khi server thật của người dùng đang chạy** — quy
trình bảo vệ DB trong CLAUDE.md ngầm giả định không có server nào khác đang mở file đó. Không hỏng
vì `mv` giữ nguyên inode nên fd của tiến trình kia đi theo file, và đã kiểm chứng sau đó:
`md5sum -c` OK, `pragma integrity_check` = `ok`, 12 users / 64 games, `/proc/<pid>/fd` trỏ đúng
đường dẫn, domain trả 200. **Lần sau: không dời DB khi server thật đang chạy.**
