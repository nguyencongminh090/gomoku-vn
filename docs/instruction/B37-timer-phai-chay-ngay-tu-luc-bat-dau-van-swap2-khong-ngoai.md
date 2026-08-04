# B37. Timer phải chạy ngay từ lúc bắt đầu ván Swap2, không ngoại lệ (từ báo cáo người dùng, 2026-08-04)

### B37. Timer phải chạy ngay từ lúc bắt đầu ván Swap2, không ngoại lệ (từ báo cáo người dùng, 2026-08-04)

**Nguồn:** người dùng test thủ công phát hiện 2 lỗi đếm giờ trong luồng
Swap2, agent xác nhận cả 2 qua đọc code (không chỉ tin lời báo cáo), dựng sơ
đồ luồng hiện tại (state diagram + sequence diagram, mermaid) cho người dùng
xem, sau đó người dùng tự chốt hướng đi. **Coi quyết định dưới đây là đã
chốt**, không phải gợi ý còn mở.

**2 lỗi gốc (đã xác nhận bằng code, không phải suy đoán):**
1. `startGame()` nhánh `ruleSwap2` (`server/socket/handlers/GameHandler.js:
   576-605`) emit `game:init` với `timer: null`, **không gọi
   `startTimerForGame()`**. `startTimerForGame()` chỉ được gọi muộn, bên
   trong `game:swap2_choice` khi khai cuộc đã resolve xong (`r.done`, dòng
   158-159). Suốt `place3`/`p2choice`/`place2`/`p1choice`, `timerMap` không
   có entry cho phòng → không ai bị trừ giờ.
2. `TimerManager` constructor hard-code `this.activeColor = 'black'`
   (`server/managers/TimerManager.js:59`) — đúng cho ván thường (Đen đi
   trước) nhưng sai cho Swap2, vì luật Swap2 quy định **Trắng luôn đi
   trước** sau khi resolve (`_assignColors`, `GameEngine.js:380`:
   `this.currentTurn = this.players.find(p => p.color === 'WHITE').userId`).
   `startTimerForGame()` không truyền `activeColor` khởi tạo theo
   `engine.currentTurn` thực tế → timer luôn trừ giờ Đen dù đang là lượt
   Trắng.

**Yêu cầu người dùng chốt:** tính giờ **ngay từ khi bắt đầu ván**, kể cả
trong lúc đặt quân mở màn / chọn bên — không có giai đoạn nào được miễn trừ
("Apply Time manager right after START game. Không có ngoại lệ").

**Khó khăn cốt lõi — đọc kỹ, đây là điểm dễ làm sai nhất:** trong các phase
`place3`/`p2choice`/`place2`/`p1choice`, màu quân của 2 người chơi **chưa
được gán** (`players[].color = null`, xem `GameEngine.js` constructor
dòng 116-129 và `swap2Choice`/`_assignColors`). `TimerManager` lại xoay
quanh nhãn `'black'/'white'` — không thể tra
`engine.players.find(p => p.color === 'BLACK')` như `startTimerForGame()`
hiện làm, vì kết quả sẽ là `undefined` trong lúc khai cuộc.

**Giải pháp đã thiết kế (giữ nguyên API cũ của `TimerManager`, không phá vỡ
`addTime`/`DisconnectHandler`/test hiện có):** dùng `firstPlayerId`/
`secondPlayerId` (đã có sẵn trên engine, cố định suốt khai cuộc) làm **nhãn
placeholder** cho 2 khe đếm `black`/`white`, rồi **remap** sang màu thật khi
`_assignColors()` chạy. `firstPlayerId` luôn là người đi/chọn trước tại thời
điểm khởi tạo timer nên nhãn mặc định `activeColor = 'black'` của
constructor đã đúng cho bước đầu (`place3`) — không cần thêm tham số
constructor mới.

1. **`server/managers/TimerManager.js`** — thêm method mới, không đổi gì cũ:
   ```js
   remapForSwap2(realBlackPlayerId, realWhitePlayerId) {
     if (this.blackPlayerId !== realBlackPlayerId) {
       [this.black, this.white] = [this.white, this.black];
     }
     this.blackPlayerId = realBlackPlayerId;
     this.whitePlayerId = realWhitePlayerId;
     this.activeColor = 'white'; // luật Swap2: Trắng luôn đi trước sau resolve
   }
   ```
2. **`server/socket/handlers/GameHandler.js`:**
   - `startTimerForGame(io, room, engine, idOverride)`: thêm tham số tuỳ
     chọn `{ blackPlayerId, whitePlayerId }`; dùng override này thay cho
     `engine.players.find(p => p.color === ...)` khi được truyền (trường
     hợp Swap2 chưa gán màu).
   - `startGame()` nhánh `ruleSwap2` (dòng ~576-605): ngay sau khi tạo
     `engine`, gọi `startTimerForGame(io, room, engine, { blackPlayerId:
     engine.firstPlayerId, whitePlayerId: engine.secondPlayerId })`; đổi
     `game:init` payload từ `timer: null` thành `timer: timer.getTimers(),
     timerSync: timer.getSync()`.
   - `game:swap2_place` handler (dòng ~116-140): sau khi
     `engine.placeOpeningStone()` thành công, nếu `r.currentTurn !==
     user.userId` (lượt đã đổi người — hết phase), lấy
     `timer = timerMap.get(room.roomId)` rồi gọi
     `timer.switchTurn(r.currentTurn === engine.secondPlayerId ? 'white' :
     'black')` + emit `timer:sync`. Nếu lượt chưa đổi (đang đặt quân thứ
     2/3 cùng phase), không cần làm gì thêm.
   - `game:swap2_choice` handler (dòng ~144-176): nhánh `choice === 'place'`
     (chưa `done`) không cần switch (lượt vẫn ở `secondPlayerId`). Nhánh
     `r.done === true`: **bỏ** lệnh gọi `startTimerForGame(io, room,
     engine)` hiện tại (tạo `TimerManager` mới → mất thời gian đã tích luỹ
     trong khai cuộc) — thay bằng lấy `timer = timerMap.get(room.roomId)`
     rồi gọi `timer.remapForSwap2(blackPlayer.userId, whitePlayer.userId)`
     (với `blackPlayer`/`whitePlayer` tra theo `engine.players.find(p =>
     p.color === ...)`, lúc này màu đã gán xong). Đoạn emit `timer:sync`
     ngay sau đó (dòng 162-163) giữ nguyên, không cần đổi.
   - `GameEngine.js` không cần sửa: `currentTurn`/`openingPhase`/
     `handleTimeout()` (dòng 482, chỉ so `userId` không quan tâm màu) đã
     đúng sẵn.
   - `DisconnectHandler.js` không cần sửa: `timer.stop()/start()/getSync()`
     không quan tâm phase — khi timer tồn tại xuyên suốt khai cuộc, pause/
     resume khi mất kết nối giữa lúc Swap2 tự động đúng (cải thiện thêm,
     không phải side-effect xấu cần lo).

3. **Client — `client/js/game-ui.js`:** `renderSwap2()` hiện đang ẩn hẳn
   turn-bar (`setTurnBarVisible(false)`) — nếu chỉ sửa server thì đồng hồ
   chạy đúng nhưng người dùng không thấy gì. Cần: đổi thành
   `setTurnBarVisible(true)`; khi `swap2.colorsAssigned === false`, gán tên
   vào 2 khe `tb-black-name`/`tb-white-name` theo `swap2.firstPlayerId`/
   `secondPlayerId` (tra trong `st.gameState.players` theo `userId`, không
   theo `color` vì đang `null`). `renderTimers()` — đoạn tính `isBlackTurn`
   dựa vào `players.find(p => p.color === 'BLACK')` sẽ luôn `undefined`
   trong lúc khai cuộc; thêm nhánh: nếu `st.gameState.swap2 &&
   !st.gameState.swap2.colorsAssigned`, so `currentTurn ===
   swap2.firstPlayerId` để tô sáng đúng khe đang đếm. Bump `?v=N` theo rule
   `CLAUDE.md` vì đụng `client/js/`.

**Test:** `server/tests/TimerManager.test.js` bắt buộc có test cho
`remapForSwap2()` (2 nhánh: firstPlayer thật sự là Đen → không hoán đổi,
`activeColor` → `'white'`; firstPlayer hoá ra là Trắng → phải hoán đổi đúng
`this.black`/`this.white` + `blackPlayerId`/`whitePlayerId`, `activeColor` →
`'white'`) theo rule "Bug-fix workflow" trong `CLAUDE.md`. Client-side
(`client/js/game-ui.js`) chưa có Jest/unit-test framework — verify bằng chạy
app thật (2 tab, bật luật Swap2, quan sát đồng hồ chạy đúng người ở mọi
phase + đổi đúng lượt + dừng/resume đúng khi ngắt kết nối giữa khai cuộc)
hoặc mở rộng `e2e/swap2-opening.spec.ts` nếu cần — hiện file này chưa có
assertion nào về timer.

**Không đụng:** `GameEngine.js` state machine của Swap2 (`swap2Choice`/
`placeOpeningStone`/`_assignColors` — logic phase/currentTurn đã đúng, chỉ
timer là sai), `DisconnectHandler.js` (không cần sửa, xem lý do ở trên),
API công khai cũ của `TimerManager` (`black`/`white`/`activeColor`/
`blackPlayerId`/`whitePlayerId`/`addTime`/`switchTurn`/`applyMove` — chỉ
thêm method mới `remapForSwap2`, không đổi hành vi các method cũ).

---
