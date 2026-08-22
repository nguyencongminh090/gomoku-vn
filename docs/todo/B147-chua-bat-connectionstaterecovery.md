# #147 — Chưa bật `connectionStateRecovery`: mỗi lần rớt mạng phải làm lại toàn bộ handshake + rejoin

**Trạng thái:** chưa làm. **Cần chốt với người dùng trước khi implement** (xem phần rủi ro).

**Nguồn:** tra cứu chuẩn ngành theo yêu cầu người dùng ("Tiêu chuẩn của các Big Site xử lý tình
huống này thế nào?", 2026-08-22), phát sinh từ phân tích HAR ở #145.

## Vấn đề

`server/index.js` dựng `new Server(server, { cors: {...} })` — **chỉ có `cors`**. Không bật
`connectionStateRecovery`.

Hệ quả: mỗi lần transport rớt, người chơi trả giá **toàn bộ** đường vào lại — 321 ms TCP+TLS
(#145) + 145 ms auth (#146) + logic eviction single-device + rejoin room + phát lại state. Mọi
event xảy ra trong lúc rớt thì mất hẳn.

Bối cảnh làm mục này đáng cân nhắc: **#131 đã đo được ~17% mất gói** ở hop 8 của nhà mạng người
dùng (`mtr`), và 12 lần bắt tay WS trải 1.9–7.9 s. Đây đúng là môi trường mà tính năng này sinh ra
để phục vụ.

## Chuẩn ngành (tra cứu 2026-08-22)

- **Discord**: có `resume_gateway_url` + opcode `RESUME` + `session_id`. Rớt thì nối lại và **phát
  lại event bị lỡ**, không làm lại `IDENTIFY` từ đầu. Session bị huỷ sau ~5 phút mất kết nối, và
  client **phải leo thang từ RESUME sang IDENTIFY** sau nhiều lần thất bại thay vì kẹt trong vòng
  lặp resume vô hạn. ([Discord Gateway docs](https://docs.discord.com/developers/events/gateway))
- **socket.io** có đúng tính năng tương đương: `connectionStateRecovery`, kèm
  `maxDisconnectionDuration` (khuyến nghị ~2 phút — **không để `Infinity`**) và `skipMiddlewares`.
  ([socket.io server options](https://socket.io/docs/v4/server-options/),
  [Ably — scaling Socket.IO](https://ably.com/topic/scaling-socketio))

## Việc cần làm

Bật `connectionStateRecovery` trong `new Server(...)` với `maxDisconnectionDuration` hữu hạn.

**Nhưng đọc `docs/instruction/B147-chua-bat-connectionstaterecovery.md` trước** — mục này đụng thẳng
vào vùng code đã từng đẻ ra bug thật.

## Rủi ro chính (vì sao phải chốt trước, không tự làm)

`SocketHandler.js` `io.on('connection')` có logic **single-device-per-token**: tìm socket cũ trong
`sessions`, evict nó, và **chỉ bỏ qua `session:kicked` khi `handshake.auth.reconnect === true`**
(cờ do `socket-client.js` đặt trong listener `reconnect_attempt`). Đây chính xác là chỗ đã sinh ra
triệu chứng giả **"tài khoản vừa đăng nhập ở thiết bị khác"** (xem comment dài tại chỗ, và điểm cần
theo dõi ở cuối `docs/todo/B131-*.md`).

`connectionStateRecovery` thay đổi **đường đi của reconnect** và có `skipMiddlewares` bỏ qua auth
middleware. Bật nó mà không truy đủ tương tác với đoạn eviction trên là cách nhanh nhất để tái phát
đúng bug đó. Ngoài ra `DisconnectHandler` có tới 3 loại grace period (disconnect / empty-room /
spectator) mà #115 vừa mới chỉnh — recovery có thể chồng lấn hoặc vô hiệu hoá chúng.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa đo)

- **Hiệu quả:** tiềm năng lớn với người chơi ở mạng mất gói (đã đo là có thật), gần như không đổi
  với mạng tốt.
- **An toàn:** **cao rủi ro** so với #145/#146 — đụng vùng session/eviction/grace period. Không phải
  việc "bật một cờ".
- **Test:** có hạ tầng thật ⇒ bắt buộc. Phải phủ được cả đường rớt-và-phục-hồi lẫn đường
  đăng-nhập-thiết-bị-thứ-hai-thật, để chứng minh hai thứ đó không lẫn vào nhau.
