# Đánh giá kỹ thuật - gomoku-vn (Play3CR)

**Phạm vi:** chỉ ba mảng - Bảo mật, Tối ưu broadcast, Reconnect/disconnect.
**Ngày:** 2026-08-01 · **Commit:** `87006c5` (nhánh `main`, working tree sạch)
**Cách làm:** chạy thật server và đo, không chỉ đọc code.

---

## 1. Kết luận nhanh

**Ba điều nên biết trước:**

1. **Mô hình quyền trong game rất chắc.** 16 đòn giả mạo qua socket, **15 bị chặn**. Server không bao giờ đọc `userId` từ payload client - mọi handler lấy từ `socket.user` (JWT đã ký). Không có lỗi "đầu hàng thay đối thủ" hay "đi quân thay người khác".
2. **`game:moved` đã là delta tối ưu rồi: 121 byte/nước.** Không còn gì để ăn ở đây. **Đừng tốn công chuyển sang delta - đã xong.**
3. **Chỗ tốn băng thông thật không phải nước đi**, mà là `lobby:update` và `room:updated`. Cả hai đều gửi full state, không throttle.

**Bốn lỗi nên sửa sớm nhất:**

| Lỗi | Chi phí | Vì sao gấp |
|---|---|---|
| **Không có TLS** - repo không có phương án HTTPS/WSS nào | 1 file config | **Mật khẩu người dùng bay qua mạng dạng plaintext.** Xem 3.0 - cần xác nhận cách triển khai thật trước |
| JWT secret mặc định vẫn dùng được nếu `NODE_ENV` không đúng chữ `production` | ~3 dòng | Ai đọc repo cũng giả mạo được bất kỳ tài khoản nào |
| `GameHandler.js:662` hardcode `isGuest: false` | 1 dòng | **Đang mất dữ liệu ngay lúc này** - ván có guest không được lưu |
| `cancelDisconnectGrace` khởi động lại đồng hồ khi người kia còn mất kết nối | ~8 dòng | Đang xử thua oan người rớt mạng |

---

## 2. Bảng ưu tiên đầy đủ

Sắp theo (mức độ nghiêm trọng × độ rẻ).

| # | Việc | Mức | Chi phí |
|---|---|---|---|
| **0** | **Đặt TLS trước app** (Caddy/nginx) + `app.set('trust proxy', ...)` | **Nghiêm trọng** nếu đang chạy HTTP trần | 1 file config |
| 1 | `config.js`: throw khi thiếu `JWT_SECRET` bất kể `NODE_ENV` | Nghiêm trọng nếu deploy sai | ~3 dòng |
| 2 | `GameHandler.js:662`: truyền `isGuest` thật thay vì hardcode `false` | Nghiêm trọng (mất dữ liệu) | 1 dòng |
| 3 | `GameHandler.js:653`: bọc khối persist trong `if (!noScore)` | Trung bình | 1 dòng |
| 4 | `cancelDisconnectGrace`: chờ tất cả reconnect mới `timer.start()` | Cao | ~8 dòng |
| 5 | `SocketHandler.js:125`: thêm nhánh `else` báo client khi không còn phòng | Cao | ~10 dòng |
| 6 | Chặn `kick` khi `state === 'interrupted'` + check membership khi resume | Trung bình | ~6 dòng |
| 7 | Debounce `broadcastLobbyUpdate` 200-500ms | Cao | ~15 dòng |
| 8 | Hạn mức tạo phòng theo IP/tài khoản | Cao | ~20 dòng |
| 9 | `npm i helmet` + `app.use(helmet())` | Trung bình | 2 dòng |
| 10 | Bỏ `settings` khỏi `room:updated` (chỉ gửi khi đổi) | Cao | ~20 dòng |
| 11 | Flood: im lặng khi drop + disconnect khi tái phạm | Trung bình | ~10 dòng |
| 12 | `timer:tick` → gửi `deadline` 1 lần/lượt, client tự đếm | Trung bình | vừa (sửa client) |
| 13 | `lobby:update` chuyển hẳn sang delta | Cao | vừa (sửa client) |

**Đừng làm:** chuyển `game:moved` sang delta - đã là delta rồi.

---

## 3. Bảo mật

### 3.0 Nghiêm trọng - không có TLS: mật khẩu và token đi qua mạng dạng plaintext

> **Cần xác nhận trước:** kết luận này dựa trên **những gì có trong repo**. Nếu bạn đang chạy sau một reverse proxy có TLS đặt ngoài repo (nginx/Caddy/Cloudflare) thì mục này không áp dụng - nhưng khi đó vẫn cần đọc phần `trust proxy` ở cuối mục.

- **Ở đâu:** toàn repo - **không có** `Caddyfile`, không nginx config, không `docker-compose`, không `Dockerfile`, không file `.pem`/`.crt`, không `https.createServer` trong `server/`. `start.sh` chạy thẳng `node server/index.js` trên port 3000 HTTP trần.
- **Bằng chứng: ĐÃ ĐO** (theo nghĩa xác minh sự vắng mặt) - tìm toàn repo bằng `find` cho mọi mẫu cấu hình TLS/proxy, và grep `server/` cho `https.createServer|createSecureServer|key:.*cert:` - **không kết quả nào**.

**Vì sao đây là mục nghiêm trọng nhất trong cả báo cáo:**

Dự án này có **đăng nhập bằng mật khẩu**. Trên HTTP trần:

1. **`POST /api/auth/login` gửi `{username, password}` dạng plaintext.** Bất kỳ ai nằm trên đường truyền - chung wifi quán cà phê, ISP, router bị chiếm - đọc được **mật khẩu thật** của người dùng. `bcrypt` cost 12 (`config.js:49`) bảo vệ database lúc nghỉ; nó **không bảo vệ gì** cho mật khẩu lúc đang bay. Và người dùng thường dùng lại mật khẩu ở nơi khác.
2. **JWT hạn 7 ngày** (`JWT_EXPIRY = '7d'`, `config.js:47`) đi trong `socket.handshake.auth.token`. Nghe lén được một lần là chiếm tài khoản trọn tuần - codebase **không có cơ chế thu hồi token** nào (không logout server-side, đổi mật khẩu cũng không vô hiệu hoá token cũ).
3. Điều này làm mục **3.1 gần như thừa**: kẻ tấn công không cần giả mạo token khi đọc thẳng được token thật.

**Sửa:** đặt một reverse proxy có TLS trước app. Caddy là rẻ nhất - tự xin và tự gia hạn chứng chỉ Let's Encrypt. App vẫn nói HTTP trần ở cổng nội bộ, không cần biết gì về chứng chỉ.

Kèm theo, **bắt buộc** phải thêm vào `server/index.js`:

```js
app.set('trust proxy', 'loopback');   // hoặc số hop chính xác
```

Không có dòng này, `express-rate-limit` sẽ thấy mọi request đến từ IP của proxy và **gộp toàn bộ người dùng vào chung một bucket** - `authLimiter` 20 request/15 phút sẽ khoá nhầm người thật thay vì chặn kẻ dò mật khẩu. Lưu ý set đúng số hop: set rộng quá thì `X-Forwarded-For` giả mạo được và rate limit bị bypass.

Hai chi tiết dễ vấp khi dựng, ghi ra để khỏi mất buổi tối:

- Client phải chọn scheme theo trang (`wss://` khi https), **không hardcode `ws://`** - trình duyệt chặn ws:// từ trang https như mixed content. Hiện `client/js/socket-client.js:40` gọi `io({...})` không truyền URL, nên socket.io tự lấy theo origin - **chỗ này đang đúng sẵn**, chỉ cần không đụng vào.
- Nếu dùng Caddy, block `handle /socket.io*` phải đặt **trước** block catch-all, nếu không catch-all nuốt mất đường socket.

### 3.1 Nghiêm trọng nếu deploy sai - JWT secret mặc định

- **Ở đâu:** `server/config.js:43-46`
- **Vì sao:** `JWT_SECRET = process.env.JWT_SECRET || 'gomokuvn-dev-secret-change-in-production'`. Guard ở dòng 44 **chỉ** throw khi `NODE_ENV === 'production'`. Script `npm start` không set biến này. Deploy bằng pm2/systemd/docker mà quên `NODE_ENV` → server chạy bình thường, không cảnh báo, dùng secret nằm công khai trong mã nguồn.
- **Hậu quả:** bất kỳ ai đọc được repo tự ký được token cho `userId` bất kỳ và chiếm phiên người khác.
- **Bằng chứng: ĐÃ ĐO.** Tự ký HS256 bằng đúng secret đó rồi bắt tay socket:

```
=== A. Forged / unsigned JWT at socket handshake ===
  [BLOCKED ] handshake with no token :: rejected: AUTH_REQUIRED
  [BLOCKED ] handshake with garbage token :: rejected: AUTH_INVALID
  [BLOCKED ] handshake with alg=none forged :: rejected: AUTH_INVALID
  [EXPLOIT!] handshake with HS256 signed with the DEV default secret :: CONNECTED
```

- **Sửa:** throw khi thiếu `JWT_SECRET` bất kể `NODE_ENV` (trừ `'test'`).

> Ba biến thể còn lại đều bị chặn đúng - `alg=none` bị `jsonwebtoken` v9 từ chối vì secret dạng chuỗi chỉ cho phép HS256/384/512.

### 3.2 Cao - một người chiếm sạch 10/10 phòng bằng token guest miễn phí

- **Ở đâu:** `server/config.js:9` (`MAX_ROOMS = 10`), `server/managers/RoomManager.js:70-72`, `server/routes/auth.js:169`
- **Vì sao:** `POST /api/auth/guest` không cần gì cả. Mỗi guest token tạo được 1 phòng. `MAX_ROOMS` là hạn mức **toàn cục**, không có hạn mức theo IP hay theo người. `authLimiter` cho 20 request/15 phút/IP - thừa cho 10 phòng.
- **Hậu quả:** người dùng thật bấm "Tạo phòng" nhận `Số phòng đã đạt giới hạn.` Giữ vô hạn chỉ cần chạm `lastActivity` trước mốc idle 10 phút.
- **Bằng chứng: ĐÃ ĐO**, từ server khởi động sạch với 0 phòng:

```
== Room exhaustion with free guest tokens ==
  rooms created by one actor: 10
  first refusal after that  : Số phòng đã đạt giới hạn. Vui lòng thử lại sau.
  legitimate user can create a room? NO -> "Số phòng đã đạt giới hạn. Vui lòng thử lại sau."
```

- **Sửa:** hạn mức phòng theo IP/tài khoản, hoặc cấm guest tạo phòng (chỉ cho vào phòng có sẵn).

### 3.3 Trung bình - chống flood tự khuếch đại băng thông 2.48x, không bao giờ ngắt kết nối

- **Ở đâu:** `server/socket/SocketHandler.js:48-62`
- **Vì sao:** vượt `MAX_EVENTS_PER_SECOND` (50) thì **drop** event nhưng vẫn `socket.emit` một `room:error` cho **mỗi** event bị drop. Không đếm vi phạm, không disconnect.
- **Hậu quả:** kẻ tấn công gửi rác tốn ít băng thông hơn server trả lời. Càng flood server càng tốn.
- **Bằng chứng: ĐÃ ĐO.**

```
sent 2000 events in 4.0s (~72000B out)
server sent BACK: 2000 packets / 178800B  (room:error count=1950)
amplification (bytes back / bytes sent): 2.48x
socket still connected after flood? true
```

- **Sửa:** im lặng khi drop (hoặc chỉ báo 1 lần/giây), đếm vi phạm và disconnect khi tái phạm.

### 3.4 Trung bình - không có một security header nào

- **Ở đâu:** `server/index.js` (không có `helmet`, không `setHeader`)
- **Hậu quả:** `login.html` nhúng iframe được (clickjacking); không có CSP làm lưới an toàn dự phòng. Kèm `X-Powered-By: Express` lộ stack.
- **Bằng chứng: ĐÃ ĐO** - `curl` vào server đang chạy, thiếu cả 5: `content-security-policy`, `x-frame-options`, `x-content-type-options`, `strict-transport-security`, `referrer-policy`.
- **Sửa:** `npm i helmet` + `app.use(helmet())`.

### 3.5 Thấp - `sanitize()` của chat lọt thẻ không đóng (hiện KHÔNG khai thác được)

- **Ở đâu:** `server/managers/ChatHandler.js:74` → `str.replace(/<[^>]*>/g, '')`
- **Vì sao:** regex đòi dấu `>` đóng. Chuỗi `<img src=x onerror=alert(1)` (thiếu `>`) đi lọt nguyên vẹn.
- **Hậu quả:** **không có XSS hôm nay.** Đã truy hết đường render: consumer duy nhất của `chat:message` là `client/js/room-socket.js:102` → `ChatUI.appendChatMessage`, dùng `textContent` (`chat-ui.js:32,43,49,78,82`). `displayName` cũng được escape ở mọi nơi hiển thị. Đây là rủi ro phòng thủ chiều sâu, **không phải lỗ hổng đang mở**.
- **Bằng chứng: ĐÃ ĐO cả hai vế** - probe cho thấy chuỗi thiếu `>` được broadcast nguyên vẹn (`<img src=x onerror=alert(1)`), và đọc code xác nhận nơi render dùng `textContent`.
- **Sửa:** escape thực thể (`&lt;`, `&gt;`) thay vì strip bằng regex.

### 3.6 Thấp - `/api/auth/login` lộ username tồn tại hay không qua thời gian phản hồi

- **Ở đâu:** `server/routes/auth.js:135-143` - return sớm khi `!user`, không chạy `bcrypt.compare`
- **Bằng chứng: CHƯA ĐO ĐƯỢC** (bcrypt không load được trên máy đánh giá). Cơ chế rõ từ code nhưng **không có số đo** - coi là **GIẢ THUYẾT, CHƯA kiểm chứng**.
- **Sửa:** luôn `compare` với một hash dummy cố định khi không tìm thấy user.

### 3.7 Thấp - `escapeAttr` sai nguyên tắc (hiện không khai thác được)

- **Ở đâu:** `client/js/lobby.js:474-476`, `client/js/room-ui.js:62-64`
- **Vì sao:** `str.replace(/'/g, "\\'").replace(/"/g, '\\"')`. Trong ngữ cảnh thuộc tính HTML, dấu `\"` không được trình duyệt hiểu là escape - `"` vẫn đóng thuộc tính sớm.
- **Hậu quả:** hiện an toàn vì chỉ nhận `roomId` (`#XYZ`, bảng chữ cái cố định) và `userId` (UUID / `guest_`+hex) - đều do server sinh, không chứa `"` hay `'`. Rủi ro nếu sau này ai đó tái dùng cho `roomName`/`displayName`.

### 3.8 Đã kiểm và KHÔNG phải lỗi

- **SQL injection: không có.** Mọi truy vấn trong `database.js` dùng placeholder `?`. `admin.js` có nội suy `${table}` (dòng 260-261) nhưng chặn bằng whitelist `VALID_TABLES` ở dòng 256, và không route/socket nào require nó (CLI-only).
- **Server không tin client - 15/16 đòn bị chặn:**

```
=== B. In-game authority ===
  [BLOCKED ] non-host changes room settings :: boardSize now 17
  [BLOCKED ] non-host kicks the host :: host present = true
  [BLOCKED ] spectator places a stone :: no move broadcast
  [BLOCKED ] player moves out of turn :: no move broadcast
  [BLOCKED ] payload-injected userId/color overrides server :: server assigned color=BLACK
  [BLOCKED ] out-of-bounds coordinates
  [BLOCKED ] string coords are parsed, still turn-checked :: accepted as WHITE at 4,4
  [BLOCKED ] spectator resigns on behalf of a player :: game continues
  [BLOCKED ] spectator force-accepts a draw
  [BLOCKED ] player self-approves own bonus-time request
```

- **Xác thực socket** chạy ở `io.use` trước sự kiện `connection` - không event nào lọt trước khi verify xong.
- **Không có cơ chế phòng mật khẩu** trong codebase - câu hỏi không áp dụng.

---

## 4. Tối ưu broadcast

### 4.1 Cao - `lobby:update` gửi lại toàn bộ danh sách phòng, từ 15 điểm gọi, không debounce

- **Ở đâu:** `server/socket/state.js:54-56`. 15 điểm gọi: `DisconnectHandler.js:63,82,153`; `GameHandler.js:577,612,687`; `LobbyHandler.js:56,88`; `RoomHandler.js:84,96,109,120,134,184`; `state.js:154`
- **Vì sao:** `listRooms()` trả full array. Bất kỳ ai sit/stand/ready/settings/kick/join/leave/bắt đầu/kết thúc ở **bất kỳ phòng nào** → mọi người trong lobby nhận lại cả 10 phòng.
- **Hậu quả:** người ngồi lobby không làm gì vẫn liên tục nhận vài KB mỗi lần bất kỳ phòng nào nhúc nhích. Trên 4G/mobile là hao pin và data vô ích.
- **Bằng chứng: ĐÃ ĐO.**

```
== lobby:update size with 10 rooms live ==
  last payload JSON size: 2670B for 10 rooms   (~267B per room entry)

== lobby:update churn caused by ONE room's normal activity ==
  ONE seat+ready+start+resign cycle in ONE room pushed
  4 lobby:update packets / 10759B to an idle lobby user who did nothing.
```

- **Sửa:** debounce 200-500ms là thắng nhanh nhất (không phải đụng client). Xa hơn là gửi delta 1 phòng + `roomId`.

### 4.2 Cao - `room:updated` là full-state và scale bậc hai theo số người trong phòng

- **Ở đâu:** `server/managers/RoomManager.js:539-564` (`serializeRoom`), 17 điểm emit
- **Vì sao:** mỗi `room:updated` nhét toàn bộ `users[]` + `settings` + `scoreTable`, rồi gửi cho **tất cả** thành viên phòng. Payload tăng tuyến tính theo số người, số bản gửi cũng tăng tuyến tính → tổng byte tăng **bậc hai**.
- **Hậu quả:** trong phòng đông khán giả, một người bấm "ngồi" làm cả phòng nhận lại danh sách đầy đủ. `MAX_USERS_PER_ROOM = 20` (`config.js:10`).
- **Bằng chứng: ĐÃ ĐO** - chi phí của **một** hành động `room:sit`:

| Số người | 1 payload | Số bản gửi | Tổng byte trên dây |
|---:|---:|---:|---:|
| 2 | 548 B | 2 | 1 096 B |
| 4 | 766 B | 4 | 3 064 B |
| 8 | 1 201 B | 8 | 9 608 B |
| 12 | 1 637 B | 12 | 19 644 B |
| 16 | 2 073 B | 16 | **33 168 B** |

Cấu trúc payload ở 16 người: `users[]` 1742 B (109 B/người), `settings` **163 B - không bao giờ đổi giữa các event**, `scoreTable` 2 B.

> Mốc 20 người (~2510 B × 20 ≈ 50 KB) là **ngoại suy, chưa đo** - rate limiter chặn không mint được quá 20 token guest trong 15 phút.

- **Sửa:** bỏ `settings` ra khỏi `room:updated` (chỉ gửi khi thực sự đổi) là thắng nhanh nhất. Xa hơn là delta "user X đổi slot".

### 4.3 Trung bình - `timer:tick` chiếm phần lớn băng thông trong ván

- **Ở đâu:** `server/managers/TimerManager.js:64-66` (`setInterval` 1000ms) + `server/socket/handlers/GameHandler.js:441`
- **Vì sao:** tick mỗi giây cho cả phòng suốt ván, không phụ thuộc có nước đi hay không. Client hoàn toàn tự đếm ngược được nếu server gửi `deadline`.
- **Bằng chứng: ĐÃ ĐO hai đơn giá** - `timer:tick` = **40 B/giây/client** (10 giây nhàn rỗi → đúng 10 gói / 400 B); `game:moved` = **121 B/nước**.
- **Tính toán (không phải số đo trực tiếp):** với nhịp 8 nước/phút, tick chiếm **~71%** băng thông trong ván, tức gấp ~2.4 lần toàn bộ nước đi cộng lại. Tỉ lệ này phụ thuộc nhịp chơi giả định.
- **Sửa:** gửi `{deadline}` 1 lần/lượt thay vì tick/giây. Giảm ~99% phần này.

### 4.4 Không phải lỗi - đừng sửa nhầm

- **`game:moved` đã là delta tối ưu: 121 B/nước.** Payload: `{x, y, color, nextTurn, moveCount, timer}` - **không có `board`**. Đây đã ngang mức tối ưu của một dự án cùng bài toán (113 B/nước sau khi tối ưu). Lưu ý số thật trong production sẽ nhỉnh hơn chút vì `userId` của tài khoản đăng ký là UUID 36 ký tự, dài hơn `guest_xxxxxxxx` dùng khi đo.
- **Phạm vi room dùng đúng.** `io.emit` toàn server chỉ **1 chỗ duy nhất**: `index.js:102` cho `server:shutdown` - hợp lý. Đo chéo xác nhận người ở lobby và người ở phòng khác nhận **0 byte** từ hoạt động của phòng A.
- **`game:init` 1136-1171 B full state là đúng** - đó là lần đồng bộ đầu, không có state cũ để delta.

---

## 5. Reconnect / disconnect

### 5.1 Cao - restart server: client tự kết nối lại rồi treo với bàn cờ chết, không một lời báo

- **Ở đâu:** `server/socket/SocketHandler.js:113-125` - chỉ emit `room:joined` trong nhánh `if (existingRoom)`, không có nhánh `else`
- **Vì sao:** toàn bộ state phòng ở RAM (`RoomManager.js:6-7`). Restart → Map rỗng → `getRoomByUser` trả `null` → không đường nào báo cho client.
- **Hậu quả:** người chơi thấy bàn cờ cũ đứng yên, bấm nước nào cũng báo `Không có ván đấu đang diễn ra.` Không toast, không redirect. Phải tự đoán mà F5.
- **Bằng chứng: ĐÃ ĐO.**

```
killing the server (SIGKILL)...
  client got server:shutdown notice? false
restarting the server...
  client auto-reconnected? true
  events received after reconnect: (NONE)
  player tries to move: ERROR -> "Không có ván đấu đang diễn ra."
```

- **Sửa:** thêm nhánh `else` emit `room:destroyed`/`room:left` để client tự thoát về lobby.

### 5.2 Cao - người mất kết nối bị xử THUA DO HẾT GIỜ trong khi vẫn còn 45s grace của chính mình

- **Ở đâu:** `server/socket/handlers/DisconnectHandler.js:179-183` (`cancelDisconnectGrace`)
- **Vì sao:** `disconnectTimers` theo `userId` (`state.js:22-23`), độc lập từng người. Khi cả hai rớt, mỗi người một timer 60s. Người quay lại **trước** làm `room.state = 'playing'` và `timer.start()` lại - **không kiểm tra người kia còn đang trong grace hay không**. Đồng hồ chạy tiếp trên lượt của người vắng mặt.
- **Hậu quả:** đáng lẽ "huỷ ván, không tính điểm", người vắng mặt nhận **thua thật** vào `scoreTable` và ghi DB.
- **Bằng chứng: ĐÃ ĐO** (cấu hình `per_move` 15s để rút ngắn):

```
both players drop...
  game:interrupted seen by in-room observer: 2
one of them reconnects (the one whose turn it is NOT):
  game:resumed fired: 1  -> clock restarted while the other player is STILL absent
  t+15s ended=true
--- outcome ---
  game:ended after ~15s -> {"winner":"guest_99e3f23d","reason":"timeout"}
  scoreTable entry for the absent player: {"name":"SoftBear","win":0,"loss":1,"draw":0}
  => CONFIRMED: absent player lost ON TIME (scored), not a no-score disconnect cancellation.
     Their own 60s grace window had 45s left when this happened.
```

- **Sửa:** `cancelDisconnectGrace` kiểm tra còn `userId` nào của phòng trong `disconnectTimers` không; còn thì giữ `'interrupted'`, chưa `timer.start()`.

### 5.3 Trung bình - kick người đang trong grace tạo "ván ma"

- **Ở đâu:** `server/managers/RoomManager.js:391` (chỉ chặn `state === 'playing'`) đối chiếu `server/socket/handlers/DisconnectHandler.js:112` (grace đặt `state = 'interrupted'`)
- **Vì sao:** trong grace, state là `'interrupted'` nên `kickUser` cho qua. Người bị kick bị xoá khỏi `room.users` + `userRoomMap`, **nhưng vẫn còn** trong `disconnectTimers` và trong `gameState.players`. Họ reconnect → `cancelDisconnectGrace` không kiểm tra tư cách thành viên, vẫn cho join lại room socket.io, start timer, gửi `game:init`.
- **Hậu quả:** nạn nhân thấy bàn cờ đầy đủ nhưng mọi nước đi bị từ chối. Chủ phòng được cộng một trận **thắng do hết giờ** trước người đã bị đuổi.
- **Bằng chứng: ĐÃ ĐO.**

```
victim dropped. room state = "interrupted" (grace running, game NOT over)
host kicked a mid-game player during grace: ACCEPTED (player removed from room)
victim reconnects inside grace:
  server sent game:init? true
  room state now : "playing"    room userCount : 1
  victim tries to move : ERROR -> "Không có ván đấu đang diễn ra."
  host tries to move   : move accepted
```

- **Không phải phòng ma vĩnh viễn.** Đo tiếp xác nhận đồng hồ kết thúc ván sau đúng 1 chu kỳ (15s ở cấu hình test, 60s ở mặc định `per_move`).
- **Sửa:** chặn kick khi `state === 'interrupted'`; và `cancelDisconnectGrace` kiểm tra `room.users.has(userId)` trước khi phục hồi.

### 5.4 Trung bình - `handleGameEnd` vẫn ghi DB dù gọi với `{noScore: true}`

- **Ở đâu:** `server/socket/handlers/GameHandler.js:636` đối chiếu `:653`
- **Vì sao:** khối cộng điểm ở dòng 636 có `&& !noScore`. Khối persist ở dòng 653 chỉ check `if (engine && engine.result)` - **không có `!noScore`**.
- **Hậu quả:** mỗi lần rớt mạng giữa ván tạo một hàng vĩnh viễn trong bảng `games` kèm toàn bộ `moveHistory` JSON, dù không tính điểm cho ai. Bảng phình theo số lần rớt mạng, không chỉ theo số ván thật.
- **Bằng chứng: ĐÃ ĐO** (đọc code, đối chiếu trực tiếp hai dòng; và quan sát `saveGame` thực sự được gọi với `{winner:null, reason:"disconnect"}`). `server/db/backups/admin.log` cho thấy đã phải purge 619 rồi 57 hàng `games` trong ngày 2026-08-01 - **phù hợp với triệu chứng, nhưng không chứng minh nhân quả**.
- **Sửa:** bọc khối persist trong `if (!noScore)`, hoặc đổi tên biến nếu ghi lại là chủ ý.

### 5.5 Thấp - chu kỳ quét phòng rảnh cố định 60s

- **Ở đâu:** `server/managers/RoomManager.js:49-52`
- **Hậu quả:** `IDLE_TIMEOUT_MS` (10 phút) thực tế có sai số tới +60s. Cũng là "magic number" nằm ngoài `config.js` dù file đó tự ghi chú "Never use magic numbers elsewhere".

### 5.6 Không phải lỗi - đã đo, khỏi lo

- **Hai tab cùng tài khoản: xử lý đúng.** Tab cũ nhận `session:kicked`, socket đóng thật, tab mới **giữ nguyên ghế** `slot=1`, và tab cũ **không còn nhận một byte broadcast nào**:

```
  tab1 received session:kicked : true "Tài khoản của bạn vừa đăng nhập ở một thiết bị khác."
  tab1 socket actually closed  : true
  tab2 seat preserved         : slot=1
  evicted tab1 still receiving room traffic: NO
```

  Codebase có **8 "sổ"** theo dõi hiện diện (`sessions`, `userRoomMap`, `room.users`, `room.joinOrder`, socket.io adapter rooms, `disconnectTimers`, `readyTimers`, `timerMap`). Luật một-kết-nối chỉ code vào sổ `sessions`, **nhưng** `staleSocket.disconnect(true)` tự dọn luôn socket.io room membership - nên không để lại socket ma. Đã đo, không rò.

- **Điều kiện đóng phòng đúng chuẩn.** `leaveRoom` destroy khi `room.users.size === 0`, **không** có điều kiện phụ theo state (`RoomManager.js:199`). Đo: cả hai người biến mất giữa ván → phòng bị xoá sau grace (t+66s). Ngắt cứng WebSocket người cuối → dọn ngay lập tức.
- **Không rò timer.** `_idleCleanup` bỏ qua phòng `playing`/`interrupted`, nhưng nơi duy nhất đặt `state='idle'` (`GameHandler.js:681`) đã gọi `cleanupRoomTimer` ở dòng 633 trước đó. Còn thêm lưới quét timer mồ côi mỗi 60s (`SocketHandler.js:165-172`).
- **Heartbeat phía server đã có sẵn.** Dự án không cấu hình gì nên chạy default của socket.io: `pingInterval 25s + pingTimeout 20s` = **tối đa 45s** để phát hiện peer biến mất (đọc trực tiếp từ `io.engine.opts`). Không cần tự xây.
- **Không có chuyện xoá nhiều bảng sai thứ tự khoá ngoại trong luồng reconnect.** Phòng chỉ tồn tại trong RAM. `admin.js` xoá `player_games` trước, `games` sau - đúng chiều FK.

### 5.7 CHƯA ĐO ĐƯỢC - nói thẳng

**Half-open socket thật** (điện thoại mất sóng, không có gói FIN). Mọi cách ngắt trên localhost đều tới server ngay lập tức, nên probe sẽ "pass" trong khi chứng minh sai điều cần chứng minh. Đã thử chặn PONG ở tầng engine.io để giả lập nhưng API client không cho patch sạch, và **không đưa ra kết luận nào từ probe không assert được đúng trạng thái**. Muốn đo thật cần 2 máy + `iptables DROP`.

Hệ quả logic (45s mù + 60s grace = tới 105s đối thủ chỉ thấy "đang chờ") là **suy luận từ config, chưa kiểm chứng**.

---

## 6. Ngoài phạm vi ba mảng

### 6.1 Ván có guest tham gia ĐANG KHÔNG ĐƯỢC LƯU - bắt đầu từ migration hôm nay

Cái này nằm ngoài ba mảng nhưng nặng, nên ghi đầy đủ.

- **Ở đâu:** `server/socket/handlers/GameHandler.js:658-663`
- **Vì sao:** dòng 662 hardcode `isGuest: false` cho **mọi** người chơi. Guard `p.isGuest` trong `saveGame` (`database.js:135-136,153`) vì thế không bao giờ kích hoạt, và `guest_xxxxxxxx` bị ghi thẳng vào `black_player_id`. Migration `002_rebuild_player_games_and_games_fk.sql` (chạy 2026-08-01) **vừa thêm** `REFERENCES users(id)` → vi phạm khoá ngoại → rollback cả transaction → `GameHandler.js:677` nuốt lỗi thành một dòng `logger.warn`.
- **Hậu quả:** ván của **cả người đã đăng ký** trong ván đó cũng mất theo. Chính migration làm cứng DB đã biến một đường ghi bẩn-nhưng-chạy thành đường ghi hỏng-âm-thầm.
- **Bằng chứng: ĐÃ ĐO**, trên DB tạm dựng từ `schema.sql` thật, có **control hai chiều**:

```
== A. two REGISTERED players ==
  registered vs registered: SAVED ok
== B. one guest, one registered (guest plays BLACK) ==
  guest vs registered: THREW -> FOREIGN KEY constraint failed
== C. two guests ==
  guest vs guest: THREW -> FOREIGN KEY constraint failed

Rows actually persisted in games: [ chỉ có "game-registered-1" ]

== CONTROL: foreign_keys = OFF (hành vi trước migration 002) ==
  guest vs guest, FK off: SAVED ok
```

- **Sửa:** 1 dòng - truyền `isGuest` thật (thông tin đã có sẵn trong `room.users`, chỉ chưa được luồn vào `engine.players`).

### 6.2 `npm test` đang đỏ trên `main`

`server/tests/DisconnectHandler.test.js` mock `../socket/state` (dòng 35-41) thiếu `syncReadyWindow`, trong khi `DisconnectHandler.js:67` gọi nó. Kết quả: **1 failed / 127 passed / 1 todo**.

```
TypeError: syncReadyWindow is not a function
  at Object.syncReadyWindow [as handleDisconnect] (server/socket/handlers/DisconnectHandler.js:67:5)
```

Sửa: thêm `syncReadyWindow: jest.fn()` vào mock. 1 dòng.

### 6.3 Mutation test - phần này đáng quan tâm nhất trong mục "ngoài phạm vi"

Test xanh không chứng minh gì cho tới khi nó fail được. Tôi gỡ ba đoạn logic trên **bản copy** rồi chạy lại toàn bộ suite:

| Gỡ gì | Kết quả |
|---|---|
| Guard socket trùng trong `DisconnectHandler` (dòng 43-47) | **2 test đỏ** - test này thật |
| Tắt hẳn `if (room.users.size === 0)` (luật đóng phòng) | **Không test nào đỏ** |
| Bỏ check `room.host !== hostId` trong `kickUser` (leo thang quyền) | **Không test nào đỏ** |

Baseline là `1 failed / 127 passed`; hai mutation sau cho ra **đúng con số đó**, tức là chúng sống sót.

**Hai bất biến quan trọng nhất - luật đóng phòng và kiểm tra quyền chủ phòng - hiện không có test nào bảo vệ.**

### 6.4 Các mục nhỏ khác

- `npm install` fail trên Node 24 (native module thiếu Python/toolchain) - CI hoặc máy dev mới sẽ vấp.
- `?v=22` đồng nhất cả 44 chỗ - luật bump version trong `CLAUDE.md` **đang được tuân thủ đúng**.
- `GET /api/games/:id` dùng `SELECT *` nên trả cả `black_player_id`/`white_player_id` (UUID nội bộ) ra public.
- `GET /api/games` không có rate limit (chỉ `/api/auth/*` có).

---

## 7. Đã kiểm chứng vs chưa - không làm tròn

### ĐÃ ĐO (chạy trên server thật, có script chạy lại được)

Forge JWT bằng secret mặc định · 16 đòn tấn công quyền · 10/10 phòng bị chiếm · khuếch đại flood 2.48x · thiếu 5 security header · chat lọt thẻ không đóng + đường render dùng `textContent` · `game:moved` 121 B · `timer:tick` 40 B/s · `lobby:update` 2670 B @10 phòng và 10 759 B/chu-kỳ-phòng · `room:updated` scale 548→2073 B và 1096→33 168 B · cách ly giữa các phòng · hai tab cùng tài khoản · giữ ghế qua grace · phòng bị xoá khi rỗng · thua oan do hết giờ trong grace · ván ma sau kick + tự lành sau 1 chu kỳ đồng hồ · restart server treo client · guest game không lưu (control FK on/off) · mutation test 3 lượt · `?v=` đồng nhất · `pingInterval`/`pingTimeout` mặc định.

Cộng thêm (xác minh **sự vắng mặt**, bằng `find` + `grep` toàn repo): không có bất kỳ cấu hình TLS/reverse-proxy nào, không có `trust proxy`, không có security header nào.

### CHƯA ĐO ĐƯỢC (nói thẳng, không đoán)

Half-open socket thật · timing attack trên login (bcrypt không load được) · `room:updated` ở đúng 20 người (bị rate limiter chặn) · số byte của `lobby:online_users` · hành vi khi bật `permessage-deflate`.

**Quan trọng: cách triển khai thật.** Toàn bộ đánh giá này làm trên **mã nguồn trong repo**, không phải trên máy chủ đang chạy. Tôi **không biết** dự án thực sự được deploy thế nào - có proxy TLS đặt ngoài repo hay không, `NODE_ENV` có được set không, `JWT_SECRET` có được cấp qua biến môi trường không. Ba mục 3.0, 3.1 và phần `trust proxy` đều **phụ thuộc câu trả lời đó**. Hỏi trước khi kết luận là đang thủng hay không.

### GIẢ THUYẾT - CHƯA kiểm chứng

- Tỉ lệ 71% của `timer:tick` (tính từ 2 đơn giá đã đo + giả định 8 nước/phút).
- Chuỗi 45s + 60s = 105s cho half-open.
- `admin.log` purge 619+57 hàng là **phù hợp** với lỗi `noScore` chứ **không chứng minh** nhân quả.
- Mốc `room:updated` ~50 KB ở 20 người (ngoại suy từ 16 người).

### Chưa đụng tới

`GameEngine` (luật thắng, wall/portal, Swap2) · i18n · UI · `history.js` · `move-tree.js` · `admin.js` ngoài phần an toàn SQL.

---

## 8. Phụ lục - môi trường đo, cách chạy lại, và những cái bẫy

> Mục này viết cho **lần sau** - của bạn, của tôi, hoặc của bất kỳ ai muốn kiểm chứng lại số liệu ở trên. Ghi ra để không phải mò lại từ đầu.

### 8.1 Cái bẫy lớn nhất: `npm install` KHÔNG chạy được trên máy này

Đây là thứ tốn thời gian nhất trong cả lần đánh giá. Ghi lại cho rõ.

`npm install` **thất bại**. Hai native module đều không build được: máy không có Python / MSVC toolchain (môi trường msys64), và Node v24.18.0 chưa có prebuilt binary cho cả hai:

```
gyp ERR! find Python  Could not find any Python installation to use
Error: Could not locate the bindings file ... better_sqlite3.node
```

**Đây là vấn đề môi trường, không phải lỗi của dự án** - `package.json` khai báo `node >=18` là hợp lệ.

Mọi dependency **thuần JS** cài bình thường: `socket.io`, `socket.io-client`, `express`, `jsonwebtoken`, `uuid`, `express-rate-limit`, `jest`.

**Hệ quả nếu không biết cách vòng qua:** cả ba subagent phụ đều kết luận "không boot được server thật" rồi tự viết harness mô phỏng. Kết quả là bằng chứng yếu hơn hẳn, và vài con số bị lệch (xem 8.4).

### 8.2 Cách vòng qua - vẫn boot được server THẬT

Không cần bỏ cuộc. Copy `server/` + `client/` sang thư mục tạm, rồi đặt **đúng hai** shim vào `<sandbox>/node_modules/`:

| Module | Thay bằng | Lưu ý |
|---|---|---|
| `better-sqlite3` | `node:sqlite` (built-in của Node 24, class `DatabaseSync`) | **Cùng engine SQLite**, nên ngữ nghĩa SQL / `PRAGMA` / khoá ngoại giữ nguyên. Phải tự viết `.pragma()` (→ `PRAGMA <str>`) và `.transaction(fn)` (→ `BEGIN`/`COMMIT`/`ROLLBACK`) vì `node:sqlite` không có |
| `bcrypt` | stub `hash`/`compare` | Không bao giờ được gọi nếu probe đăng nhập qua `POST /api/auth/guest` - đường này không chạm bcrypt |

Chạy với:

```bash
NODE_PATH="<project>/node_modules" PORT=3999 node server/index.js
```

`NODE_PATH` để sandbox lấy các gói thuần JS từ `node_modules` thật, còn `node_modules` riêng của sandbox thắng cho hai shim.

Kết quả: **toàn bộ `server/socket/`, `server/managers/`, `server/routes/`, `server/middleware/` chạy nguyên bản, không sửa một dòng.** Đây là lý do các số ở trên đáng tin.

### 8.3 Cách đo byte và cách viết probe cho đúng

- **Byte lấy ở tầng engine.io**, không phải `JSON.stringify` của payload:
  ```js
  socket.io.engine.on('packet', p => {
    if (p.type !== 'message') return;
    bytes += Buffer.byteLength(p.data, 'utf8') + 1;  // +1 cho ký tự loại packet
  });
  ```
  Chưa tính header khung WebSocket (2-6 byte/khung).

- **Mọi probe phải `assert` đang ở đúng trạng thái cần đo, TRƯỚC khi ghi số.** Ví dụ đã dùng: assert server khởi động với **0 phòng** trước khi test chiếm phòng; assert `status === 'ongoing'` và đúng 2 người chơi trước khi đo nước đi; assert đúng lượt của ai trước khi đo race đồng hồ. Không assert được thì ghi CHƯA ĐO ĐƯỢC, đừng ghi số.

- **Số suýt sai vì thiếu assert:** lần chạy đầu của probe chiếm phòng cho ra "9 phòng" trong khi lobby báo 10 - do server cũ chưa chết hẳn nên còn phòng thừa. Chạy lại từ server sạch mới ra con số đúng: **10 tạo được, 10 tổng**. Bài học: hai con số phải tự khớp với nhau, nếu lệch là trạng thái sai.

- **Rate limiter sẽ chặn probe của chính bạn.** `authLimiter` cho 20 request/15 phút/IP áp cho cả `/api/auth/guest`. Muốn hơn 20 client thì phải restart server (limiter lưu trong RAM). Đây là lý do mốc `room:updated` ở 20 người không đo được, chỉ đo tới 16.

### 8.4 Chỗ các số bị lệch giữa các nguồn - dùng số nào

Ba agent phụ chạy harness mô phỏng, tôi chạy server thật. Khi lệch, **lấy số từ server thật**:

| Đại lượng | Harness mô phỏng | Server thật (dùng số này) |
|---|---|---|
| `lobby:update` @ 10 phòng | ~3.1-3.3 KB (ngoại suy từ 1 phòng) | **2 670 B** (đo trực tiếp) |
| `room:updated` @ 20 người | ~1.5-2 KB (ngoại suy) | **2 073 B @ 16 người** - tức mốc 20 người **cao hơn** ngoại suy |
| Số điểm gọi `broadcastLobbyUpdate` | 16 | **15** trong mã production (cái thứ 16 nằm trong file test) |

### 8.5 Những gì KHÔNG đo được trên setup này - và vì sao

- **Timing attack trên login**: bcrypt không load được. Muốn đo phải có máy build được native module.
- **Half-open socket thật** (điện thoại mất sóng, không có gói FIN): mọi cách ngắt trên localhost đều tới server **ngay lập tức**, kể cả `ws.terminate()`. Probe sẽ "pass" trong khi chứng minh sai điều cần chứng minh. Muốn đo thật cần **2 máy + `iptables DROP`**. Đã thử chặn gói PONG ở tầng engine.io để giả lập nhưng API client không cho patch sạch - và **không đưa ra kết luận nào từ probe không assert được trạng thái**.
- **`room:updated` ở đúng 20 người**: bị rate limiter chặn (xem 8.3).
- **`permessage-deflate`**: dự án không cấu hình, giả định tắt theo mặc định engine.io, chưa xác minh runtime.

### 8.6 Cách mutation test (mục 6.3) được làm

Test xanh không chứng minh gì cho tới khi nó **fail được**. Cách làm: copy toàn bộ `server/` sang thư mục tạm, gỡ **một** đoạn logic trong bản copy, chạy lại toàn bộ suite, so với baseline.

Baseline phải ghi lại trước: **`1 failed / 127 passed / 1 todo`**. Mutation nào cho ra **đúng con số đó** là mutation **sống sót** - tức không có test nào bảo vệ đoạn logic vừa gỡ.

**Không bao giờ sửa file gốc để làm việc này.**

### 8.7 Trạng thái máy sau khi đánh giá (đã dọn 2026-08-01)

- Repo `gomoku-vn`: **`git status` sạch tuyệt đối**. `package-lock.json` từng bị `npm install` thêm 1 dòng metadata (`"license": "MIT"` cho entry `bcrypt`) - **đã revert**. Không đụng vào một dòng mã nguồn nào.
- `server/db/gomoku.db` **không tồn tại trước và không được tạo ra sau**. Mọi probe chạy trên DB riêng trong thư mục tạm.
- `gomoku-vn/node_modules/` **đã xoá** (92.2 MB) - trả về đúng trạng thái ban đầu. Muốn chạy lại probe thì phải `npm install` trước, và sẽ gặp lại lỗi ở 8.1.
- **Không cài gì ở mức toàn máy** - `npm ls -g` chỉ có `npm` và `corepack` sẵn có.
- Các bản copy mã nguồn trong thư mục tạm **đã xoá**.

---

*Mọi số liệu trong tài liệu này đến từ việc chạy thật server và đo, trừ những chỗ đã ghi rõ là CHƯA ĐO ĐƯỢC hoặc GIẢ THUYẾT.*
-----------------------------------------------------------------------------------------------------------------------------
# Second Report
Kiểm chứng bản sửa (commit `3da53dd`, đo ngày 2026-08-01)

Đã checkout `5026c3e` và **đo lại đúng các probe đã tìm ra lỗi**, không chỉ đọc diff.

### Đã đạt - 8 mục

| Fix | Trước | Sau (đo lại) |
|---|---|---|
| **#1 JWT secret** | Token ký bằng secret mặc định → `CONNECTED` | Server **throw, không khởi động**. `NODE_ENV=test` vẫn cho qua (đúng ý đồ, Jest cần) |
| **#2 Ván guest** | `FOREIGN KEY constraint failed`, mất cả ván của người đăng ký | Ván guest-vs-guest thật, chạy hết trên server thật → `[DB] Game ... saved.`; đọc thẳng DB: hàng có thật, `black/white_player_id` = NULL đúng thiết kế |
| **#3 `!noScore`** | Ván huỷ do mất kết nối vẫn ghi DB | Guard đã có tại `GameHandler.js:653` |
| **#4 Đua đồng hồ** | Người vắng mặt **thua do hết giờ (`loss:1`)** khi còn 45s grace | `game:resumed` = **0**, không `game:ended` sau 24s. Log: *"another player is still in grace - not resuming yet"* |
| **#6 Kick trong grace** | `ACCEPTED` → ván ma | `REFUSED` |
| **#7 Flood** | 178 800 B trả về, **2.48x**, 1 950 cảnh báo, không ngắt | **3 390 B**, **0.05x**, **1 cảnh báo**; flood liên tục → **ngắt đúng giây thứ 5** |
| **#8 Helmet** | 0 header | 6 header, `X-Powered-By` biến mất. CSP tắt có chủ ý, đã ghi lý do |
| **#9 Test** | 1 đỏ / 127 | **145/145 xanh** |

### Chưa đạt mục tiêu - #12 debounce lobby

Debounce chạy đúng, nhưng **cửa sổ 300ms không khớp kịch bản đã dùng để biện minh cho nó**. Cùng 4 hành động phòng, chỉ khác nhịp:

| Nhịp giữa các hành động | Số gói `lobby:update` |
|---|---|
| Cùng tick (0ms) | **1** |
| 150ms | 2 |
| **1 200ms - nhịp người thật** | **4** |

Con số ở mục 4.1 - *"chu kỳ sit+ready+start+resign đẩy 4 gói / 10 759 B"* - đo lại **y nguyên**. Người chơi ngồi rồi bấm Bắt đầu cách nhau vài giây, mỗi hành động rơi vào một cửa sổ riêng.

Nó **có** ăn ở chỗ khác: tạo 10 phòng dồn dập, 11 gói → 4 gói. Nhưng phần tốn thật là **payload** (2 670 B danh sách đầy đủ, gửi lại cho một thay đổi ở một phòng) - đúng nửa delta đã chủ động hoãn.

**Gợi ý:** nâng cửa sổ lên 1-2 giây sẽ gộp được nhịp người thật; hoặc làm nốt nửa delta, khi đó cửa sổ bao nhiêu cũng không còn quan trọng.

### Phát hiện mới - không bản sửa nào có test bảo vệ

Gỡ từng bản sửa ra khỏi một **bản copy**, chạy lại toàn bộ suite:

```
BASELINE (code đã sửa)                    Tests: 145 passed, 145 total
gỡ fix#6 (chặn kick khi interrupted)      Tests: 145 passed, 145 total
gỡ fix#3 (!noScore chặn ghi DB)           Tests: 145 passed, 145 total
gỡ fix#2 (isGuest truyền thật)            Tests: 145 passed, 145 total
gỡ fix#4 (không resume khi kia còn grace) Tests: 145 passed, 145 total
gỡ fix#7 (flood: 1 warning/cửa sổ)        Tests: 145 passed, 145 total
gỡ fix#12 (debounce lobby)                Tests: 145 passed, 145 total
```

Sáu mutation, **không cái nào bị bắt**. `docs/fix-log.md` trung thực về điều này - ghi rõ *"wrote and ran (then discarded) a temporary Jest test"* cho hầu hết các fix.

Hệ quả: **mọi thứ vừa xác nhận đúng đều cách một lần refactor cẩu thả là quay lại, mà `npm test` vẫn xanh.**

Đây là việc đáng làm tiếp nhất, và rẻ nhất: **các test đó đã viết rồi - chỉ cần giữ lại thay vì xoá.**

### Ghi chú nhỏ - thứ tự trong `cancelDisconnectGrace`

`disconnectTimers.delete()` chạy ở dòng 174, **trước** khi kiểm tra membership ở dòng 181. Nếu nhánh đó từng chạy, grace timer đã bị huỷ và **không còn gì kết thúc ván** - phòng kẹt ở `interrupted`, mà `_idleCleanup` lại bỏ qua trạng thái này.

Hiện **không tới được** (kick đã bị chặn khi `interrupted`), nên là vấn đề thứ tự tiềm ẩn chứ không phải lỗi. Sửa: dời `delete` xuống sau các kiểm tra.

### Còn tồn - chưa động tới

**3.0 TLS** (nặng nhất) · `trust proxy` · **chiếm 10/10 phòng bằng token guest** (đo lại, vẫn nguyên) · `room:updated` bậc hai · `timer:tick` · 5.1 restart treo client · **3.8 vòng đời mật khẩu** (mục này thêm vào review sau khi bản sửa đã bắt đầu)
