# Fix log entry — 2026-08-19 22:04

## Prompt

Người dùng dán console log từ trình duyệt thật: 2 cặp `Firefox can't establish a connection to the
server at wss://play3cr.dpdns.org/socket.io/…` + `The connection … was interrupted while the page
was loading`, kèm nhiều cảnh báo `AudioContext` và một `TypeError` ở `content.js:64`.

## Action

Chẩn đoán trước, sửa sau.

**Phân loại 3 nhóm thông báo:**
- `AudioContext was prevented from starting automatically` (6 lần, `audio-manager.js`) — chính sách
  autoplay của trình duyệt, vô hại, có từ trước, không liên quan. Không sửa.
- `TypeError … content.js:64` — tiện ích mở rộng của trình duyệt; repo không có file `content.js`.
  Không phải code dự án.
- Lỗi WebSocket — thật, đã truy nguyên bên dưới.

**Truy nguyên (đo từ chính máy chủ):**
- `mtr -n -r -c 30 1.1.1.1`: hop 1-5 (router nhà `10.0.0.1`, modem `192.168.1.1`, mạng truy nhập
  ISP) **0% loss**; từ hop 8 (`10.255.10.25`) trở đi **16.7% loss** liên tục tới đích.
- `ping` router: 0% loss, 1.5 ms. Wi-Fi tốt (−56 dBm, 433/780 Mbit) ⇒ **không phải Wi-Fi**.
- `curl -w %{time_connect}` tới Google/GitHub/Cloudflare/site: 45 ms **hoặc** 3.1 / 4.1 / 5.2 / 7.6 /
  11.7 s — đúng bậc thang SYN retransmit, và xảy ra với **mọi đích**, không riêng site.
- 12 lần bắt tay WebSocket qua Cloudflare: 1921, 3388, 3404, 3713, 4492, 5074, 5670, 6353, 7841,
  7903, 7948 ms (11/12 thành công). Median 5074, max 7948.

**Sửa:** `client/js/socket-client.js` `timeout: 8000` → `12000`, comment viết lại theo số đo phân bố
thật thay vì mẫu đơn lẻ. `?v=131→132` trên 17 file.

**Test:** cập nhật `client/tests/socket-client-connect-options.test.js` — giá trị kỳ vọng 12000, và
siết biên khoảng hợp lệ từ `>7948` lên `>10000`.

## Decision

**Giá trị 8000 của bản trước là sai, không phải "chưa tối ưu".** Nó được hiệu chỉnh trên **một mẫu
duy nhất** trong HAR (2.9 s). Phân bố thật có max thành công 7948 ms ⇒ 8000 nằm **đúng trên đỉnh**
phân bố, sẽ cắt những lần kết nối đáng lẽ thành công. Chọn 12000 theo bậc thang SYN retransmit
(1 s → 3 s → 7 s → 15 s): vượt hẳn bậc 7 s kể cả jitter, vẫn bỏ cuộc trước bậc 15 s.

**Siết biên test sau khi phát hiện nó rỗng một nửa.** Biên `>7948` ban đầu **vẫn cho 8000 lọt**
(8000 > 7948 đúng 52 ms) — tức test không bắt được chính lỗi vừa sửa. Nâng lên `>10000`: hairline
margin không phải headroom, và 7948 ms chỉ là max của 12 mẫu. Đã kiểm chứng lại: với 8000 thì 3/8
fail (gồm cả case biên), với 20000 thì 3/8 fail.

**Không ghi mất gói ISP vào tracking** — người dùng chọn "chỉ báo cáo, không ghi" khi được hỏi.

**Không sửa** `audio-manager.js` (cảnh báo autoplay vô hại, ngoài phạm vi báo cáo).

**Branching:** `fix/socket-io-timeout-retune` off `dev`, merge lại `dev` — cùng lý do với bản trước
(`#131` không có trên `main`).

## Summary output

`npm test` **1193/1193**. Test không rỗng: đặt lại 8000 → **3/8 fail**; đặt 20000 → **3/8 fail**.

Xác minh Playwright trên instance **cô lập** (copy repo + DB tạm + cổng 3111; server/DB thật không
đụng, người chơi vẫn online — kiểm sau: 22 users như cũ, server uptime liên tục 2d16h):

| | Kết quả |
|---|---|
| Luồng guest → tạo phòng → `room.html` | connect **767 ms**, `io._timeout = 12000`, transport `websocket`, banner không kẹt, **0 console error** |
| Đường thất bại (`routeWebSocket` nuốt handshake) | bỏ cuộc sau **12 115 ms** (trước retune: 8 122 ms; mặc định: 20 120 ms) |

**Kết luận cho người dùng:** nguyên nhân gốc là ~17% mất gói ở mạng nhà mạng (từ hop 8), ngoài tầm
kiểm soát của cả server lẫn code. Bản sửa này chỉ giảm thiệt hại.
