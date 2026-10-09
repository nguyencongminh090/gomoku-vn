# Fix log entry — 2026-08-28 08:50

## Prompt

"Do #165" — TODO.md #165 / `docs/todo/B165-*.md`: báo cáo người dùng (desktop +
VPN, ở Mỹ) — "click nhanh nhờ CSP #155 nhưng sau khi click đồng hồ nhảy 13s→10s"
mỗi nước đi trên kết nối trễ cao.

## Action

**Nguyên nhân gốc (đã truy vết ở B165 todo):** `TimerManager.getSync()` gắn
`serverTime` để client khử *lệch đồng hồ* (skew) giữa hai máy, nhưng gói
`timer:sync` mất `d` ms bay trên đường; `clockOffsetMs = sync.serverTime −
Date.now()` đo lúc *nhận* nên thấp hơn offset thật đúng `d` → `serverNow()` chạy
sau giờ-server-thật `d` giây → đồng hồ hiển thị **luôn dư đúng `d` giây**, cố
định ở mọi sync. Vô hình ở `d≈20ms`; desktop Mỹ + VPN + mất gói → `d` 1.5–3s →
snapshot `predictedTurn` đóng băng giá trị dư, tới khi nhường lại giá trị server
thật thì "nhảy" xuống.

**Sửa — client-only, `TimerManager`/`getSync` không đổi:**

- **Đo half-RTT từ ack của `game:move`** (`recordMoveRtt`, `client/js/game-ui.js`).
  `io.engine` ping/pong của socket.io-client 4.8.3 **không dùng được** — heartbeat
  do *server* khởi xướng (`engine.J("pong")` khi nhận ping), client không quan sát
  được round-trip. Không thêm `timer:probe` (giữ "server không đổi" của B165 todo).
  Ack của `game:move` là round-trip thật trên đúng đường đi quan trọng, không thêm
  gói. Đo trên mọi phản hồi server thật (chấp nhận **hoặc** từ chối); **không** đo
  khi timeout (đồng hồ đọc được là `MOVE_ACK_TIMEOUT_MS`, không phải mạng). EMA
  α=0.5, bỏ mẫu > 30s.
- **Trừ `halfRttMs` khỏi giá trị HIỂN THỊ** của người đang đếm giờ — trong
  `tickLocal` (`transitDelaySec()`, clamp 8s) mỗi giây, *và* giá trị mở màn trong
  `applyTimerSync` (chỉ khi `sync.running`, chỉ màu đang active). **KHÔNG** trừ khỏi
  `activeDeadline` / `serverNow()` → `armTurnWatchdog` (`activeDeadline −
  serverNow()`) không đổi một chút nào; đây là lựa chọn có ý để khỏi phải retest
  watchdog (chỉ cần suite hiện có xanh — đã xác nhận). Đồng hồ *không* đang đếm
  giữ giá trị server thật (không trừ) vì lúc frozen giá trị đó là chính xác.
- **Mục 2 (B165):** `sendMove` gọi `RoomSocket.refreshLocalTimer()` (= `tickLocal`,
  export mới) ngay trước `snapshotTimerValues = Object.assign(...)` → snapshot lấy
  giá trị deadline-based tươi, không dính giá trị `setInterval` ghi lần cuối (tab
  throttle / main-thread jank).
- **Mục 3 (B165):** `visibilitychange → !hidden` và `window` `focus` →
  `requestResync()` (debounce 1s trong-closure, chỉ khi ván `ongoing`). **Không**
  re-apply `lastSync` cũ — `serverTime` của nó sẽ quá cũ, `clockOffsetMs` giật.
- **Log chẩn đoán:** `applyTimerSync` in `rawOffsetMs`/`halfRttMs`/`shaveSec` khi
  `localStorage.gvn_timer_debug === '1'` (try/catch). Để người báo cáo tự đọc
  trong DevTools và gửi lại số đo `d` thật.

## Decision

- **HONESTY NOTE (bước xác minh 1 của instruction — "ĐO `d` thật trước"):** không
  ép được RTT mô phỏng qua CDP để đo production (giới hạn Chromium đã biết,
  fix-log #153) và không có kênh tới người báo cáo. **Phân bố `d` production của họ
  chưa được xác nhận bằng số.** Vẫn triển khai vì: (a) cơ chế đã truy vết rất chắc
  (skew vs transit trong `getSync`, doc hàm chỉ nói skew); (b) cách bù **an toàn kể
  cả khi `d` nhỏ** — trừ ~10–25ms là vô hình; (c) kèm log để lấy số đo sau. Nếu log
  cho thấy `d` chỉ ~50ms thì cú nhảy có nguồn khác → điều tra lại, đừng coi #165 là
  đóng hoàn toàn.
- **Mục 4 (ease thay vì snap) — hoãn.** instruction.md B165: "không bắt buộc, làm
  nếu ±1s do `Math.round` vẫn khó chịu". Giữ scope.
- **Bước ~`d` còn lại.** Khi nước đi của chính người chơi tới server, server tính
  cho họ cả chân *tải lên* của nước đi — client không biết cho tới khi ack về, nên
  vẫn còn một bước ~`d` (không phải `2d` như trước) khi `predictedTurn` tắt và ở
  đầu mỗi lượt của mình. Đây là phần **#167** (server hoàn giờ kiểu Lichess `lag`)
  hoặc một lần easing sau — đã ghi rõ ở B165 todo "Ngoài phạm vi".
- **`tournament-match.js`** có bản sao `applyTimerSync`/`tickLocal` — **không** port
  (pitfall instruction.md B165: đừng âm thầm sửa cả 2). Ghi TODO riêng nếu muốn.
- **Nhánh:** mục tracking #165 chỉ có trên `dev` (chưa lên `main`) ⇒
  `fix/timer-transit-delay-compensation` off `dev`, merge lại vào `dev` — ngoại lệ
  `git-workflow` (tiền lệ `fix/auth-cache-control-no-store`).

## Summary output

- `client/js/room.js`: `RoomState.halfRttMs = 0` mới.
- `client/js/room-socket.js`: `transitDelaySec()`; `tickLocal` trừ transit;
  `applyTimerSync` trừ transit ở giá trị mở màn + log chẩn đoán;
  `visibilitychange`/`focus` → `resyncClockOnReturn()` (debounce 1s);
  export `RoomSocket.refreshLocalTimer`.
- `client/js/game-ui.js`: `recordMoveRtt()`; đo RTT trong `attempt` của `sendMove`;
  `refreshLocalTimer()` trước khi chụp snapshot.
- `client/tests/game-optimistic-render.test.js`: `halfRttMs: 0` vào fixture + **13
  case #165** (shave khi tick + mở màn; frozen/paused không shave; halfRttMs 0 =
  như trước fix; snapshot tươi bỏ qua timerValues cũ; RTT đo từ ack ok/rejected,
  không đo từ timeout, bỏ mẫu > 30s; jump khi `predictedTurn` tắt co từ 2d xuống
  d; resync khi focus/visibility, không khi ván xong, gộp 1 lần). Stash fix →
  **8/13 fail**.
- `npm test`: **1465/1465** xanh. `?v=163 → 164` toàn repo (grep: đúng 1 giá trị;
  mockup vẫn ghim `?v=61`).
