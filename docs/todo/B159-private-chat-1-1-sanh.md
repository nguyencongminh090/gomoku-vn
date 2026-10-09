# #159 — Chat riêng 1-1 giữa người dùng online ở Sảnh (private message), kèm âm thanh, cảnh báo tab nền, phím tắt và i18n

**Trạng thái:** ✅ ĐÃ XONG (2026-08-27, nhánh `feature/private-chat`).

**Backend:** `server/socket/handlers/PrivateChatHandler.js` mới — `private_message:send` →
validate (MISSING_RECIPIENT / CANNOT_CHAT_SELF / GUEST_CHAT_DISABLED) → `sanitize` (escape `<`/`>`) →
`profanityFilter.filterMessage` → truncate 500 → rate-limit sliding-window 5/3s
(`PRIVATE_CHAT_RATE_LIMITED`) → `sessions.has` (`RECIPIENT_OFFLINE`) → emit thẳng
`private_message:receive` cho **đúng 2 socket** (người nhận + echo người gửi, cùng `messageId` do
`crypto.randomUUID()`, thêm `conversationWith` để client key đúng cửa sổ). `activePeers` Map báo
`user:status`/`user:disconnected` cho partner khi disconnect (bỏ qua nếu user còn session khác).
Đăng ký + cleanup trong `SocketHandler.js`. Config: `PRIVATE_CHAT_RATE_LIMIT`/
`_RATE_WINDOW_MS`/`_ALLOW_GUESTS` riêng.

**Shape `getOnlineUsersList()`** → `[{userId, displayName, isGuest}]` sort theo displayName.
Blast radius đã sửa: `lobby.js renderOnlineLine` (đọc `.displayName`, bọc tên online thành
`<a.online-name-link data-user-id>` để click-to-chat), forward vào `PrivateChat.updateOnlineUsers`.

**Client:** `client/js/private-chat.js` mới (ES module, `import` trong `index-entry.js`, thêm
modulepreload hint) — tiling ≤3 cửa sổ nổi (mở cái thứ 4 đẩy [0]), collapse header, `.pm-notice`
disable input khi peer offline / socket rớt, nhấp nháy `document.title` 1.2s khi
`document.hidden || !document.hasFocus()` + khôi phục khi focus, `Notification` khi `granted`, nút
"Bật thông báo" theo `Notification.permission`, phím tắt `Ctrl/⌘+K` toggle modal + focus search,
modal `#modal-online-users` + search client-side, `langchange` cập nhật placeholder/nút/modal.
`audio-manager.js` thêm `playMessageSound()` (dual-tone E5→A5). CSS `.pm-*` / `.online-users-*` trong
`lobby-zen.css` + `@media (max-width:640px)` full-width bottom sheet.

**i18n:** block `private_chat.*` + 5 key `err.*` cả `vi` lẫn `en`;
`PrivateChatHandler.js` thêm vào `SERVER_FILES` của `error-codes-i18n-consistency.test.js`.

**Test:** `npm test` xanh 1384/1384 → **1400+** (thêm `PrivateChatHandler.test.js` 13 ca:
gửi hợp lệ + không rò sang bên thứ 3, tự-chat, thiếu recipient, offline, rate-limit boundary 5/6 +
window slide, XSS escape, profanity mask, truncate 500/501, empty ignore, guest cờ tắt 2 chiều,
`cleanupUser` báo/không báo partner; `state-online-users.test.js` 4 ca shape/sort/isGuest;
`modulepreload-hints-match-entry-imports` count 5→6).

**Verify frontend (browser thật, 2 guest, Playwright):** modal mở qua nút + `Ctrl/⌘+K` + click tên;
gửi → tới đúng người nhận + echo, `<b>` giữ nguyên literal, profanity `****`; cửa sổ tự mở phía
người nhận; reply 2 chiều; disconnect → "Offline" + input disabled; nhấp nháy tiêu đề + khôi phục;
`langchange` đổi placeholder/nút; mobile 390px full-width. Console error = 0.
Chưa e2e được (headless): chime âm thanh, `Notification` hệ thống thật, nút xin quyền `granted`
(logic có guard, xác minh bằng đọc mã).

**Nguồn:** yêu cầu người dùng — spec đầy đủ "Implement a 1-on-1 Real-time Private Chat feature
for online users in the Lobby" (2026-08-27), rà soát + định vị scope bằng CodeGraph/đọc code, chốt
các câu hỏi mở qua hỏi–đáp trực tiếp. Spec gốc có vài chỗ lỗi thời (`?v=N` ví dụ, đề xuất test client)
— đã điều chỉnh theo mã hiện tại, xem `docs/instruction/B159-*.md`.

## Mục tiêu

Người dùng đang ở Sảnh (`index.html`) mở được cửa sổ chat riêng, nổi, neo góc dưới-phải, với bất kỳ
người nào đang online — bằng cách bấm tên trong dòng "online" hoặc trong modal "Người dùng online".
Tối đa 3 cửa sổ song song (mở cái thứ 4 đẩy cái cũ nhất ra). Có modal danh sách online + tìm kiếm
client-side, phím tắt `Ctrl/⌘+K` để bật/tắt modal và focus ô tìm kiếm. Tin nhắn đến khi tab đang ẩn
→ chime tổng hợp (Web Audio) + nhấp nháy tiêu đề tab + (tùy chọn) Notification hệ thống.

## Quyết định đã chốt (khác spec gốc ở đâu thì ghi rõ)

1. **Ô nhập chat = 1 dòng như phòng.** Bỏ yêu cầu textarea auto-grow / Shift+Enter của spec. Tái
   dùng markup + CSS + luồng gửi của chat phòng: `<input type="text" maxlength="500">` +
   `data-i18n-placeholder="room.ph_chat"` + nút `room.btn_send`, Enter để gửi (xem
   `client/room.html:151-154`, `client/js/room.js:319-323` `sendChatFrom()`). Không dùng pill
   `.pm-input-wrap` kiểu "Zen Quick Chat".
2. **Không lưu lịch sử chat.** Tin nhắn ephemeral, không ghi DB, không bảng mới. Đóng cửa sổ = mất
   lịch sử cuộc đó.
3. **`messageId` do server sinh** bằng `crypto.randomUUID()` (đã có sẵn trong Node của repo). Gắn
   vào cả `private_message:receive` gửi người nhận **và** echo lại cho người gửi qua `socket.emit(...)`
   — 2 cửa sổ key message giống hệt nhau (chỉ dùng để dedup + key DOM, không persistence).
4. **Guest được chat**, có cờ `config.PRIVATE_CHAT_ALLOW_GUESTS = true` (mặc định bật) để tắt trong
   tương lai; khi tắt và người gửi/nhận là guest → reject `GUEST_CHAT_DISABLED`. Chưa làm UI toggle.
5. **Notification: nút "Bật thông báo"** trong header modal `#modal-online-users` (KHÔNG xin quyền
   ngầm, KHÔNG xin lúc load trang). Nút phản ánh `Notification.permission`:
   - `default` → "🔔 Bật thông báo", click gọi `Notification.requestPermission()` (bọc try/catch).
   - `granted` → "🔔 Thông báo đang bật" (disabled).
   - `denied` → "🔔 Thông báo bị chặn" + tooltip hướng dẫn mở lại trong trình duyệt (disabled).
   Chime + nhấp nháy tiêu đề tab hoạt động độc lập với quyền notification.
6. **Mobile (`max-width: 640px`):** 1 cửa sổ mở rộng tại một thời điểm, full-width bottom sheet
   (`left:0; right:0`); các cuộc chat đang mở khác thu thành thanh header ~40px xếp chồng phía trên,
   chạm để bung. Luật "mở cái thứ 4 đẩy cái cũ nhất" giữ nguyên.
7. **Danh sách online giữ full-state broadcast** (kênh `lobby:online_users`, debounce 1500ms) — KHÔNG
   thêm delta. Chỉ đổi *shape* payload (xem dưới).

## Thay đổi có blast radius — `getOnlineUsersList()` đổi shape

`server/socket/state.js:67` hiện trả `string[]` (mảng tên hiển thị, đã sort). Đổi thành
`[{ userId, displayName, isGuest }]` (vẫn sort theo `displayName`). `sessions` ở `state.js:60` là
`Map<userId, socket>` với `socket.user = { userId, displayName, isGuest }` → có sẵn mọi field, và
`sessions.get(toUserId)` / `sessions.has(toUserId)` phục vụ luôn routing + presence-check của Private
Chat (không cần thêm resolver riêng).

Nơi bị ảnh hưởng, phải sửa/kiểm đồng bộ:

- `server/socket/state.js:67-68` — `getOnlineUsersList()` trả object.
- `client/js/lobby.js:200-226` `renderOnlineLine()` — hiện coi mỗi phần tử là **string**; đổi sang
  đọc `.displayName`, tận dụng `.userId` cho click-to-chat, `.isGuest` cho badge.
- `server/socket/handlers/LobbyHandler.js:138` `_getOnlineList()` — chỉ forward, kiểm lại.
- `server/tests/SocketHandler.test.js:210-262` — chỉ assert **số lần** broadcast/gộp debounce, không
  soi payload → không vỡ; nhưng `makeSocket` ở đó set `user:{userId, displayName}` thiếu `isGuest`,
  thêm cho sát thực tế.
- `server/tests/LobbyHandler.test.js:47` — mock `getOnlineUsersList: () => []` → không vỡ.
- **Test mới** `server/tests/state-online-users.test.js` — assert trả mảng object đủ 3 field, sort
  theo `displayName`, phản ánh đúng `isGuest`.

**Xác nhận cơ chế Sảnh (đã điều tra):** có 2 kênh delta độc lập.
- Danh sách **phòng**: `lobby:update` full-snapshot 1 lần/socket lúc `lobby:subscribe`
  (`state.js:176`) + `lobby:patch` `{upserts, removed}` delta (`state.js:202`, debounce 300ms, diff
  qua `_lobbySnapshots`). → snapshot-một-lần-rồi-delta, KHÔNG phải "delta-only tuyệt đối".
- Danh sách **online users**: `lobby:online_users` (`state.js:219`, `LobbyHandler.js:41`) — **full
  list mỗi lần, KHÔNG có delta**, chỉ debounce 1500ms gộp burst reconnect.
Private Chat dùng kênh online-users; giữ nguyên full-state. Payload full to hơn ~2-3× (thêm 1 id
ngắn + 1 bool/user) — với vài chục user online vẫn < 2KB, debounce 1.5s → chấp nhận, ghi rõ đánh đổi.

## Backend

- **`server/socket/handlers/PrivateChatHandler.js` (mới):** `register(io, socket)` lắng
  `private_message:send` `{ toUserId, text }`; validate (auth, chống tự-chat `CANNOT_CHAT_SELF`,
  trim + non-empty + max 500, escape `<`/`>`, profanity mask); rate-limit sliding-window 5 msg/3s/user
  (`PRIVATE_CHAT_RATE_LIMITED`); presence check `sessions.has(toUserId)` (`RECIPIENT_OFFLINE`);
  route thẳng `recipientSocket.emit('private_message:receive', ...)` + `socket.emit(...)`. **STRICT:
  không bao giờ broadcast tin/nhắn/state riêng vào room `lobby` hay bất kỳ room chung nào.**
  `activePeers` Map để khi user disconnect thì báo các partner đang trò chuyện qua `user:status`
  (`{status:'offline'}`) + `user:disconnected`.
- **Đăng ký + cleanup:** `SocketHandler.js` — thêm `PrivateChatHandler.register(io, socket)` (~dòng
  286, cạnh các `*.register`), và hook cleanup vào nhánh `socket.on('disconnect')` (~dòng 291-306,
  cạnh `chatManager.cleanupUser`).
- **Tái dùng, không copy:** `sanitize()` + `profanityFilter.filterMessage()` từ
  `server/managers/ChatHandler.js`. Rate-limit dùng **config riêng** `PRIVATE_CHAT_RATE_LIMIT=5` /
  `PRIVATE_CHAT_RATE_WINDOW_MS=3000` (KHÔNG dùng chung `CHAT_RATE_LIMIT`).
- **`server/tests/error-codes-i18n-consistency.test.js`** — thêm
  `'server/socket/handlers/PrivateChatHandler.js'` vào `SERVER_FILES` để mọi `code:` mới được kiểm
  có đủ key `err.*` cả `vi` lẫn `en`.

## Client

- **`client/js/private-chat.js` (mới)** — expose `window.PrivateChat` với `init`, `openChat`,
  `closeChat`, `openUsersModal`, `updateOnlineUsers`. Quản lý tiling ≤3 cửa sổ, empty state, banner
  ngắt kết nối (disable input + nút gửi, chấm xám), phím tắt `Ctrl/⌘+K`, nhấp nháy tiêu đề tab mỗi
  1.2s khi `document.hidden || !document.hasFocus()` + auto-restore khi focus lại, Notification khi
  `permission === 'granted'`, nút "Bật thông báo". Lắng `langchange` để cập nhật placeholder/title/
  empty hint/banner/modal đang mở mà không reload.
- **`client/js/audio-manager.js`** — thêm `playMessageSound()` (Web Audio, không file ngoài):
  dual-tone sine E5 659.25Hz → A5 880Hz, exponential decay; tôn trọng `this.volume` + `this.isMuted`.
  Gọi khi nhận tin đến (`!isSelf`), kể cả tab nền.
- **`client/index.html`** — markup `#private-chat-container`, `#modal-online-users` (header + nút ✕ +
  nút "Bật thông báo", ô search + `<kbd class="online-users-search-shortcut">`, list rows). Ô nhập
  mỗi cửa sổ dùng đúng cấu trúc `client/room.html:151-154`.
- **`client/js/index-entry.js`** — thêm `import './private-chat.js?v=N';`.
- **`client/js/lobby.js`** — `lobby:online_users` handler dùng shape mới; nối bấm tên online →
  `PrivateChat.openChat(userId)`; forward danh sách vào `PrivateChat.updateOnlineUsers()`.
- **`client/js/i18n.js`** — thêm block `private_chat.*` (title, ph_input, btn_send, user_disconnected,
  user_offline, user_online, status_in_lobby, status_offline, notif_from, modal_title,
  modal_search_ph, btn_chat, no_users_found, you, close, notif_enable, notif_enabled, notif_blocked)
  vào `vi` (dòng 19) và `en` (dòng 622); thêm key `err.cannot_chat_self`, `err.recipient_offline`,
  `err.private_chat_rate_limited`, `err.missing_recipient`, `err.guest_chat_disabled`.
- **CSS** — `.pm-*` / `.online-users-*` trong `client/css/lobby-zen.css` (token `--c-brand`,
  `--c-surface-2`, `--c-ink`, `--c-border-light` đều định nghĩa ở đó), kèm `@media (max-width:640px)`.

## Test

- **Jest server** `server/tests/PrivateChatHandler.test.js` (mới): gửi hợp lệ đến đúng socket người
  nhận (không rò sang room chung), chống tự-chat, người nhận offline, rate-limit (msg thứ 6 trong 3s
  bị chặn), escape XSS `<`/`>`, profanity mask, `activePeers` báo partner khi disconnect, guest bị
  chặn khi cờ tắt. Theo checklist "Writing comprehensive test cases" — decision table + boundary
  (đúng 5 msg pass, msg 6 fail; đúng 500 ký tự pass, 501 bị cắt).
- **`server/tests/state-online-users.test.js`** (mới) — shape `getOnlineUsersList()`.
- **`client/js/` không có test runner** — `private-chat.js` (tiling, nhấp nháy tiêu đề, langchange,
  phím tắt, nút notification) verify bằng browser thật (`run` skill / Playwright theo
  `playwright-e2e-safety`) end-to-end từ Sảnh. Ghi rõ đây là verify thủ công, không bỏ qua.

## Cache-busting

Đụng `client/css/` + `client/js/` ⇒ bump `?v=N → N+1` ở **mọi** `client/*.html` (trừ 2 mockup) và
**mọi** `import '...?v=N'` trong `client/js/*.js` (kể cả `private-chat.js` mới). Kiểm bằng
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` → đúng 1 giá trị.

## Ngoài phạm vi (không đụng)

- Không thêm delta cho `lobby:online_users`.
- Không đụng kênh `lobby:update`/`lobby:patch` (danh sách phòng).
- Không lưu DB / không bảng mới / không lịch sử chat.
- Không đụng transport config socket (`perMessageDeflate`, TCP_NODELAY...).
- Không làm UI toggle cho `PRIVATE_CHAT_ALLOW_GUESTS` (task sau nếu cần).
- `#115` (viewer-ma) / `#158` (đếm `userCount`) — không liên quan.

Chi tiết hướng làm:
[docs/instruction/B159-private-chat-1-1-sanh.md](../instruction/B159-private-chat-1-1-sanh.md).
