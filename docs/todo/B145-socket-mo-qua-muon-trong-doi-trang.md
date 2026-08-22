# #145 — Socket.io chỉ được mở ở cuối đồ thị module: mất trắng ~220-460 ms trước khi bắt tay bắt đầu

**Trạng thái:** ✅ Đã sửa — **ĐÃ LÀM 2026-08-22** (`fix/socket-early-connect` off `dev`).

`client/js/socket-early.js` (mới) chạy như script cổ điển trong `<head>` và gọi
`SocketClient.shared()` — static mới trong `socket-client.js`, là **một chỗ duy nhất** giữ tính
idempotent (`destroy()` nhả slot). Bốn script (`socket.io.min.js`, `session.js`, `socket-client.js`,
`socket-early.js`) chuyển lên đầu `<head>`, **TRÊN mọi `<link rel="stylesheet">`** — script cổ điển
đặt sau một stylesheet link sẽ chờ stylesheet đó tải xong mới chạy, để trôi xuống dưới CSS là trả
lại toàn bộ khoản tiết kiệm mà không có gì hỏng để nhận ra. `session.js`/`socket-client.js` gỡ khỏi
import của `index-entry.js` + 2 hint `modulepreload` (để lại là nạp file 2 lần = đường #51).
`lobby.js:40` `new SocketClient()` → `SocketClient.shared()`. Object option `io({...})` **không
đụng** ⇒ 8 test của #131 pass nguyên. `?v=149→150` (184 chỗ, grep ra đúng 1 giá trị).

- **15 test mới** `client/tests/socket-early-connect.test.js`; `npm test` **1245/1245** (trước
  1230). Kiểm chứng không rỗng bằng mutation test trên **bản sao ở thư mục tạm**: revert 4 file
  nguồn về HEAD ⇒ **13/15 fail** (2 case còn pass là bất biến vốn đã đúng, giữ làm regression guard).
- **Đo trên 2 instance cô lập** (copy repo + DB rỗng + cổng 3111/3112; server thật cổng 3000 và
  `server/db/gomoku.db` thật không bị đụng). Mốc `navigationStart` → WS opened, median 7 lần:
  **36.9 ms → 13.8 ms**; WS constructed 28.1 → 10.7 ms; FCP **44 → 24 ms**; đúng **1 kết nối
  WS/trang**; 0 console error; luồng khách→tạo phòng→`room.html`→reload→rời phòng giống hệt nhau
  trên cả 2 instance, không bị đá về login.
- **Rủi ro tôi nêu trước khi đo đã bị số đo bác bỏ**: 4 script đồng bộ vào `<head>` có thể phạt
  first paint — thực tế FCP *cải thiện*, nhiều khả năng vì đồ thị module phải fetch/eval ít hơn.
- **Giới hạn của số đo**: localhost, nên nó chứng minh **thứ tự** đã đổi và các bất biến còn nguyên,
  **không** chứng minh biên độ trên domain thật (ở đó cái được đẩy song song là 321 ms TCP+TLS, chứ
  không phải ~3 ms). Trần cứng vẫn là 242 ms của `index.html`.
- **Phạm vi cố ý chỉ `index.html`** — `room.html`/`tournament-*.html` vẫn dựng client từ entry
  module; `shared()` hoạt động đúng ở cả hai kiểu và có test riêng cho đường không có script `<head>`.
- Chi tiết: [fix-log](../fix-log/2026-08-22-todo-145-socket-mo-som-trong-head.md).

**Nguồn:** phân tích HAR `play3cr.dpdns.org_Archive [26-08-22 19-20-59].har` (trang `index.html`,
2026-08-22 19:20:52 +07) — người dùng hỏi vì sao entry `wss://play3cr.dpdns.org/socket.io/` có
timeline dài nhất. Kèm tra cứu chuẩn ngành theo yêu cầu ("Tiêu chuẩn của các Big Site xử lý tình
huống này thế nào?").

## Số đo

T0 = `19:20:52.337`. `onContentLoad` = +443 ms, `onLoad` = +494 ms. **24/26 request lấy từ cache
(0 ms)** — #106/#111 vẫn đang hoạt động tốt, đây không phải vấn đề tài nguyên tĩnh.

Entry WebSocket dài **543 ms**, nhưng nó là 3 thứ khác nhau cộng lại:

| Giai đoạn | ms | Bản chất |
|---|---|---|
| T0 → 52.799 (chờ trước khi bắt đầu) | **462** | socket chưa được mở — **mục này** |
| `connect` (gồm `ssl` 77) | 321 | TCP+TLS mới hoàn toàn — không sửa được, xem dưới |
| `wait` → 101 | 145 | CF → tunnel → origin + middleware auth — xem #146 |
| **Tổng tới khi có socket** | **~1005** | |

`index.html` về lúc `52.579` (HTTP/3, `wait=242ms`). Socket bắt đầu lúc `52.799`. ⇒ **220 ms nằm
hoàn toàn ở phía client sau khi HTML đã về**, thuần lãng phí.

`dns: 0`, `blocked: -1` ⇒ không phải DNS, không phải nghẽn hàng đợi connection.

## Nguyên nhân

`client/index.html:449` nạp `js/index-entry.js` bằng `type="module"` ở **cuối `<body>`**. Module
luôn defer ⇒ chỉ chạy sau khi parse xong toàn bộ HTML. Chuỗi phụ thuộc tới lúc mở socket:

```
index-entry.js → (session, i18n, ui-mode, settings-panel, socket-client) → lobby.js:40
                                                                          └─ new SocketClient()
                                                                             └─ _connect() → io()
```

`SocketClient._connect()` **không cần DOM, không cần CSS, không cần i18n** — nó chỉ cần global `io`
(script cổ điển ở `index.html:445`) và một lần đọc `localStorage` qua
`GvnSession.hasBelievedSession()`. Không có lý do kỹ thuật nào để nó phải xếp hàng sau cả đồ thị
module.

## Vì sao đây là thời gian màn hình trống thật, không chỉ là một entry HAR dài

Sảnh hiện phụ thuộc **100%** vào socket để có dữ liệu đầu tiên: danh sách phòng, `session:me`,
online count. Không socket = không nội dung. Nên ~1005 ms đó là thời gian người chơi nhìn màn hình
rỗng, chứ không phải một tài nguyên phụ tải chậm ở nền.

## Việc cần làm

Tách việc **khởi tạo kết nối** ra khỏi `lobby.js`, bắn nó ngay khi `io` sẵn sàng — chuyển
`<script src="/vendor/socket.io/socket.io.min.js">` lên `<head>` kèm một đoạn khởi tạo sớm cất
socket vào một chỗ dùng chung; `SocketClient` khi được `lobby.js` dựng thì **nhận lại** socket đó
thay vì gọi `io()` lần nữa. Kết quả: 321 ms TCP+TLS chạy **song song** với parse HTML/CSS thay vì
nối tiếp sau.

Ước tính: **−200…−250 ms** thời gian tới lúc có socket. Trần cứng là 242 ms của `index.html`
(`no-cache` theo đúng thiết kế #106) — không thể mở socket trước khi HTML về.

Ràng buộc và bẫy: xem `docs/instruction/B145-socket-mo-qua-muon-trong-doi-trang.md`.

## Chuẩn ngành (tra cứu 2026-08-22)

- **Không có cơ chế khai báo nào hâm nóng được kết nối `wss://`.** Đề xuất WHATWG
  [issue #8037](https://github.com/whatwg/html/issues/8037) xin `<link rel="preconnect/preload">`
  cho WebSocket — lý do y hệt của chúng ta ("websocket connection is on the critical path") — đã bị
  **closed as not planned**. Cách duy nhất web platform còn cho phép chính là gọi `io()` sớm hơn
  trong đời trang. Đây không phải hack.
- **Figma**: mở file thì fetch **toàn bộ state ban đầu qua HTTP**, render xong; WebSocket chỉ để
  subscribe event và nhận diff. Khi online lại sau khi offline cũng tải bản mới qua HTTP rồi mới mở
  socket mới. Socket không bao giờ quyết định first paint.
  ([1](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/),
  [2](https://www.figma.com/blog/making-multiplayer-more-reliable/))
- **Slack**: lấy token + "websocket connection setup information" qua HTTP **trước**, rồi nối tới
  edge region gần nhất; Gateway Server trả message đầu tiên rồi mới subscribe channel server **bất
  đồng bộ** — cố ý đẩy phần nặng ra sau khi connection đã open.
  ([slack.engineering](https://slack.engineering/real-time-messaging/))

⇒ Nguyên tắc chung của Big Site **không phải** "làm socket connect nhanh hơn" mà là "làm socket rời
khỏi critical path".

## Ngoài phạm vi mục này (cố ý chưa filed thành việc)

**Bootstrap sảnh qua HTTP** (`GET /api/lobby` chạy song song, render ngay, socket chỉ để cập nhật
delta) là đúng chuẩn Figma/Slack và sẽ xoá hẳn phụ thuộc first-paint vào socket. Nhưng đó là thay
đổi kiến trúc lớn. **Chỉ cân nhắc nếu sau khi làm mục này mà 242 ms HTML + 321 ms TLS vẫn còn là
vấn đề cảm nhận được** — đừng làm trước.

## Đã loại trừ — đừng đi lại các đường này

- **`<link rel="preconnect">` / `dns-prefetch`**: vô ích. Chúng hâm nóng một connection h2/h3 mà
  WebSocket **không đụng tới được**. Xem WHATWG #8037 ở trên.
- **321 ms `connect`**: là mất gói SYN ở chặng trình duyệt ↔ Cloudflare edge, cùng nguyên nhân đã đo
  ở **#131** (`mtr` cho ~17% loss từ hop 8 của nhà mạng). Không sửa được bằng code — chỉ **giấu đi
  bằng cách chạy song song**, đúng mục đích của mục này.
- **WS over HTTP/2 (RFC 8441) / HTTP/3 (RFC 9220)**: về lý thuyết xoá hẳn 321 ms vì dùng lại
  connection h3 sẵn có. **Đính chính so với nhận định ban đầu của tôi**: trình duyệt thì CÓ hỗ trợ
  (Firefox implement RFC 8441 mặc định), nhưng **CDN thì không** — "adoption is patchy and many CDNs
  still tunnel WebSockets over HTTP/1.1", và RFC 9220 thì Chrome/Firefox đều chưa hỗ trợ.
  HAR này chính là bằng chứng: **Firefox 153 xin `HTTP/1.1` Upgrade** dù trang chính đang chạy
  HTTP/3, và đi tới **IP edge khác** (`104.21.11.251` vs `172.67.150.225`) ⇒ Cloudflare edge không
  chào Extended CONNECT trên đường này. Kết luận thực hành không đổi (ngõ cụt), nhưng lý do là "CDN
  chưa hỗ trợ", không phải "trình duyệt chưa hỗ trợ". ([RFC 8441](https://www.rfc-editor.org/rfc/rfc8441),
  [websocket.org/standards](https://websocket.org/standards/))

## Quan sát phụ trong cùng HAR (không thuộc mục này)

- `POST /cdn-cgi/rum` **`wait: 380 ms`** + `beacon.min.js` (Cloudflare Web Analytics) khởi động lúc
  `52.849` — đúng lúc socket đang bắt tay, giành CPU và connection. Cân nhắc bỏ nếu không ai đọc số
  liệu đó.
- `index.html` trả **304 nhưng mất 242 ms** mỗi lần tải vì `no-cache`. Đúng thiết kế #106, và là
  trần cứng cho mục này. Hạ thêm thì phải `stale-while-revalidate` hoặc service worker, đánh đổi độ
  tươi — chưa đề xuất.
- **HAR Firefox không ghi WS frame** (`_webSocketMessages` rỗng). Muốn đánh giá khối lượng byte trên
  dây sau khi connect thì phải bắt lại bằng Chrome DevTools.
