# Fix log entry — 2026-08-22 20:50

## Prompt

Người dùng đưa file HAR `play3cr.dpdns.org_Archive [26-08-22 19-20-59].har` và hỏi vì sao entry
`wss://play3cr.dpdns.org/socket.io/?EIO=4&transport=websocket` có timeline dài nhất; yêu cầu đọc
code base rồi thảo luận hướng tối ưu. Sau đó hỏi tiếp "Tiêu chuẩn của các Big Site xử lý tình huống
này thế nào? Search forum, tech site…", rồi "Okay, you can write TODO", rồi "Do #145".

## Action

**Phân tích HAR trước, sửa sau.** Entry WebSocket dài 543 ms, nhưng phân rã ra thì phần lớn nhất
không nằm trong entry:

| Giai đoạn | ms |
|---|---|
| T0 → 52.799 (chờ trước khi socket được mở) | **462** |
| `connect` (gồm `ssl` 77) | 321 |
| `wait` → 101 | 145 |

`index.html` về lúc `52.579`, socket mở lúc `52.799` ⇒ **220 ms thuần client-side sau khi HTML đã
về**. Nguyên nhân: `index.html` nạp `index-entry.js` bằng `type="module"` ở cuối `<body>`, mà module
luôn defer, nên `io()` chỉ chạy ở cuối đồ thị module (`index-entry → … → lobby.js:40 new
SocketClient()`) — dù `_connect()` chỉ cần global `io` + một lần đọc `localStorage`. 24/26 request
lấy từ cache (0 ms), tức đây không phải vấn đề tài nguyên tĩnh.

Hai chi tiết khác trong HAR: `index.html` đi **HTTP/3** tới `172.67.150.225` còn WebSocket xin
**HTTP/1.1 Upgrade** tới `104.21.11.251` — edge IP khác, connection mới hoàn toàn; và `dns: 0`,
`blocked: -1` ⇒ không phải DNS, không phải nghẽn hàng đợi.

**Tra cứu chuẩn ngành** (theo yêu cầu, ghi đầy đủ nguồn trong `docs/todo/B145-*.md`): đề xuất WHATWG
cho `<link rel="preconnect">` với `wss://` đã **closed as not planned** (whatwg/html#8037) ⇒ gọi
`io()` sớm hơn là thứ duy nhất web platform còn cho phép; Figma/Slack thiết kế để socket **rời khỏi
critical path** (state ban đầu qua HTTP, socket chỉ nhận delta). Cũng **đính chính** nhận định ban
đầu của tôi về RFC 8441: trình duyệt CÓ hỗ trợ (Firefox mặc định), CDN thì không — chính HAR này là
bằng chứng.

**Ghi tracking trước khi code** (theo `CLAUDE.md`): tách thành #145–#148, mỗi mục 1 file
`docs/todo/` + 1 file `docs/instruction/` + 1 dòng index. Cố ý **không** filed "bootstrap sảnh qua
HTTP" thành việc — ghi vào phần "Ngoài phạm vi" của #145 với điều kiện kích hoạt rõ ràng, vì ở quy
mô này chưa đáng.

**Bản sửa #145:**

- `client/js/socket-early.js` (mới) — script cổ điển chạy trong `<head>`, gọi `SocketClient.shared()`.
- `client/js/socket-client.js` — thêm `static shared()`: **một chỗ duy nhất** giữ tính idempotent, và
  `destroy()` nhả slot. Object option `io({...})` **không đụng** (timeout 12000, transport
  websocket-first… đều là số đo của #28/#29 và #131) ⇒ 8 test của #131 pass nguyên.
- `client/index.html` — 4 script (`socket.io.min.js`, `session.js`, `socket-client.js`,
  `socket-early.js`) chuyển lên **đầu `<head>`, TRÊN mọi `<link rel="stylesheet">`**. Đây là chi tiết
  quyết định: script cổ điển đặt sau một stylesheet link sẽ **chờ stylesheet đó tải xong** mới chạy
  (có thể đọc CSSOM) — để trôi xuống dưới CSS là trả lại toàn bộ khoản tiết kiệm mà không có gì hỏng
  để nhận ra. Gỡ `socket.io.min.js` khỏi cuối `<body>` và gỡ 2 hint `modulepreload` tương ứng.
- `client/js/index-entry.js` — bỏ `import './session.js'` và `import './socket-client.js'`. Nếu để
  lại, file được nạp 2 lần (một lần qua `<script>`, một lần qua module specifier) và chạy top-level
  code lần thứ hai — chính là đường #51 đã ship.
- `client/js/lobby.js:40` — `new SocketClient()` → `SocketClient.shared()`.
- `?v=149→150` trên 184 chỗ; `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng
  **một** giá trị.

## Decision

**Phạm vi chỉ `index.html`**, đúng như `docs/instruction/B145-*.md` tự đặt ra: `room.html`,
`tournament-detail.html`, `tournament-match.html` vẫn dựng client từ entry module của chúng.
`shared()` được viết để hoạt động đúng ở cả hai kiểu (có/không có script `<head>`), và có test riêng
cho trường hợp không có — nhân rộng là việc sau, gated trên số đo của trang này.

**Không đụng** `requireAuth()`/`hasBelievedSession()` (guard cố ý lạc quan), không đụng thứ tự
transport / `reconnection*` / `timeout`.

Cập nhật `client/tests/modulepreload-hints-match-entry-imports.test.js`: hằng số import của
`index-entry.js` 7 → 5. Đây là **sanity check trên chính con số**, không phải nới lỏng — 2 test
parity hint↔import trong cùng file vẫn nguyên và chính chúng chứng minh hai bên đã được gỡ cùng nhau.
`room-entry.js` giữ 11, không đụng.

## Summary output

**Test:** `client/tests/socket-early-connect.test.js` mới, **15 case**. Kiểm chứng không rỗng bằng
mutation test trên **bản sao ở thư mục tạm** (không sửa file gốc, theo `instruction.md` "Đừng làm"):
revert 4 file nguồn về HEAD ⇒ **13/15 fail**. 2 case còn pass là 2 bất biến vốn đã đúng từ trước
(socket.io nạp 1 lần; `?v=` đồng nhất) — giữ làm regression guard.

`npm test` **1245/1245** (trước: 1230).

**Đo trên 2 instance cô lập** (copy repo + DB rỗng riêng + cổng 3111/3112 + `.env` throwaway; server
thật ở cổng 3000 và `server/db/gomoku.db` thật **không bị đụng**, đã xác nhận sau khi dọn). BEFORE =
HEAD, AFTER = bản sửa. Mốc đo là **`navigationStart` → WebSocket được mở**, không phải `entry.time`
của WebSocket — trên localhost TCP+TLS ≈ 0 ms nên thời lượng entry không nói lên điều gì, cái thay
đổi là **thứ tự**. 7 lần/instance, lấy median:

| | BEFORE | AFTER |
|---|---|---|
| nav → WS constructed | 28.1 ms (dải 12.9–35) | **10.7 ms** (dải 9.7–12) |
| nav → WS open | 36.9 ms | **13.8 ms** |
| first-contentful-paint | 44 ms | **24 ms** |
| DOMContentLoaded | 29.9 ms | 15.1 ms |
| số kết nối WebSocket | 1 | **1** |

FCP **không** bị phạt dù 4 script cổ điển vào `<head>` — đây là rủi ro tôi nêu ra trước khi đo (script
đồng bộ chặn parse) và số đo bác bỏ nó; nhiều khả năng vì đồ thị module phải fetch/eval ít hơn.

**Luồng thật, cả 2 instance, kết quả giống hệt nhau:** khách đăng nhập → sảnh (`nav-user` có tên ⇒
`session:me` đến đúng client, không phải một kết nối mồ côi) → tạo phòng nhanh → `room.html` → reload
`room.html` → rời phòng về sảnh. **Đúng 1 kết nối WebSocket ở mỗi trang**, **không** bị đá về
`login.html`, **0 console error**.

**Cảnh báo về con số:** đây là localhost. Nó chứng minh **thứ tự** đã đổi và các bất biến còn nguyên,
**không** chứng minh được biên độ trên domain thật — ở đó khoản tiết kiệm phải lớn hơn, vì cái đang
được đẩy song song là 321 ms TCP+TLS chứ không phải ~3 ms. Trần cứng vẫn là 242 ms của `index.html`
(`no-cache` theo đúng thiết kế #106): không thể mở socket trước khi HTML về.

Nhánh `fix/socket-early-connect` off `dev` (mục #145 chưa có trên `main` — đã kiểm bằng
`git show main:TODO.md`).
