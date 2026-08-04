# B36. Redesign Start Modal + bỏ Game-End Modal (từ yêu cầu người dùng, 2026-08-04)

### B36. Redesign Start Modal + bỏ Game-End Modal (từ yêu cầu người dùng, 2026-08-04)

**Nguồn:** không phải từ review bên ngoài — người dùng tự đề xuất sau khi được
xem sơ đồ luồng "bắt đầu ván" hiện tại (mermaid), muốn nâng UX. Đã hỏi lại
3 vòng làm rõ trực tiếp với người dùng trước khi ghi mục này — **coi các
quyết định dưới đây là đã chốt**, không phải gợi ý còn mở như các mục khác.

**Đổi mô hình cốt lõi — đọc kỹ trước khi code, đây là điểm dễ làm sai nhất:**
hiện tại `syncReadyWindow` (`server/socket/state.js:353-367`) tự động mở
`readyDeadline` 30s **ngay khi `bothSeated`** (không cần ai bấm gì). Mô hình
mới: `bothSeated` **không** tự mở đếm ngược — chỉ khi có **1 trong 2 người
bấm "Bắt đầu" trước** (`room:ready`) thì mới mở đếm ngược **15s**. Đây là lý
do không thể chỉ đổi hằng số `READY_WINDOW_MS` 30000→15000 mà xong — phải đổi
cả *thời điểm* đếm ngược được kích hoạt.

**Cơ chế đếm-trượt (đã người dùng giải thích kỹ bằng ví dụ, chép nguyên văn
logic vì đây là phần dễ hiểu sai nhất):**
- `room.readyMissCount` (0-3), tính theo **cặp ghế hiện tại** (2 người đang
  ngồi ở slot 1 + slot 2 lúc này), không phải theo user cụ thể.
- 1 người bấm "Bắt đầu" → mở đếm 15s. Hết 15s mà người còn lại **chưa bấm** →
  đây là **1 lần trượt** (`readyMissCount += 1`), quay lại trạng thái chờ
  ban đầu (không đếm ngược, cả 2 lại thấy nút "Bắt đầu", **không tự động mở
  lại đếm ngược** — phải có người bấm lại). Lặp lại tối đa 3 lần trượt.
- Tới lần trượt thứ 3: kick **đúng người không bấm ở vòng thứ 3 đó** ra khỏi
  ghế (không phải cả 2, không phải theo lịch sử ai từng trượt bao nhiêu lần —
  chỉ nhìn vòng cuối cùng). Người đã bấm được giữ nguyên ghế, chờ người mới.
- **`readyMissCount` reset về 0 khi có bất kỳ thay đổi tư cách ngồi nào** ở
  1 trong 2 ghế đang tính — đứng dậy chủ động (`room:stand`), bị kick (đủ 3
  lần trượt), hoặc rời phòng — **kể cả khi đang giữa chừng 1 vòng đếm 15s
  chưa hết hạn** (ví dụ người dùng cho: bấm Bắt đầu, 5s sau người kia đứng
  dậy giữa chừng — không tính là 1 lần trượt vì chưa hết 15s, chỉ đơn giản
  huỷ vòng đang chạy). Ghế trống được ngồi lại (bất kỳ ai, không cần đúng
  người cũ) → coi là cặp ghế mới hoàn toàn, quay lại baseline (không đếm
  ngược, chờ 1 người bấm), `readyMissCount = 0`.
- Nếu không ai bấm gì cả (im lặng hoàn toàn, cả 2 ghế đầy) → không có gì hết
  hạn, không kick, chờ vô thời hạn — đúng hành vi "chờ" hiện tại, chỉ khác là
  giờ áp dụng cả khi đã đủ 2 ghế (trước đây đủ 2 ghế là tự đếm ngược ngay).

**Modal nhỏ lại, không chặn thao tác khác:**
- Bỏ backdrop full-screen của `#start-modal` (`client/room.html:155-166`,
  hiện là `class="game-overlay"` = `position:fixed; inset:0` chặn hết click
  phía dưới). **Vị trí mới: giữa bàn cờ** (center của board container, không
  phải center viewport) — người dùng chốt rõ "Center the popup at middle
  board", không phải góc màn hình.
- Chỉ có **card** của modal nhận click; phần nền xung quanh phải
  `pointer-events: none` (hoặc bỏ hẳn lớp backdrop, chỉ còn 1 div định vị
  tuyệt đối) để nút đứng dậy `.slot-card__stand` (`client/js/room-ui.js:
  129-131`, đã tồn tại sẵn, điều kiện hiện tại `state !== 'playing'` **không
  đổi**) và khung chat dùng được bình thường trong lúc modal đang hiện.
- Vì nút đứng dậy đã có sẵn trên thẻ ghế, **không cần thêm nút "Đóng" riêng
  trong modal nhỏ này** — người dùng xác nhận không cần.

**Bỏ hẳn `#game-overlay` (modal công bố Thắng/Thua/Hoà):**
- Xoá `#game-overlay` khỏi `client/room.html:169-181`, hàm
  `showGameOverlay()` (`client/js/room-ui.js:535-569`), và 2 handler
  `btnRematch`/`btnCloseOverlay` (`client/js/room.js:196-211`) — không còn
  đường nào set `.visible` cho phần tử này nữa, xoá luôn thay vì để chết.
- **Không cần chữ Thắng/Thua** — bàn cờ đã tô đỏ nước thắng
  (`_drawWinHighlight`, `client/js/board.js:645-654`, không đổi).
- **Case Hoà — đã hỏi riêng, người dùng xác nhận không cần thông báo dạng
  modal**, lý do: hoà là do 2 bên tự đồng ý (`game:draw_accept`), người bấm
  đồng ý đã biết kết quả ngay lúc bấm. Chỉ cần **cải thiện toast/system-chat
  message** đang có sẵn cho rõ ràng hơn (vd. "Ván đấu hoà theo thoả thuận"),
  không cần modal riêng.
- **Kết thúc ván = coi như "cặp ghế mới" của flow B36**, không phải 1 nhánh
  đặc biệt: `handleGameEnd`/`game:ended` (`server/socket/handlers/
  GameHandler.js`) reset `room.state` về trạng thái không phải `'playing'`,
  `ready=false` cho cả 2, `readyMissCount=0`, `readyDeadline=null` — sau đó
  chạy đúng lại từ đầu luồng B36 (chờ 1 người bấm "Bắt đầu" → 15s → …). Không
  cần event `game:rematch` riêng nữa — **người dùng xác nhận: "Mới hoàn
  toàn, lặp lại luồng start như cũ"**, không có xử lý đặc biệt gì cho rematch
  so với ván đầu tiên của phòng.

**Đảo ngược 1 ranh giới cũ từ B35 — cố ý, không phải quên:** B35 từng ghi
"Không đụng: luồng `confirmStart`/`syncReadyWindow` cho lượt chơi ĐẦU TIÊN…
khác với luồng rematch". B36 **xoá bỏ sự khác biệt đó theo đúng ý người
dùng** — ván đầu tiên và rematch giờ dùng chung 100% một luồng. Khi implement
B36, được phép sửa cả đường "ván đầu tiên" nếu cần thống nhất, đây không còn
là ranh giới phải giữ.

**Việc phụ cần dọn kèm:**
- `syncReadyWindow` cần đổi tên/tách logic vì hành vi cũ ("tự mở khi
  bothSeated") không còn đúng — cân nhắc đổi thành 2 hàm rõ ràng: 1 hàm dọn
  dẹp trạng thái khi mất ghế (`clearReadyState`, thay cho phần
  "no-op nếu !bothSeated" cũ), 1 hàm xử lý bấm "Bắt đầu"
  (`handleReadyClick`/tương đương) thay cho việc set deadline ngay trong
  `room:sit`.
- `handleReadyWindowTimeout` (`state.js:384-403`) và
  `forceUnreadyPlayersToStand` (`RoomManager.js:471-486`) phải đổi từ "kick
  toàn bộ người chưa ready" sang "chỉ kick đúng 1 slot không bấm, chỉ khi
  `readyMissCount` đã chạm 3" — đây là thay đổi hành vi lớn nhất ở tầng
  server, viết test kỹ cho đúng 3 nhánh: trượt 1-2 lần (không kick, không
  reset ai), trượt lần 3 (kick đúng người), đứng dậy giữa chừng (reset về 0,
  không tính là trượt).
- System chat message ở mỗi lần trượt/kick cần cập nhật nội dung cho khớp cơ
  chế mới (vd. "Người chơi X chưa sẵn sàng (lần 2/3)" thay vì thông báo kick
  ngay).
- `client/js/room-ui.js` `renderStartModal()` cần đọc thêm
  `readyMissCount`/ai đã bấm để hiển thị đúng text ("Chờ đối thủ bấm Bắt
  đầu…" / "Còn Ns" / không hiện gì khi chưa ai bấm).

**Test:** server-side có hạ tầng Jest thật — bắt buộc viết test cho toàn bộ
máy trạng thái mới (`readyMissCount` tăng/reset/kick) theo đúng rule
"Bug-fix workflow" trong `CLAUDE.md`, không được bỏ qua vì "chỉ là UX".
Client-side (`start-modal` CSS reposition, bỏ `#game-overlay`) vẫn chưa có
unit-test framework — dùng Playwright (`e2e/`) theo đúng tiền lệ B14/B18/B35,
đặc biệt cần 1 test xác nhận **modal không chặn click** (đứng dậy được /
chat được trong lúc modal đang hiện) vì đây là lý do chính của toàn bộ
redesign này.

**Không đụng:** cơ chế `EMPTY_ROOM_GRACE_MS`/`room:stand` khi đang `'playing'`
(giữ nguyên, không liên quan tới B36), `game:moved`/`timer:sync` (không đổi
gì trong ván đang chơi), quota `MAX_ROOMS_PER_IP`/`MAX_USERS_PER_ROOM`.

---
