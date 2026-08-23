# B152 — `game:move` không có ack/timeout/retry: mất gói im lặng ⇒ bàn cờ đứng vĩnh viễn

**Trạng thái:** Chưa làm

**Severity:** High (ván đấu hỏng hẳn, không tự phục hồi, người chơi phải F5)
**Platform:** Mọi nền tảng — biểu hiện rõ nhất trên mạng mất gói (người chơi TQ báo cáo, mạng di
động, wifi yếu)
**Pages affected:** `room.html` (bàn cờ khi đang chơi)
**Reported by:** User (báo cáo người chơi ở Trung Quốc, 2026-08-23) — "Mỗi khi nhấn nước đi: lag;
~0.5s mới xuất hiện. Đôi lúc freeze."

---

## Symptom

Người chơi bấm đặt quân, quân cờ **không bao giờ hiện ra**, bàn cờ đứng im vô thời hạn. Không có
thông báo lỗi, không có vòng quay chờ, không có gì cho biết nước đi đã thất bại. Người chơi chỉ có
thể F5 để thoát.

---

## Nguyên nhân (đã trace toàn bộ đường đi)

`client/js/game-ui.js:108` gửi nước đi bằng **bare emit, không có ack callback**:

```js
global.RoomClient.emit('game:move', { x, y });
```

`SocketClient.emit()` (`client/js/socket-client.js`) cũng chỉ là `this.socket.emit(event, data)` —
**không hỗ trợ ack ở bất kỳ đâu**. Quân cờ chỉ được vẽ khi server phát ngược `game:moved` về
(`client/js/room-socket.js:211-245`).

Hệ quả: nếu gói `game:move` (chiều đi) **hoặc** gói `game:moved` (chiều về) bị rớt **trong khi socket
vẫn ở trạng thái "connected"**, client không có cách nào biết. Không ack, không timeout, không retry,
không phản hồi UI — client chờ mãi một `game:moved` sẽ không bao giờ tới.

### Vì sao cơ chế phục hồi sẵn có KHÔNG cứu được

Có resync tự động, nhưng nó **chỉ kích hoạt khi có disconnect→reconnect thật sự**:
`server/socket/SocketHandler.js:233-266` — mọi kết nối mới đều được kiểm tra `getRoomByUser()`, nếu
người dùng đang thuộc một phòng thì server tự đẩy `room:joined` kèm **full `gameState`** (board, lượt,
moveCount, moveHistory, timer, swap2, undo offer); client dựng lại bàn cờ ở
`client/js/room-socket.js:74-91`. `DisconnectHandler.js:329-409` (`cancelDisconnectGrace`) lo phần
đồng hồ + presence.

Nhưng nếu mức mất gói **chỉ đủ rớt một gói `game:move`/`game:moved` mà không làm rớt hẳn kết nối
WebSocket**, không có gì kích hoạt luồng trên cả. Đây chính xác là kiểu nhiễu mà nghiên cứu về GFW mô
tả (drop có chọn lọc theo bộ 3-tuple trong ~180s, không phải chặn cứng) — xem phần điều tra mạng
kèm theo trong `docs/instruction/B152-*.md`.

Lưu ý: `client/js/socket-client.js:169-171` **có** listener `reconnect` nhưng nó chỉ cập nhật banner
trạng thái, không yêu cầu lại state. `room-socket.js:32-38` (`client.on('connect')` →
`processRoomIntent()`) bị chặn bởi cờ `intentProcessed` (`room-socket.js:467-468`) nên chỉ chạy đúng
một lần ở lần connect đầu tiên — không tái phát khi reconnect. Cả hai đều đúng như thiết kế (resync
là server-push chứ không phải client-pull), chỉ là **không có đường nào cho trường hợp không hề
disconnect**.

---

## Việc cần làm

### 1. Ack hai chiều cho `game:move`

Server (`server/socket/handlers/GameHandler.js:54-108`) nhận thêm tham số `ack`, trả kết quả về:
- Nước đi hợp lệ → `ack({ ok: true, moveCount })` (sau khi đã `io.to(roomId).emit('game:moved')`)
- Nước đi bị từ chối → `ack({ error, code })`

**Bắt buộc guard `typeof ack === 'function'`** — xem phần "Bẫy" bên dưới.

Client: thêm method mới có ack + timeout vào `SocketClient` (**không sửa `emit()` hiện tại** — có
nhiều call site khác đang dùng). Dùng API sẵn có của socket.io-client:

```js
socket.timeout(5000).emit('game:move', { x, y, moveId }, (err, res) => { ... });
```

`.timeout(ms)` là **per-emit**, đặt `flags.timeout` cho riêng lần emit đó (đã xác minh trong
`node_modules/socket.io-client/build/cjs/socket.js:735` và `:291`) — đúng thứ cần, không ảnh hưởng
call site khác. Callback là err-first: `err` ≠ null nghĩa là hết giờ chờ ack.

⚠️ **KHÔNG dùng option `retries` toàn cục** — xem "Bẫy" mục 5.

### 2. Idempotency khi retry — `moveId` do client sinh (chuẩn ngành)

Kịch bản nguy hiểm: gói `game:move` **đã tới** server và đã được áp dụng, chỉ gói ack rớt trên đường
về. Client retry mù sẽ nhận `CELL_OCCUPIED` và hiện lỗi sai cho một nước đi thực ra đã thành công.

**Hướng chốt: client sinh `moveId` (uuid, `crypto.randomUUID()`) gắn vào mỗi nước đi; server giữ tập
`moveId` đã xử lý theo ván, gặp lại thì phát lại `movePayload` cũ thay vì xử lý như nước đi mới.**
Retry phải gửi lại **đúng `moveId` cũ**, không sinh id mới — đó là toàn bộ điểm mấu chốt.

Tập `moveId` sống trong `room.gameState` (hoặc cạnh nó), dọn sạch ở `handleGameEnd`. Phạm vi rất hẹp
(tối đa vài chục nước/ván) nên không cần TTL/eviction phức tạp như hệ thống payment.

#### Vì sao KHÔNG dùng "dedupe theo nước đi cuối" (hướng A — đã bác bỏ 2026-08-24)

Bản đầu của file này chốt hướng A: so khớp `(x, y)` với nước đi **cuối cùng** trong `moveHistory` +
đúng người gửi, coi là echo. **Đã bác bỏ** sau khi đối chiếu chuẩn ngành — hướng A có một kịch bản
xử lý sai thật sự:

> Client gửi nước A → server nhận, áp dụng, phát `game:moved`, nhưng **ack rớt đường về** → client
> timeout, gửi lại A → **gói gửi lại cũng bị trễ trên mạng** (đúng kiểu mất gói đang bàn) → trong lúc
> đó đối thủ đã nhận `game:moved` của A, thấy tới lượt mình, **đi nước B** → B tới server **trước**
> gói gửi-lại-A → giờ "nước đi cuối cùng" là B chứ không còn là A → điều kiện dedupe **không khớp** →
> server xử lý gói gửi-lại-A như nước đi mới → trả `CELL_OCCUPIED` → **client hiện lỗi cho một nước đi
> thực ra đã thành công.**

Gốc rễ: hướng A dedupe theo *vị trí trong lịch sử*, mà vị trí đó **thay đổi theo thời gian** khi có
nước đi khác chen vào. `moveId` dedupe theo *danh tính của chính hành động*, không phụ thuộc đã có
bao nhiêu sự kiện xảy ra ở giữa — nên miễn nhiễm với kịch bản trên.

Đây cũng là lý do **ba nguồn chuẩn ngành độc lập nhau đều dùng định danh do client sinh**, không ai
dùng content-matching:
- [Socket.IO official docs](https://socket.io/docs/v4/delivery-guarantees) — "assigning a unique ID
  to each packet is the duty of the user to allow deduplication on the server side"
- [Stripe idempotency keys](https://stripe.com/blog/idempotency) — chuẩn de-facto cho mọi API có
  retry, cả ngành payment sao chép
- [Gabriel Gambetta — Client-Side Prediction & Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
  — chuẩn ngành game real-time, dùng **sequence number** tăng dần gắn vào mỗi input

### 3. Sự kiện `game:resync` (primitive độc lập)

Thêm `socket.on('game:resync', ...)` phát lại `gameState` hiện tại cho **riêng socket đó**. Tái dùng
đúng logic mà `room:joined` đang dựng ở `SocketHandler.js:233-266`, không viết lại.

Dùng cho: (i) đường timeout ở mục 1, (ii) nút "Đồng bộ lại" thủ công cho người chơi, (iii) mọi nhu
cầu phục hồi state chủ động sau này. Đây là cách thoát hiểm rẻ nhất và **sửa đúng tầng** — thay vì
bắt người chơi F5.

### 4. Chính sách retry + phản hồi UI (chốt rõ, đừng tự diễn giải)

Máy trạng thái đầy đủ của một lần gửi nước đi — **thực hiện đúng thứ tự này**, không rút gọn:

| Bước | Điều kiện | Hành động |
|---|---|---|
| 1 | Click ô hợp lệ | Sinh `moveId`, `.timeout(5000).emit('game:move', { x, y, moveId })` |
| 2 | Ack `{ ok }` về | Xác nhận. Kết thúc. |
| 3 | Ack `{ error }` về | Hiện lý do từ chối. Kết thúc (**không retry** — server đã trả lời rõ ràng là không hợp lệ) |
| 4 | Timeout lần 1 | **Retry đúng 1 lần, cùng `moveId` cũ**, lại `.timeout(5000)` |
| 5 | Ack về sau retry | Như bước 2/3 |
| 6 | Timeout lần 2 | **Dừng retry**, gọi `game:resync`, hiện thông báo cho người chơi |

**Tổng thời gian xấu nhất: 10s** (2 × 5s) trước khi resync. Đây là con số người chơi thực sự phải
chờ ở trường hợp tệ nhất — cân nhắc kỹ trước khi đổi.

**Chỉ retry khi TIMEOUT, tuyệt đối không retry khi ack trả `{ error }`.** Ack lỗi nghĩa là gói đã tới
server và server đã từ chối có chủ đích — gửi lại chỉ nhận đúng lỗi đó lần nữa.

*(Ghi chú: bản đầu file này và `docs/instruction/B152-*.md` mô tả bước 4-6 không khớp nhau — bảng trên
là bản chốt, thay thế cả hai.)*

#### i18n — bắt buộc

Mọi chuỗi mới hiện cho người dùng phải thêm vào **cả `vi` lẫn `en`** trong `client/js/i18n.js`
(`TRANSLATIONS.vi` / `TRANSLATIONS.en`), dùng qua `t('key')`. Theo quy ước đặt tên sẵn có
(`'room.*'`, xem `i18n.js:339+`), đề xuất:

- `room.move_retrying` — trạng thái đang thử lại (bước 4)
- `room.move_failed` — đã thử lại nhưng vẫn không được, đang đồng bộ lại (bước 6)

**Đừng hardcode tiếng Việt thẳng vào JS** — không có chuỗi người-dùng-thấy nào trong `client/js/` được
phép nằm ngoài `i18n.js`.

### 5. Phát hiện gap ở phía NHẬN (`moveCount`) — lỗ hổng đối xứng, đừng bỏ

Mục 1-4 chỉ bảo vệ **người đi**. Gói `game:moved` broadcast tới **đối thủ** cũng rớt được, và hiện
**không có cơ chế nào phát hiện**:

> A đi → server broadcast → A nhận ack, thấy quân mình, mọi thứ bình thường → **gói `game:moved` tới B
> rớt** → B vẫn thấy bàn cờ cũ, tưởng chưa tới lượt mình → A chờ B đi, B chờ A đi → **deadlock, cả hai
> "freeze", không bên nào có timeout để thoát ra.**

Xác suất xảy ra ngang hệt trường hợp mục 1-4 đã lo. Không làm mục 5 thì B152 mới bịt được một nửa lỗ.

**Dữ liệu cần thiết đã có sẵn trên dây** — `moveCount` nằm trong `movePayload` từ trước. Vấn đề là
client đang **ghi đè mù**, `client/js/room-socket.js:230`:

```js
st.gameState.moveCount = data.moveCount;   // không bao giờ so sánh
```

Sửa thành: nếu `data.moveCount !== st.gameState.moveCount + 1` ⇒ đã miss ít nhất một broadcast ⇒ gọi
`game:resync` (primitive ở mục 3) thay vì áp dụng delta lên một base sai. Rẻ, tái dùng đúng thứ đã có.

**Đây là cách các hệ thống cùng lớp bài toán làm**: Lichess dùng acknowledgment counter trên move
event, phát hiện lệch thì xin lại state; Gambetta dùng sequence number cho đúng mục đích này. `moveCount`
đã đóng sẵn vai trò đó, chỉ chưa ai đọc nó.

**Bẫy:** `game:moved` không phải nguồn duy nhất chạm `moveCount` — `game:init`, `room:joined`
(reconnect), `game:swap2_state`, và luồng undo đều set lại state. Gap detection phải **chỉ áp dụng cho
delta tuần tự của `game:moved`**, và mọi đường "nạp state đầy đủ" phải **reset baseline** thay vì bị
tính là gap (nếu không sẽ resync vô hạn: resync → nhận full state → tưởng là gap → resync…).

---

## Bẫy đã biết

- **`ack` có thể là `undefined`.** Trong cửa sổ deploy vẫn còn client cũ (cache `?v=` chưa hết hạn)
  gửi `game:move` bằng bare emit. Không guard `typeof ack === 'function'` sẽ crash handler và làm
  hỏng ván của người dùng client cũ. Đây là lỗi ship-được-mà-không-thấy-ngay.
- **TUYỆT ĐỐI KHÔNG bật option `retries` toàn cục** trong `io({...})` ở
  `client/js/socket-client.js`. Nghe có vẻ là "dùng cơ chế sẵn có của thư viện thay vì tự viết", và
  chính đề xuất đầu tiên của phiên điều tra này đã mắc bẫy đó — nhưng **đã đọc source
  `socket.io-client` 4.8.3 và xác minh là sai** cho kiến trúc của dự án:
  - `socket.js:252` — `if (this._opts.retries && !flags.fromQueue && !flags.volatile)` → áp dụng cho
    **MỌI** emit, **không** có điều kiện "chỉ khi có ack callback". Nghĩa là `chat:message`,
    `room:sit`, `room:ready`, `tmatch:*`… đều bị cuốn vào.
  - `socket.js:359` — `_addToQueue()` **tự động nhét ack callback vào** mọi packet ⇒ mọi event bỗng
    dưng *yêu cầu* server phải ack. Handler nào không ack (tức gần như toàn bộ handler hiện tại) sẽ
    khiến client gửi lại `retries + 1` lần. **Chat sẽ bị gửi 4 lần.**
  - `socket.js:360` (`if (packet !== this._queue[0]) return`) + `_drainQueue()` (`:392-407`) — hàng
    đợi chạy **tuần tự, mỗi lần một packet**. Một event không được ack sẽ **chặn đầu hàng đợi
    (head-of-line blocking)** cho toàn bộ event phía sau, kể cả `game:move`.

  Dự án dùng **một socket dùng chung cho cả trang** (`SocketClient.shared()`, TODO.md #145) nên tác
  hại là toàn cục. Dùng `.timeout(ms).emit()` per-emit + tự viết đúng một lần retry cho riêng
  `game:move` — đó mới là phạm vi đúng.
- **Đừng nhầm với debounce của `broadcastRoomUpdate`** (`server/socket/state.js:372-383`, 80ms). Đó
  là đường phòng/sảnh, **hoàn toàn tách biệt** với đường `game:move`. Đường `game:move` đã được xác
  minh là **không có** setTimeout/debounce/queue nào — handler chạy đồng bộ trong một tick.
- **Không có persistence đồng bộ trên đường nước đi thường.** `database.saveGame()`
  (`server/db/database.js:266`) chỉ chạy từ `handleGameEnd` (`GameHandler.js:833`) khi ván kết thúc,
  và sau khi `game:moved` đã emit. `GameEngine._checkWin` (`server/managers/GameEngine.js:786`) chỉ
  quét 4 hướng từ quân vừa đặt, không quét cả bàn. Nghĩa là **độ trễ không đến từ tính toán server**
  — đừng đi tối ưu nhầm chỗ.

---

## Ngoài phạm vi

- **Siết `pingInterval`/`pingTimeout` của socket.io** (mặc định 25s/20s ⇒ kết nối chết im lặng mất
  tới ~45s mới bị phát hiện). Đã cân nhắc và **cố ý bỏ**: mạng của chính nhóm người chơi này là mạng
  mất gói, siết ping quá tay sẽ gây **false disconnect**, đá người chơi ra khỏi ván đang tốt. Dự án
  đã có đúng tiền lệ sai lầm này ở #131 (chọn `timeout` 8000ms dựa trên 1 mẫu HAR, phải retune lên
  12000ms sau khi đo phân bố thật). Ack timeout ở mục 1 giải quyết vấn đề tốt hơn vì nó gắn với
  **hành động cụ thể người dùng đang chờ** (phản hồi 5s thay vì 45s). Nếu sau này vẫn muốn làm: phải
  **đo phân bố RTT thật trước**, không chọn số tròn.
- **Nguyên nhân mạng phía Trung Quốc** (GFW/routing/domain `*.dpdns.org`) — điều tra riêng, không
  sửa được bằng code trong repo này. Xem `docs/instruction/B152-*.md` phần bối cảnh.
- **Optimistic render** — tách thành #153, có quan hệ phụ thuộc bắt buộc (đọc `docs/todo/B153-*.md`).

---

## Liên quan

- **#153** (optimistic render) — **#152 phải xong trước #153**. Lý do ghi trong cả hai file.
- **#131** (`docs/todo/B131-socket-io-client-timeout-20s-qua-lau-khi-mat-goi-syn.md`) — cùng lớp vấn
  đề (mất gói trên chặng client↔edge), đã chỉnh `timeout` connect lên 12000ms. #131 lo lúc **bắt
  tay**, #152 lo lúc **đang chơi**.
- **#150** (`docs/todo/B150-chat-mat-han-khi-nguoi-choi-rot-mang.md`) — cùng khu vực "mất dữ liệu khi
  rớt mạng", đã đóng với kết luận không sửa; đọc để không lặp lại phân tích.
