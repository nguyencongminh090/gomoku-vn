# #147 — Chưa bật `connectionStateRecovery`: mỗi lần rớt mạng phải làm lại toàn bộ handshake + rejoin

**Trạng thái:** ✅ Đã đóng — **ĐÃ ĐIỀU TRA 2026-08-22, KHÔNG LÀM** (người dùng chốt qua
`AskUserQuestion` sau khi xem số liệu điều tra). Lý do: app **đã có sẵn** cơ chế recovery ở tầng ứng
dụng mạnh hơn và đúng ngữ nghĩa hơn socket.io's `connectionStateRecovery`; lợi ích thật còn lại chỉ
là tin nhắn chat bị lỡ, và cái đó giải quyết trực tiếp thì rẻ và an toàn hơn nhiều. Xem
"## Điều tra 2026-08-22" ở cuối file. Khoảng trống chat được tách thành **#150** (mục mới, chưa làm).

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

---

## Điều tra 2026-08-22 (socket.io 4.8.3) — vì sao đóng thay vì làm

Đọc `node_modules/socket.io/dist/{index,namespace,socket}.js` và
`node_modules/socket.io-client/build/cjs/socket.js` thật, đúng như instruction yêu cầu ("KHÔNG suy từ
tài liệu"). Bốn phát hiện, xếp theo mức độ quyết định.

### 1. `skipMiddlewares` mặc định là `true` — bật "trần" sẽ crash server

`index.js:106-111`:

```js
if (opts.connectionStateRecovery) {
    opts.connectionStateRecovery = Object.assign({
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,          // ← MẶC ĐỊNH
    }, opts.connectionStateRecovery);
```

`namespace.js:214-219`: khi `skipMiddlewares && socket.recovered` thì gọi thẳng `_doConnect(socket, fn)`,
**bỏ qua `this.run(socket, ...)`** — tức bỏ qua toàn bộ `io.use()`, cả `verifySocketToken` lẫn
middleware chống flood.

`socket.js:96-107`: socket phục hồi chỉ khôi phục `id`, `pid`, `rooms`, `data`, `missedPackets`.
`socket.user`/`socket.sessionId` là **thuộc tính riêng của chúng ta**, do `verifySocketToken` gán —
**không** nằm trong danh sách đó.

⇒ `io.on('connection')` ở `SocketHandler.js` mở đầu bằng `const user = socket.user;` rồi
`logger.info(...${user.displayName}...)` ⇒ **TypeError** trên mọi kết nối phục hồi. Không phải suy
đoán — đây là hệ quả trực tiếp của 3 đoạn code trên. Cộng thêm: session **đã bị thu hồi** sẽ sống lại
vì không có gì kiểm tra nó nữa, phá đúng cái #68 xây (đã cảnh báo trước trong instruction, nay xác
nhận bằng code).

### 2. `auth.reconnect` CÓ sống sót qua đường phục hồi (tin tốt, nhưng không cứu được lợi ích)

Câu hỏi mà instruction bắt phải trả lời trước khi làm bất cứ gì. `socket.io-client/socket.js:443-444`:

```js
data: this._pid
    ? Object.assign({ pid: this._pid, offset: this._lastOffset }, data)
    : data,
```

`data` là object `auth` của người dùng ⇒ cờ `reconnect: true` (do listener `reconnect_attempt` của
`socket-client.js` đặt) được **giữ nguyên** và merge cạnh `pid`/`offset`. `socket.js:121`
`this.handshake = this.buildHandshake(auth)` chạy ở **cả hai** nhánh. ⇒ với `skipMiddlewares: false`,
logic `isOwnReconnect` chống "đăng nhập ở thiết bị khác" giả **vẫn hoạt động đúng**.

Nghĩa là mục này *có thể* làm được an toàn — chỉ là không đáng, vì lý do 3.

### 3. Lợi ích gần như bằng 0: app đã re-gửi TOÀN BỘ state, mạnh hơn replay của socket.io

`SocketHandler.js` nhánh `existingRoom` gửi lại đầy đủ mỗi lần reconnect:

```js
const payload = roomManager.serializeRoom(existingRoom);
if (existingRoom.gameState) {
  payload.gameState = existingRoom.gameState.serialize();
  payload.timer     = timer.getTimers();
  payload.timerSync = timer.getSync();   // deadline, để đồng hồ chạy lại đúng nhịp
}
socket.emit('room:joined', payload);
```

Cộng với `cancelDisconnectGrace` / `cancelEmptyRoomGrace` / `cancelSpectatorGrace` và Viewer
reconnect không giới hạn (#115). Đây là recovery **theo ngữ nghĩa miền**, còn `connectionStateRecovery`
chỉ phát lại gói tin thô.

Ba thứ socket.io thêm vào, đối chiếu từng cái:

| socket.io thêm | App đã có? |
|---|---|
| Tự join lại room ở tầng socket.io | Có — `socket.join(existingRoom.roomId)` |
| Phát lại gói tin bị lỡ | **Thừa** cho room/game/timer — `room:joined` đè lên sau đó |
| Giữ nguyên `socket.id` | Không cần — `sessions` khoá theo `userId`, không theo `socket.id` |

Thứ tự cũng bất lợi: `missedPackets` được bắn trong **constructor** của Socket, tức **trước** khi sự
kiện `connection` chạy ⇒ trước `room:joined`. Với `game:moved` thì vô hại (snapshot đến sau thắng),
nhưng với các event **không idempotent** và **không bị snapshot đè** — `game:ended`, `room:destroyed`
— thì đó là phát lại một modal/âm thanh đã cũ.

### 4. Lợi ích thật duy nhất: chat bị lỡ

`ChatHandler.js` **không lưu lịch sử** (grep: không có `chatHistory`/`messages`), và `serializeRoom()`
cũng không trả về chat. ⇒ tin nhắn gửi trong lúc một người rớt mạng là **mất hẳn** với người đó, hôm
nay. Đây là khoảng trống thật, và `connectionStateRecovery` sẽ vá được nó như một tác dụng phụ.

Nhưng vá nó bằng cách bật `connectionStateRecovery` là dùng một cơ chế chạm vào auth middleware,
eviction, và 3 grace period — để giải quyết một vấn đề nằm gọn trong `ChatHandler`. Không cân xứng.

### Quyết định

Người dùng chốt **đóng #147** sau khi xem bảng so sánh trên (`AskUserQuestion`, 2026-08-22).
Khoảng trống chat tách thành **#150** — mục riêng, chưa làm, giải quyết trực tiếp bằng buffer chat
server-side gửi kèm `room:joined`, không đụng tầng socket.io.

**Đính chính so với chính mục này lúc mới ghi:** dòng "Mỗi lần rớt transport, người chơi trả giá
toàn bộ đường vào lại … và **mất hẳn event xảy ra trong lúc rớt**" ở phần "Vấn đề" phía trên là
**quá rộng**. Đúng ra chỉ có **chat** là mất; room/game/timer đều được `room:joined` dựng lại đầy đủ.
Tôi viết dòng đó khi chưa đọc kỹ nhánh `existingRoom`. Giữ nguyên văn bản gốc phía trên (không sửa
lịch sử), đính chính ở đây.
