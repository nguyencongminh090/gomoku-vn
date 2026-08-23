# Fix log entry — 2026-08-24 04:25

## Prompt

"Do #153" — thực thi `docs/todo/B153-optimistic-render-quan-co-cua-chinh-minh.md` theo
`docs/instruction/B153-*.md`, tiếp nối #152 (điều kiện tiên quyết, đã xong cùng phiên).

## Action

### Xác minh trước khi code (theo yêu cầu instruction)

Đọc `server/managers/GameEngine.js:makeMove()` xác nhận **portal không dịch chuyển quân**: server ghi
thẳng `this.board[y][x] = color` tại đúng toạ độ click, và một ô đang là PORTAL còn bị chặn đặt quân
(`CELL_IS_PORTAL`) trước khi tới bước ghi. Optimistic render an toàn với `rulePortal` bật, không cần
tắt riêng cho chế độ đó — khác giả định thận trọng ban đầu trong file TODO ("chưa kiểm chứng, đừng
tin"), nay đã kiểm chứng xong.

Đọc `board.js` `_onClick`/`_onTouchEnd` phát hiện: gate `interactive && isMyTurn` + `board[y][x]===0`
(loại cả tường/portal) đã tồn tại **trước khi** gọi `onCellClick` — nghĩa là "kiểm tra tối thiểu"
instruction yêu cầu (đúng lượt + ô trống + trong bàn + không tường) **đã có sẵn ở tầng input**, không
cần viết thêm ở `game-ui.js`.

### `client/js/board.js`

- Field mới `this.optimisticStone` (`{x,y,color,warning}` hoặc `null`) — **tách hẳn** khỏi `this.board`
  (chỉ server mới ghi vào `board`); overlay thuần thị giác.
- `setOptimisticStone(stone)` / `markOptimisticWarning()` — API công khai, gọi `_draw()` ngay.
- `_drawOptimisticStone(x,y,color,warning)`: vẽ quân qua đúng hàm vẽ theo `displayMode` hiện có
  (`_drawStonePiece`/`_drawBlackPiece`/`_drawWhitePiece`) ở `globalAlpha=0.5`, cộng vòng nét đứt
  (`setLineDash`) — xanh (`--board-pending-rgb`) bình thường, hổ phách khi `warning`. Gọi trong `_draw()`
  sau vòng lặp vẽ bàn cờ thật.

### `client/js/game-ui.js`

- `sendMove(x,y)`: gọi `boardRenderer.setOptimisticStone({x,y,color})` **ngay đầu hàm**, trước
  `emitAck()` — vẽ đồng bộ, không phụ thuộc mạng.
- Ack `{error}` → `setOptimisticStone(null)` (rollback miễn phí, vì chưa từng ghi vào `gameState.board`).
- Timeout lần 1 → `markOptimisticWarning()` rồi retry (giữ vị trí, đổi màu vòng).
- Timeout lần 2 → giữ nguyên overlay + gọi `game:resync` (đã có từ #152); overlay chỉ được dọn khi
  `room:joined` (đáp án resync) tới.
- Ack `{ok}` **không** tự gỡ overlay — xem "Quyết định" bên dưới.
- `onCellClick`: thêm chặn "một nước đang bay" — bỏ qua click nếu `boardRenderer.optimisticStone` đang
  set (board.js's `isMyTurn` không tự tắt cho tới khi `gameState.currentTurn` đổi, nên click thứ 2 vẫn
  lọt qua gate hiện có trong cửa sổ round-trip).

### `client/js/room-socket.js`

- `game:moved`: sau nhánh gap-check (#152) — nếu **thực sự áp dụng** delta này (không phải replay/gap)
  và toạ độ khớp `optimisticStone` hiện tại → `setOptimisticStone(null)`. Đặt **sau** gap-check, không
  phải đầu handler, để tránh gỡ overlay khi chính broadcast của nước đó bị redirect sang resync.
- `room:joined`: `setOptimisticStone(null)` vô điều kiện ở đầu handler — bắt mọi trường hợp (join lần
  đầu, reconnect, resync) không để overlay cũ đè lên state authoritative mới.

## Decision

- **Hoà giải qua `game:moved` khớp toạ độ, không qua ack** — lệch so với bảng gốc trong TODO ("ack ok
  HOẶC game:moved → xác nhận"). Lý do: server gửi broadcast **trước** ack cùng kết nối (đảm bảo bởi
  #152, TCP/WS framing giữ thứ tự), nên `game:moved` luôn tới trước hoặc cùng lúc ack — dùng nó làm
  nguồn xác nhận duy nhất tránh một race thật: nếu clear theo ack `{ok}` mà đúng broadcast của nước đó
  bị gap-check chuyển hướng sang resync (một broadcast TRƯỚC đó bị lỡ), `gameState.board` chưa từng
  được ghi tại toạ độ này — gỡ overlay ngay sẽ lộ ô trống một khung hình trước khi resync kịp sửa.
- **Chặn "một nước đang bay tại một thời điểm"** — không có trong bảng gốc, nhưng cần thiết vì thiết kế
  chỉ giữ **một** `optimisticStone`. `isMyTurn` phía `board.js` chỉ đổi khi `gameState.currentTurn` đổi
  (tức đã xác nhận), nên trong cửa sổ round-trip người chơi vẫn có thể bấm ô khác — nếu không chặn,
  quân pending thứ 2 sẽ ghi đè quân thứ nhất.
- **Không tắt optimistic khi `rulePortal` bật** — khác dự phòng ban đầu trong TODO; đã kiểm chứng
  portal không dịch chuyển quân (xem mục "Xác minh trước khi code").

## Summary output

**Unit test — 29 case mới, giữ lại toàn bộ:**
- `client/tests/board-optimistic-stone.test.js` — 13 case: state API (`setOptimisticStone`,
  `markOptimisticWarning`, no-op khi đã null), dispatch đúng hàm vẽ theo `displayMode`/màu, alpha giảm,
  vòng nét đứt, đổi màu khi `warning`, wiring trong `_draw()` (có/không gọi `_drawOptimisticStone`).
- `client/tests/game-optimistic-render.test.js` — 16 case: vẽ ngay khi click (đúng màu người chơi),
  ack error → rollback + không đụng `gameState.board`, timeout 1 → warning giữ vị trí, timeout 2 → vẫn
  giữ overlay (không tự gỡ), ack `{ok}` **không** tự gỡ (đúng quyết định ở trên), không throw khi chưa
  có `boardRenderer`, Swap2 → không vẽ overlay + route đúng `game:swap2_place`, chặn nước đang bay,
  `game:moved` khớp/không khớp toạ độ/gap-redirect/replay (4 case), `room:joined` luôn dọn overlay.

**Xác nhận test không rỗng**: stash 3 file sửa (`board.js`, `game-ui.js`, `room-socket.js`) rồi chạy
lại 2 file test trên → **20/29 fail**. `npm test`: **1318/1318** (66→68 suite).

**Verify thật (Playwright, Chromium, instance cô lập cổng 3198, DB tạm — không đụng server/DB thật):**
`e2e/game-optimistic-render.spec.ts`, giữ lại. Một test tổng hợp:
1. Click thật qua canvas → `optimisticStone` đúng `{x,y,color}` ngay lập tức (đọc trực tiếp, không
   polling) → xác nhận qua `game:moved` → overlay tự dọn, `moveCount` tăng đúng 1 lần.
2. **Đo trễ cảm nhận**: quân pending hiện trong **~35-45ms** (đo lặp lại 2 lần, ổn định).
3. **Rollback thật**: bật luật Wall, click ngoài vùng nước-đầu-cạnh-tường → server từ chối thật
   (`SWAP2_FIRST_MOVE_MUST_BE_ADJACENT_WALL`) → overlay dọn sạch, `gameState.board` không đổi, chat
   hiện đúng lý do.

**Không ép được đo RTT mô phỏng cho phần "xác nhận từ server" (mục "Verify thật" của instruction đòi
network throttling ~500ms):** đã thử CDP `Network.emulateNetworkConditions` (latency 250ms) hai cách —
áp giữa ván lên socket đang mở, và áp **trước khi** socket kết nối (tạo context + bật CDP trước
`page.goto`) — cả hai đều **không** làm chậm khung WebSocket. Xác nhận đây không phải lỗi test bằng
cách throttle `fetch()` dưới **cùng lệnh CDP, cùng trang**: đo đúng ~262ms cho latency=250ms cấu hình —
chứng tỏ cơ chế throttle hoạt động thật, chỉ không phủ tới khung dữ liệu WebSocket (giới hạn đã biết
của Chromium/CDP, không phải lỗi của app hay của test). Ghi thẳng theo tiền lệ #126 thay vì báo khống
số đo — "HONESTY NOTE" đầy đủ nằm trong spec. Điều **đã** verify không cần RTT mô phỏng: quân pending
xuất hiện đồng bộ, không phụ thuộc mạng theo đúng kiến trúc code (`setOptimisticStone()` gọi trước
`emitAck()`), nên dưới RTT thật ~500ms nó vẫn sẽ hiện trong ~0ms trong khi xác nhận mất ~500ms — đúng
khoảng cách bài test này chứng minh được ở quy mô localhost.

`?v=152→153`.
