## #45. Text không dịch / hardcode tiếng Việt khi ở chế độ English

**Nguồn:** báo cáo người dùng — "Text not fully English on English mode" (2026-08-04).

**Đánh giá hiệu quả/an toàn:** không phải bug an toàn, là bug UX/i18n rõ ràng
— đã tự tái hiện được qua audit code (đọc trực tiếp source, không chỉ suy
đoán). Không cần đo đạc thêm, có thể sửa thẳng.

**Trạng thái test:** chưa viết test (client-side `client/js/` hiện chưa có
hạ tầng test theo CLAUDE.md, nên phần client sẽ không có unit test kèm theo;
phần server nếu đổi cách trả lỗi/message thì cần cân nhắc test tương ứng
trong `server/tests/`).

### Cơ chế i18n hiện tại (để tham chiếu)
`client/js/i18n.js`: 2 dictionary `TRANSLATIONS.vi`/`TRANSLATIONS.en` (182 khoá
mỗi bên, **không thiếu khoá nào cả 2 chiều**), `t(key, vars)` tra theo
`currentLang`, fallback `vi`, rồi fallback raw key. `applyI18n()` quét
`[data-i18n]`, `[data-i18n-placeholder]`, `[data-i18n-title]`,
`[data-i18n-aria]`. Vì không thiếu khoá, mọi rò rỉ tiếng Việt dưới đây đến từ
chỗ **string không hề đi qua `t()`/`data-i18n*`**, không phải do fallback.

### Danh sách phát hiện (file : dòng — text)

**client/js/game-ui.js** — toàn bộ UI Swap2 và prompt đề nghị hoà là HTML
hardcode tiếng Việt, không gọi `t()`:
- L316, 318, 322-324, 327, 331, 335, 353, 359, 361 — "Swap2 — Đặt quân mở
  màn", "Đối thủ đang đặt quân mở màn...", "Đi Trắng"/"Đi Đen"/"Đặt thêm 2
  quân", "Đối thủ đang lựa chọn (Swap2)...", "Chọn Đen"/"Chọn Trắng", "Đối
  thủ đang lựa chọn màu...", "Đang chờ đối thủ phản hồi đề nghị hoà...",
  "... đề nghị hoà", "Đồng ý"/"Từ chối".

**client/js/socket-client.js**:
- L189: `'Mất kết nối. Đang thử kết nối lại...'`
- L192: `` `Kết nối lại... (lần ${detail})` ``

**client/js/lobby.js**:
- L155: `'<li ...>Không có ai online</li>'`
- L146: label "online" hardcode tiếng Anh bất kể ngôn ngữ (không đi qua i18n
  theo hướng ngược lại — vẫn là hardcode, chỉ khác là không lộ ra vì trùng
  ngôn ngữ hiện tại).

**client/js/room-ui.js**:
- L115: `title="Nhấn để ngồi vào"` hardcode — khoá `room.click_to_sit` đã có
  sẵn trong `i18n.js` nhưng không được dùng ở đây.

**client/js/history.js** — toàn file **0 lần gọi `t()`**:
- L94, 102, 111 — thông báo lỗi tải danh sách/ván đấu, "Không thể kết nối
  server."
- L145-148 — header bảng: "Thời gian", "Đen (X)", "Trắng (O)", "Kết quả".
- L199, 259 — `alert(...)` lỗi tải ván đấu.
- L221 — "Cơ bản" (fallback tên luật chơi).
- L441 — `confirm('Xoá nhánh này và tất cả các nước sau?')`.
- L512-523, 529, 531 — `getResultText`/`getResultTextFull`: "Hoà", "... thắng",
  "Có người thắng", "5 liên tiếp", "Đầu hàng", "Hết giờ", "Đồng ý hoà", "Bàn
  cờ đầy", "Người chơi".

**client/history.html** — cả trang **0 attribute `data-i18n`** dù có load
`js/i18n.js`; toàn bộ nhãn hiển thị hardcode tiếng Việt (title, mô tả trang,
heading, filter labels, nút, tooltip điều hướng timeline...) — xem chi tiết
dòng 6, 7, 42-44, 55, 61-82, 88-97, 103, 113-118, 138-143, 150-151.

**client/index.html**:
- L79: `title="Đang tải..."` trên `#online-count` — thiếu `data-i18n-title`.
- L133: `<span class="online-panel__title">Đang online</span>` — thiếu
  `data-i18n`.
- L7, L46 — meta description và `aria-label` điều hướng, mức độ ảnh hưởng
  thấp hơn (không hiển thị trực tiếp trong UI chính) nhưng vẫn hardcode.

**client/room.html**:
- L63: `<button id="btn-leave" ... title="Rời phòng">` — nội dung nút đã dùng
  `data-i18n` (khoá `nav.leave`) nhưng `title` (tooltip) là string riêng,
  không đồng bộ theo ngôn ngữ.

### Server-side — string tiếng Việt gửi thẳng xuống client, hiển thị nguyên văn

Client hiển thị trực tiếp `data.message`/`data.error` từ server qua
`alert()`/`showToast()`/`ChatUI.appendSystemMessage()` (xem
`client/js/room-socket.js` L111,116,123,127,137,143; `client/js/lobby.js`
L166) — nên **toàn bộ message lỗi/sự kiện phía server luôn hiển thị tiếng
Việt bất kể client đang ở English mode**, vì server không biết ngôn ngữ
client:

- `server/managers/GameEngine.js` — ~25 chuỗi lỗi (VD: "Ván đấu đã kết
  thúc.", "Chưa đến lượt bạn.", "Ô này đã có quân.").
- `server/managers/RoomManager.js` — ~20 chuỗi lỗi (VD: "Phòng không tồn
  tại.", "Phòng đã đầy.", "Không thể ngồi vào khi đang chơi.").
- `server/socket/handlers/GameHandler.js` — nhiều message lỗi + **system chat
  message ở L667**: `'Ván đấu bắt đầu! Đen đi trước.'` — gửi qua
  `chat:message` (`isSystem: true`), luôn hiện tiếng Việt trong khung chat.
- `server/socket/handlers/RoomHandler.js`, `LobbyHandler.js`,
  `ChatHandler.js`, `SocketHandler.js` — cùng pattern (VD:
  `'Tài khoản của bạn vừa đăng nhập ở một thiết bị khác.'` — đáng chú ý:
  client `i18n.js` đã có sẵn khoá `login.session_kicked` với bản dịch tiếng
  Anh tương ứng, nhưng message socket này là **bản copy hardcode riêng**,
  không dùng khoá đó).
- `server/managers/ChatHandler.js` L118 — rate-limit chat message.
- **`server/routes/auth.js`** (L108,113,118,126,164,175) — quan trọng nhất:
  client (`login.js` L223/249/266) dùng pattern
  `data.error || t('login.err_*')`. Vì server luôn trả `error` (tiếng Việt)
  khi có lỗi, **nhánh fallback `t(...)` không bao giờ được chạy tới** — lỗi
  đăng nhập/đăng ký **luôn** hiển thị tiếng Việt kể cả ở English mode. Đây là
  root cause hệ thống, không phải lỗi rời rạc.
- `server/routes/games.js` L104, `server/middleware/auth.js` L33/41,
  `server/middleware/errorHandler.js` L48, `server/index.js` L120 — cùng
  pattern.

### Nguyên nhân gốc (tóm tắt)
1. Pattern `data.error || t(...)` ở `login.js`/`history.js` khiến fallback
   dịch không bao giờ chạy vì server luôn có `error` tiếng Việt.
2. `history.html`/`history.js` nằm hoàn toàn ngoài hệ thống i18n.
3. `game-ui.js` (Swap2, đề nghị hoà) viết thẳng HTML tiếng Việt thay vì `t()`.
4. Message cấp socket (banner kết nối lại, chat hệ thống, mọi lỗi
   `RoomManager`/`GameEngine`/`*Handler`) sinh ở server bằng tiếng Việt cố
   định — server không biết ngôn ngữ client đang chọn.
5. Vài `title=`/tooltip hardcode dù phần text cùng element đã dùng
   `data-i18n` đúng.
