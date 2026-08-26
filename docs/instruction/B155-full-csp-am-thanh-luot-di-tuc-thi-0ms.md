# B155 — Hướng dẫn thực thi: Full CSP âm thanh + turn-bar/timer tức thì

Đọc `docs/todo/B155-*.md` trước (what). File này là *how* — bám sát
`features/full-csp-zero-latency/planning.md` (đã resolved với người dùng 2026-08-26), đừng tái phát
minh các quyết định đã chốt ở đó.

## 1. `client/js/board.js` — `_drawOptimisticStone` solid 100%

Bỏ `ctx.globalAlpha = 0.5` và toàn bộ khối vẽ viền nét đứt (`setLineDash`/`arc` ở cuối hàm hiện tại,
board.js:867-875). Quân predicted vẽ bằng đúng đường vẽ quân thật (`_drawStonePiece`/
`_drawBlackPiece`/`_drawWhitePiece`), không thêm gì khác — mục tiêu là **không phân biệt được bằng
mắt** với quân đã xác nhận, đúng yêu cầu người dùng đã chấp nhận đánh đổi này. `optimisticStone` vẫn
**giữ nguyên tách biệt khỏi `this.board`** — chỉ đổi cách vẽ, không đổi kiến trúc overlay.

**Đừng xoá field `warning`** trên `optimisticStone` — vẫn cần cho case ack-timeout-lần-1 (retry).
Quyết định hiển thị `warning` thế nào khi quân giờ solid 100%: dùng một dấu hiệu rất nhẹ (vd. viền
mảnh 1px cùng màu cảnh báo, không đổi alpha quân) — **không được to đến mức phá vỡ "solid,
indistinguishable"**, nhưng cũng không được im lặng bỏ hẳn tín hiệu retry (người chơi cần biết đang
retry, không phải đã xong).

## 2. `client/js/game-ui.js` — `sendMove` phát âm thanh + `predictedTurn` overlay

### 2a. Âm thanh tức thì

Sau `st.boardRenderer.setOptimisticStone(...)` (game-ui.js:88-90), gọi thẳng
`global.audioManager.playMoveSound(false)` — `false` vì đây luôn là nước của chính mình (không phải
opponent). Đặt **trước** `emitAck` để không phụ thuộc gì vào network.

### 2b. `predictedTurn` — thiết kế bắt buộc theo nguyên lý "overlay, không ghi state"

Đây là phần rủi ro nhất — bám sát chặt `features/full-csp-zero-latency/planning.md` Q2:

- Thêm field mới, **không nằm trong `gameState`**: ví dụ `st.predictedTurn = { active, forColor,
  snapshotTimerValues, switchedAtLocalTs }`, sống cạnh `boardRenderer` trong `RoomState`.
- **Tuyệt đối không gán `gameState.currentTurn` hay `gameState.timerValues`** — đây chính là ranh
  giới ngăn optimistic turn-switch phá vỡ mọi chỗ khác đang đọc `gameState.currentTurn` làm quyết
  định thật (vd. guard "1 nước đang bay" ở `onCellClick`, game-ui.js:209).
- `sendMove` set `predictedTurn.active = true` ngay sau bước 2a, snapshot
  `snapshotTimerValues = { ...S().gameState.timerValues }` (giá trị **thật tại thời điểm click**,
  không bịa), `switchedAtLocalTs = Date.now()`.
- `updateBoardState()` (game-ui.js:275) và `renderTimers()` (game-ui.js:305): đầu hàm, nếu
  `predictedTurn.active`, render turn-bar active-highlight cho `predictedTurn.forColor` thay vì
  `gameState.currentTurn`, và tính timer đối thủ bằng
  `snapshotTimerValues[forColor] - (Date.now() - switchedAtLocalTs) / 1000` — **live tick, đã chốt
  với người dùng** (không phải highlight tĩnh). Timer của chính mình (mover) dừng đếm ngay khi
  predicted (không đợi server) — cùng logic, chỉ đảo vai.
- **Rollback** (ack `{error}`, ack-timeout-lần-2 → resync, `game:ended` đua): set
  `predictedTurn.active = false`, rồi gọi lại `updateBoardState()`. Vì `gameState` gốc chưa từng bị
  đổi, `updateBoardState()` tự render đúng turn/timer thật — **không viết logic "khôi phục" riêng**,
  nếu thấy cần viết logic khôi phục nghĩa là đâu đó đã lỡ ghi vào `gameState` — dừng lại và tìm chỗ
  đó.
- **Confirm** (`game:moved` khớp toạ độ, xem mục 3): set `predictedTurn.active = false` **sau khi**
  `gameState.timerValues`/`currentTurn` đã được ghi từ payload server — thứ tự này đảm bảo lần
  render tiếp theo dùng đúng số server, không phải số dự đoán cuối cùng trước khi tắt cờ (tránh nhảy
  số kiểu "đếm dở rồi đứng lại đúng số khác" — phải là snap dứt khoát một lần).

### 2c. Guard chống double-click trong lúc predicted

`onCellClick` hiện có guard `if (S().boardRenderer && S().boardRenderer.optimisticStone) return;`
(game-ui.js:209) — **vẫn đủ**, không cần thêm guard riêng cho `predictedTurn` vì cả hai luôn được
set/clear cùng lúc trong `sendMove`. Chỉ cần đảm bảo không có đường nào set `predictedTurn.active`
mà không set `optimisticStone` hoặc ngược lại — giữ chúng đi thành cặp.

## 3. `client/js/room-socket.js` — `game:moved`: khử âm + snap timer

- Chỗ hiện tại gọi `audioManager.playMoveSound(isOpponent)` (room-socket.js:302,
  `isOpponent = !myPlayer || myPlayer.color !== data.color`): thêm điều kiện — nếu nước này là của
  **chính mình** VÀ toạ độ khớp `optimisticStone` hiện tại (tức đã phát ở bước 2a rồi), **bỏ qua**
  lệnh phát âm. Đối thủ/spectator (`isOpponent === true`) không đổi gì — vẫn phát bình thường.
- Thứ tự ghi trong handler: (1) ghi `gameState.board`/`currentTurn`/`timerValues` từ `data` như hiện
  tại → (2) `setOptimisticStone(null)` nếu khớp toạ độ (logic cũ, giữ nguyên) → (3)
  `predictedTurn.active = false` → (4) `updateBoardState()`. Đừng đảo bước 3 lên trước bước 1, nếu
  không `predictedTurn` sẽ tắt trước khi có số thật để thay vào, gây một frame hiển thị timer cũ/sai.
- `game:ended` handler (room-socket.js:423): thêm `setOptimisticStone(null)` +
  `predictedTurn.active = false` + dừng timer local **trước** khi áp kết quả — đây là case "đua" nêu
  trong spec gốc (thắng/thua đúng lúc ack còn đang bay). Không cần đợi ack của nước đang gửi; ack
  muộn tới sau đó chỉ nên bị bỏ qua (game đã kết thúc, không còn gì để reconcile).

## 4. Local pre-check (`onCellClick`, trước khi gọi `sendMove`)

Ba điều kiện, theo đúng thứ tự rẻ nhất trước:
1. `gameState.status === 'ongoing'`
2. `gameState.board[y][x] === EMPTY`
3. `gameState.currentTurn === myPlayer.color`

Sai bất kỳ điều nào → **return sớm, không gọi `sendMove`, không phát âm, không vẽ gì**. Đây là early
exit thuần, **không phải lớp validate mới** — server vẫn là nguồn quyết định cuối cho mọi thứ khác
(tường, portal, swap2). Đừng thêm bất kỳ điều kiện thứ 4 nào (đặc biệt đừng đụng tới hình học
tường/portal) — client không có dữ liệu đó theo đúng khảo sát ở `user_story.md`.

## 5. Test — bám ma trận 13 case ở `features/full-csp-zero-latency/planning.md` Q3

Không chỉ thêm test cho case xong (case 1) — **case 2-4 (các loại lỗi ack khác nhau)**, **case 5-6
(retry/resync)**, **case 7-8 (game:ended đua)**, **case 9-10 (local pre-check chặn)**, **case 11-12
(đối thủ/spectator không đổi)**, **case 13 (double-click)** đều phải có assertion cụ thể (không chỉ
"không throw") — theo đúng rule "Writing comprehensive test cases" của `CLAUDE.md`. Dùng
`makeBoardRendererStub`/`makeClientStub` đã có sẵn trong `client/tests/game-optimistic-render.test.js`
(xem file, đừng viết lại stub mới).

## 6. Rủi ro còn sót — phụ thuộc #154 (✅ đã làm 2026-08-26, đọc phần chốt cuối mục)

Phát hiện khi rà #154 vs #155 (2026-08-26), xem `docs/todo/B154-*.md` mục "Biến thể thứ hai": nếu
ack `game:move` thành công nhưng chính gói `game:moved` broadcast lại cho **người vừa đi** bị rớt độc
lập (2 gói khác nhau, rớt độc lập được — đúng mô hình mất gói chọn lọc #152/#154 đang giả định), thì
**không có gì kích hoạt reconcile**: retry chỉ chạy khi ack timeout, còn ack ở đây đã thành công rồi.
`optimisticStone`/`predictedTurn` sẽ kẹt ở trạng thái dự đoán vô thời hạn, im lặng không báo gì.

**Kiểm tra thứ tự làm trước khi code B155**:
- Nếu #154 đã làm (watchdog theo lượt tổng quát): xác nhận watchdog đó cũng phủ được case này (điều
  kiện kích hoạt "đang có `optimisticStone`/`predictedTurn` active mà quá N giây chưa thấy
  `game:moved` khớp toạ độ" — xem đề xuất mở rộng phạm vi trong `docs/instruction/B154-*.md`). Nếu
  có, B155 **không cần** tự dựng thêm cơ chế — dùng chung.
- Nếu #154 **chưa làm** khi bắt đầu B155: **bắt buộc** thêm một timeout tối thiểu riêng trong
  `sendMove` (`game-ui.js`) cho case này — sau khi nhận ack `{ok}`, đặt một `setTimeout` ngắn (đo
  trước, đừng chọn số tròn — tiền lệ #131) chờ `game:moved` khớp toạ độ; hết hạn mà chưa thấy thì gọi
  `game:resync` (primitive #152 đã có), y hệt đường resync-lần-2 hiện có. Không làm việc này thì
  #155 có một chế độ hỏng im lặng chưa từng tồn tại ở #153 (quân mờ kẹt còn nhìn thấy được sự bất
  thường; turn-bar/đồng hồ dự đoán kẹt thì không).

**Chốt (2026-08-26, sau khi #154 xong): nhánh thứ nhất đã thành hiện thực — B155 KHÔNG cần dựng
thêm gì cho case này.** #154 đã có sẵn đúng cơ chế nhánh 2 mô tả: `armMoveConfirmWatchdog()` trong
`client/js/room-socket.js` (xuất qua `global.RoomSocket`), `sendMove` gọi nó ở nhánh ack `{ok}`, hết
`MOVE_CONFIRM_TIMEOUT_MS` (2500ms) mà `optimisticStone` chưa được `game:moved` khớp toạ độ xác nhận
thì gọi `game:resync`. Ngưỡng không phải số tròn chọn bừa: broadcast được ghi vào socket **trước**
ack (cùng kết nối ⇒ có thứ tự), nên cầm được ack mà chưa thấy broadcast nghĩa là nó đã rớt — cửa sổ
này chỉ để hấp thụ jank main-thread.

**Việc của B155 ở mục này thu lại còn đúng một điều**: khi thêm `predictedTurn`, phải để nó **tắt
theo cùng một tín hiệu** đang tắt `optimisticStone` (`game:moved` khớp toạ độ, và mọi đường nạp state
đầy đủ), chứ đừng dựng vòng đời riêng — nếu `predictedTurn` sống lâu hơn `optimisticStone` thì
watchdog trên sẽ dọn quân nhưng bỏ lại turn-bar kẹt, tức đúng chế độ hỏng im lặng mà mục này lo, chỉ
khác chỗ biểu hiện.

## 7. Việc KHÔNG làm (nhắc lại từ `docs/todo/B155-*.md`)

- Không đụng `server/socket/SocketHandler.js` hay bất kỳ cấu hình transport nào (`perMessageDeflate`,
  `noDelay`) — đã loại khỏi scope, xem lý do "Ngoài phạm vi" trong file todo.
- Không đổi `click` → `pointerdown`/`mousedown` trong task này — nếu người dùng muốn làm riêng, ghi
  TODO mới, cần khảo sát touch/drag guard kỹ trước.
- Không nhân bản `GameEngine` (Chebyshev, portal, `_checkWin`) sang client — nhắc lại vì đây là lỗi
  dễ mắc nhất khi "làm cho gọn" phần pre-check ở mục 4.
- Đụng `client/` ⇒ **bump `?v=N`**, verify bằng
  `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup`.
