# B159 — Chat riêng 1-1 ở Sảnh: hướng dẫn thực thi

Việc trong `docs/todo/B159-private-chat-1-1-sanh.md`. Đây là feature lớn 2 lớp (server + client) — làm
theo thứ tự dưới, đừng nhảy thẳng vào client.

## Nhánh & quy trình

- Feature → nhánh `feature/private-chat` off `dev` (theo `git-workflow` skill). Không branch off `main`.
- Một commit khi hoàn tất từng lớp là được; đừng gộp cả feature vào 1 commit khổng lồ.
- Đây là feature có `client/` surface ⇒ **không đánh dấu "đã xong" nếu chưa verify frontend bằng
  browser thật** (checklist "Feature completion" trong `CLAUDE.md`).

## Thứ tự thực thi

### 1. Đổi shape `getOnlineUsersList()` trước (nền cho mọi thứ)

`server/socket/state.js:67`:
```js
function getOnlineUsersList() {
  return Array.from(sessions.values())
    .map(s => ({ userId: s.user.userId, displayName: s.user.displayName, isGuest: !!s.user.isGuest }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
```
- `sessions` là `Map<userId, socket>` (xem `SocketHandler.js:219` `sessions.set(user.userId, socket)`).
  Value là **socket**, không phải session-object — `s.user` mới là `{userId, displayName, isGuest}`.
- Sửa `client/js/lobby.js` `renderOnlineLine()` (dòng ~200-226): `shown.map(u => ...)` đọc
  `u.displayName` thay cho `name`; so sánh `u.displayName === userInfo.displayName` cho phần in đậm.
- Viết `server/tests/state-online-users.test.js`: mock `sessions` (hoặc drive qua `SocketHandler`),
  assert 3 field + sort + `isGuest` phản ánh đúng. **Đừng** chỉ assert "không throw".
- Chạy `npm test` — `SocketHandler.test.js` / `LobbyHandler.test.js` phải vẫn xanh. Thêm `isGuest`
  vào `makeSocket` của `SocketHandler.test.js` nếu cần cho realistic (không bắt buộc để pass).

**Đừng** thêm delta / snapshot cho `lobby:online_users`. Nó cố tình full-state + debounce 1500ms
(lý do: đo traffic reconnect thực, fix #41 — cửa sổ 300ms không gộp được vì socket rejoin cách nhau
150-400ms). Giữ nguyên `broadcastOnlineUsers()`.

### 2. Backend handler

`server/socket/handlers/PrivateChatHandler.js` mới. Khung theo `server/socket/handlers/ChatHandler.js`
(cùng thư mục) + tái dùng `server/managers/ChatHandler.js`:
```js
const { sanitize } = require('../../managers/ChatHandler');
const profanityFilter = require('../../../client/js/profanity-filter');
```
- **Rate limit:** copy pattern sliding-window của `server/managers/ChatHandler.js:42-65`
  (`Map<userId, timestamp[]>`), nhưng hằng số **riêng**: thêm `PRIVATE_CHAT_RATE_LIMIT = 5` và
  `PRIVATE_CHAT_RATE_WINDOW_MS = 3000` vào `server/config.js`. Đừng đụng `CHAT_RATE_LIMIT`.
- **Validate thứ tự:** auth (`socket.user`, đã đảm bảo bởi middleware) → `toUserId` có mặt
  (`MISSING_RECIPIENT`) → `toUserId !== socket.user.userId` (`CANNOT_CHAT_SELF`) → guest-flag
  (`GUEST_CHAT_DISABLED` nếu `!config.PRIVATE_CHAT_ALLOW_GUESTS && (socket.user.isGuest ||
  recipientSocket.user.isGuest)`) → `sanitize(text)` non-empty, cắt 500 → `profanityFilter
  .filterMessage()` → rate-limit (`PRIVATE_CHAT_RATE_LIMITED`) → `sessions.has(toUserId)`
  (`RECIPIENT_OFFLINE`). Emit lỗi qua `socket.emit('private_message:error', { code })`.
- **Gửi:** `const messageId = crypto.randomUUID();` rồi
  ```js
  const payload = { messageId, fromUserId, fromUsername, text: filtered, timestamp: Date.now() };
  recipientSocket.emit('private_message:receive', payload);
  socket.emit('private_message:receive', payload); // echo cho người gửi, cùng messageId
  ```
- **`activePeers`:** `Map<userId, Set<userId>>` — khi A gửi B thành công, `activePeers.get(A).add(B)`
  và ngược lại. Khi cleanup (disconnect), với mỗi peer còn online:
  `peerSocket.emit('user:status', { userId: goneId, status: 'offline' })` +
  `peerSocket.emit('user:disconnected', { userId: goneId })`, rồi xoá goneId khỏi mọi Set + xoá
  entry của goneId. Cung cấp `cleanupUser(io, userId)` export để `SocketHandler` gọi.
- **STRICT:** không `io.to('lobby').emit(...)`, không `socket.broadcast`, không `io.emit`. Chỉ
  `recipientSocket.emit` / `socket.emit` / `peerSocket.emit` tới socket cụ thể.

Đăng ký ở `server/socket/SocketHandler.js`:
- Thêm `const PrivateChatHandler = require('./handlers/PrivateChatHandler');` cạnh các require handler
  (~dòng 33-39).
- `PrivateChatHandler.register(io, socket);` cạnh `ChatHandler.register(io, socket);` (~dòng 286).
- Trong `socket.on('disconnect', ...)` (~dòng 291-306), cạnh
  `chatManager.cleanupUser(user.userId);` thêm
  `require('./handlers/PrivateChatHandler').cleanupUser(io, user.userId);`.
  Lưu ý: khối disconnect này chỉ chạy khi `sessions.get(user.userId) === socket` (dòng 297) — đúng
  chỗ cần cleanup, sau grace của DisconnectHandler.

### 3. i18n

`client/js/i18n.js` — thêm vào **cả** `vi` (dòng ~19) và `en` (dòng ~622), giữ style key phẳng có
dấu chấm (`'private_chat.title': '...'`, KHÔNG object lồng — test
`error-codes-i18n-consistency.test.js` `eval` object literal và `Object.keys` phẳng).
Bảng chuỗi (spec + bổ sung):

| key | vi | en |
|---|---|---|
| `private_chat.title` | Trò chuyện riêng | Private Chat |
| `private_chat.ph_input` | Nhập tin nhắn... | Type a message... |
| `private_chat.btn_send` | Gửi | Send |
| `private_chat.user_disconnected` | Người dùng đã ngắt kết nối | User disconnected |
| `private_chat.user_offline` | Offline | Offline |
| `private_chat.user_online` | Online | Online |
| `private_chat.status_in_lobby` | Trực tuyến trên Sảnh | Online in Lobby |
| `private_chat.status_offline` | Hiện không online | Currently offline |
| `private_chat.notif_from` | Tin nhắn từ | Message from |
| `private_chat.modal_title` | Danh sách người dùng online | List of Online Users |
| `private_chat.modal_search_ph` | Tìm kiếm người dùng... | Search users... |
| `private_chat.btn_chat` | Chat | Chat |
| `private_chat.no_users_found` | Không tìm thấy người dùng nào. | No users found. |
| `private_chat.you` | (Bạn) | (You) |
| `private_chat.close` | Đóng cửa sổ chat | Close chat window |
| `private_chat.notif_enable` | 🔔 Bật thông báo | 🔔 Enable notifications |
| `private_chat.notif_enabled` | 🔔 Thông báo đang bật | 🔔 Notifications on |
| `private_chat.notif_blocked` | 🔔 Thông báo bị chặn | 🔔 Notifications blocked |

Error keys (client làm `t('err.' + code.toLowerCase())` — xem `lobby.js:238`):
`err.cannot_chat_self`, `err.recipient_offline`, `err.private_chat_rate_limited`,
`err.missing_recipient`, `err.guest_chat_disabled` — cả vi + en.

Thêm `'server/socket/handlers/PrivateChatHandler.js'` vào mảng `SERVER_FILES` trong
`server/tests/error-codes-i18n-consistency.test.js` (~dòng 32-48) — nếu không, các `code:` mới trong
file đó không được test kiểm.

### 4. Client — `private-chat.js` + audio + markup + CSS

- **Ô nhập = đúng cấu trúc chat phòng.** Trong mỗi `.pm-window`, dùng:
  ```html
  <div class="chat-input pm-input-row">
    <input type="text" class="pm-input" data-i18n-placeholder="room.ph_chat" maxlength="500" autocomplete="off" />
    <button type="button" class="pm-send-btn" data-i18n-title="private_chat.btn_send">
      <svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=N#ph-bold-paper-plane-tilt"></use></svg>
    </button>
  </div>
  ```
  Enter gửi (`keydown` `e.key === 'Enter'`), KHÔNG Shift+Enter/newline, KHÔNG textarea auto-grow.
  Luồng gửi mô phỏng `sendChatFrom()` ở `client/js/room.js:319-323`: trim → `window.ProfanityFilter
  .filterMessage()` optimistic → `client.emit('private_message:send', { toUserId, text })` → clear input.
- **`audio-manager.js`** `playMessageSound()` — đặt cạnh `playMoveSound()` (dòng ~96). Guard
  `if (this.isMuted) return; this._ensureActive(); if (!this.ctx) return;`. 2 oscillator sine hoặc 1
  oscillator với `frequency.setValueAtTime(659.25, now)` →
  `.exponentialRampToValueAtTime(880, now + 0.12)`; gain `setValueAtTime(this.volume * 0.5, now)` →
  `.exponentialRampToValueAtTime(0.0001, now + 0.35)`. `audio-manager.js` là UMD, nạp bằng
  `<script>` classic trong `index.html` — KHÔNG thêm vào `index-entry.js`.
- **`private-chat.js`** là ES module → thêm `import './private-chat.js?v=N';` vào
  `client/js/index-entry.js`. Expose `window.PrivateChat`. Dùng `window.socketClient` /
  `window.AudioManager` như các module lobby khác.
  - Tiling: mảng thứ tự các cửa sổ đang mở; `openChat` cái thứ 4 → `closeChat` phần tử [0].
  - Title flash: `setInterval` 1200ms toggle `document.title` giữa
    `(N) 💬 [Sender]: [snippet]…` và title gốc; `window.addEventListener('focus'/'visibilitychange')`
    → clear interval + khôi phục title gốc + reset N=0. Lưu title gốc **một lần** lúc init.
  - Notification: chỉ khi `Notification.permission === 'granted'` **và**
    `(document.hidden || !document.hasFocus())`. Click notification → `window.focus()` + mở/nâng cửa
    sổ chat tương ứng.
  - Nút "Bật thông báo" trong header modal: render theo `Notification.permission`
    (`default`/`granted`/`denied` → 3 chuỗi i18n trên); click ở trạng thái `default` gọi
    `Notification.requestPermission().then(...)` trong try/catch (Safari cũ trả callback — bọc an
    toàn), rồi re-render nút. KHÔNG gọi `requestPermission()` ở bất kỳ chỗ nào khác.
  - `langchange`: cập nhật placeholder (`data-i18n-placeholder`), title nút, empty hint, banner ngắt
    kết nối, và nội dung modal nếu đang mở.
  - Phím tắt: `window.addEventListener('keydown')`, `(e.ctrlKey || e.metaKey) && e.key === 'k'` →
    `preventDefault()` + toggle modal + focus ô search. `<kbd>` hiển thị `⌘K` khi
    `/Mac|iPod|iPhone|iPad/.test(navigator.platform)`, ngược lại `Ctrl K`.
  - Banner ngắt kết nối (`user:status`/`user:disconnected`): `.pm-notice`, chấm xám, `disabled` ô
    input + nút gửi.
- **CSS** trong `client/css/lobby-zen.css` (đừng tạo file css mới — token brand chỉ định nghĩa ở đây,
  và HTML Sảnh đã link file này). `.pm-*`, `#private-chat-container`, `#modal-online-users`,
  `.online-users-*`. `@media (max-width: 640px)`: `#private-chat-container` full-width, chỉ cửa sổ
  trên cùng bung, còn lại thu `.pm-window--collapsed` (chỉ header, chạm để bung).
- **`index.html`**: markup `#private-chat-container` (rỗng, JS đổ vào) + `#modal-online-users`
  (dùng lại class `.modal-overlay`/`.modal`/`.modal__header`/`.modal__close` như `#modal-create`
  dòng 157-163).

### 5. Cache-bust (bắt buộc, làm cuối)

Bump `?v=N → N+1` ở mọi `client/*.html` (trừ `tournament-detail-mockup.html`,
`tables-tournaments-mockup.html`) **và** mọi `import '...?v=N'` trong mọi file `client/js/*.js` (kể
cả các module không phải `-entry`, kể cả `private-chat.js` mới, kể cả `href=...phosphor-sprite.svg?v=N`
trong markup mới). Kiểm:
```
grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
```
Phải ra **đúng 1** giá trị `?v=N`.

## "Đừng làm"

- Đừng thêm delta cho `lobby:online_users`.
- Đừng đụng `lobby:update`/`lobby:patch`/`_lobbySnapshots` (danh sách phòng).
- Đừng lưu DB, đừng tạo bảng, đừng thêm lịch sử chat.
- Đừng dùng textarea auto-grow / Shift+Enter — ô nhập 1 dòng như phòng, đã chốt.
- Đừng xin `Notification.requestPermission()` tự động — chỉ qua nút bấm.
- Đừng đụng transport config socket (`perMessageDeflate`, TCP_NODELAY) — ảnh hưởng cả game/chat/room.
- Đừng dùng chung `CHAT_RATE_LIMIT` — hằng số riêng cho private chat.
- Đừng copy-paste `sanitize`/`profanityFilter` — import lại.
- Đừng đánh dấu "đã xong" nếu chưa verify frontend end-to-end trên browser thật.

Bối cảnh & blast radius đầy đủ: [docs/todo/B159-private-chat-1-1-sanh.md](../todo/B159-private-chat-1-1-sanh.md).
