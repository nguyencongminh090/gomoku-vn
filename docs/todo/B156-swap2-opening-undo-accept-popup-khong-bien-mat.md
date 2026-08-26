# B156 — Swap2 Opening: chấp nhận Undo xong, popup xin đi lại không biến mất

**Trạng thái:** ✅ Đã sửa 2026-08-27 — `fix/swap2-opening-undo-popup-not-cleared` off `dev`. Sửa:
gắn `swap2State.undoCancelled = true` trên object trả về từ `buildSwap2State()` tại đúng call site
trong nhánh `mode === 'opening'` của `game:undo_accept` handler (không sửa hàm dùng chung). 2 test
mới trong `server/tests/GameHandler.test.js`, xác nhận bằng mutation-kill (tắt dòng sửa → test mới
fail). `npm test` 1358/1358. Không đụng `client/` nên không cần bump `?v=N`. Chi tiết:
`docs/fix-log/2026-08-27-todo-156-swap2-opening-undo-popup.md`.

**Nguồn:** báo cáo người dùng — "At Phase Opening of Swap2, user request Undo, on accept, mechanics
work well but the display of popup is always appear." (2026-08-27)

## Hiện tượng

Trong pha Opening của Swap2 (đặt 3/2 quân, chọn màu — trước khi vào `play`), một người xin đi lại
(Undo). Người kia bấm **Đồng ý**. Cơ chế đi lại (rollback state) áp dụng đúng — quân/lượt lùi lại
chính xác. Nhưng popup "X xin đi lại — Đồng ý / Từ chối" **không biến mất**, vẫn hiển thị treo trên
UI sau khi đã chấp nhận.

## Nguyên nhân (đã xác minh bằng CodeGraph, đọc code hiện tại)

Client hiển thị popup dựa vào state `undoOfferPending` — xem `renderUndoPrompt()` ở
[client/js/game-ui.js:627-651](../../client/js/game-ui.js#L627-L651). State này chỉ được **xoá**
(set về `null`) ở 3 chỗ trong [client/js/room-socket.js](../../client/js/room-socket.js):

- `game:undo_declined` handler (dòng ~730-732)
- `game:undo_applied` handler (dòng ~737-741) — dùng cho nhánh **play mode**
- `game:swap2_state` handler, **chỉ khi** payload có cờ `data.undoCancelled === true` (dòng
  355-358) — cờ này dùng cho một cơ chế khác: người xin tự huỷ offer của mình bằng cách đi tiếp một
  nước mới trong lúc offer đang chờ.

Ở server, `game:undo_accept` handler trong
[server/socket/handlers/GameHandler.js:416-464](../../server/socket/handlers/GameHandler.js#L416-L464):

- Nhánh `result.mode === 'play'` (dòng 443-455): emit `game:undo_applied` → client xoá
  `undoOfferPending` đúng.
- Nhánh `result.mode === 'opening'` (dòng 430-442): chỉ emit `game:swap2_state` qua
  `buildSwap2State(engine, null, result.nextColor)` — hàm này
  ([GameHandler.js:698-714](../../server/socket/handlers/GameHandler.js#L698-L714)) **không bao giờ**
  gắn field `undoCancelled` vào payload trả về.

⇒ Khi Undo được **chấp nhận** ở pha Opening, không sự kiện nào client nhận được khiến
`undoOfferPending` bị xoá. Cơ học (board/lượt/màu) đã đúng vì nó đọc trực tiếp từ payload
`game:swap2_state` mới, nhưng biến cờ hiển thị popup bị bỏ quên — treo mãi cho tới khi có nước đi
mới kích hoạt nhánh `undoCancelled` khác (hoặc không bao giờ nếu ván kết thúc trước đó).

## Việc cần làm

Khi `acceptUndo()` trả `mode: 'opening'`, server phải báo cho client biết offer đã được xử lý xong
(giống cách nhánh `play` báo qua `game:undo_applied`) để `undoOfferPending` được xoá. Có 2 hướng khả
dĩ, chọn hướng nào phù hợp hơn khi implement (xem `instruction.md` §B156):

1. Thêm `undoCancelled: true` vào object `buildSwap2State()` trả về tại lời gọi ở dòng 442 (tái dùng
   đường xoá cờ đã có ở `game:swap2_state` handler phía client) — **không** đổi hàm
   `buildSwap2State()` dùng chung (ảnh hưởng cả các lời gọi khác), mà set field này sau khi gọi hàm.
2. Hoặc emit thêm một field mới ở payload đó và mở rộng `game:swap2_state` handler phía client để
   đọc field mới đó.

## Phạm vi

Chỉ sửa đường xoá `undoOfferPending` khi Undo được **accept** ở pha Opening. Không đụng tới:

- Nhánh `play` (đã đúng).
- Đường `undoCancelled` hiện có (tự huỷ offer khi đi tiếp một nước) — giữ nguyên hành vi.
- `declineUndo` (đã đúng, đã có `game:undo_declined`).

## Test

Chưa có unit test client-side (client/js/ hiện không có hạ tầng test — theo CLAUDE.md, nêu rõ thay
vì bỏ qua). Phía server, `acceptUndo()` mode `'opening'` đã có test trong
`server/tests/GameEngine.test.js` cho phần rollback state, nhưng chưa có test xác minh payload gửi
cho client mang cờ báo-đã-xử-lý — nên thêm assertion (hoặc test mới) ở tầng handler/socket nếu hạ
tầng test hiện có cho phép mock `io.emit` (xem test hiện có cho `game:undo_accept` nếu có, hoặc test
tương tự cho `game:swap2_state`/`game:undo_applied`). Verify thủ công bằng Playwright 2 người chơi
thật (theo `playwright-e2e-safety`): request Undo ở pha Opening → accept → popup phải biến mất ngay
trên cả 2 client, không chỉ đúng board/lượt.

Đụng `client/js/` ⇒ bump `?v=N` theo quy tắc cache-busting trong CLAUDE.md.
