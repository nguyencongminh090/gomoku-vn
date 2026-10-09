# B165 — Đồng hồ "nhảy" (13s→10s) khi kết thúc prediction trên kết nối trễ cao (desktop)

**Trạng thái:** ✅ Đã sửa (2026-08-28) — client-side bù transit delay, `fix/timer-transit-delay-compensation`
off `dev`.

Đã làm (mục 1–3 của "Việc cần làm"; mục 4 easing cố ý hoãn — xem dưới):

- **Đo `d` (bước xác minh 1):** không ép được RTT mô phỏng qua CDP để đo production trực tiếp (giới hạn
  Chromium đã biết, fix-log #153) và không có kết nối tới người báo cáo. **HONESTY NOTE:** phân bố `d`
  thật của họ (desktop Mỹ + VPN) *chưa* được xác nhận bằng số đo. Cơ chế đã truy vết rất chắc (skew
  vs transit trong `getSync`) và cách bù **an toàn kể cả khi `d` nhỏ** (trừ ~10–25ms → vô hình), nên
  fix vẫn đúng hướng. Kèm log chẩn đoán bật bằng `localStorage.gvn_timer_debug = '1'` để họ tự đọc
  `rawOffsetMs`/`halfRttMs` trong DevTools và gửi lại — nếu `d` chỉ ~50ms thì cú nhảy có nguồn khác và
  phải điều tra lại (đừng coi đây là đóng hoàn toàn cho tới khi có số).
- **Nguồn RTT:** `io.engine` ping/pong của socket.io-client 4.8.3 **không** dùng được — heartbeat do
  *server* khởi xướng, client không thấy được round-trip. Không thêm `timer:probe` (giữ "server không
  đổi"). Thay vào đó **đo RTT từ chính ack của `game:move`** (`recordMoveRtt` trong `game-ui.js`): một
  round-trip thật trên đúng đường đi quan trọng, không thêm gói, không đụng server. EMA α=0.5, bỏ mẫu
  >30s, consumer clamp 8s. Nhược điểm: nước đi *đầu tiên* của ván chưa có mẫu → chưa bù (chấp nhận).
- **Bù ở đâu:** trừ `halfRttMs` khỏi **giá trị hiển thị** của người đang đếm giờ — trong `tickLocal`
  (mỗi giây) *và* giá trị mở màn trong `applyTimerSync`. **KHÔNG** trừ khỏi `activeDeadline`/
  `serverNow()`, nên `armTurnWatchdog` hoàn toàn không đổi (không cần retest watchdog ngoài việc suite
  hiện có vẫn xanh — đã xác nhận). Đồng hồ *không* đang đếm (frozen) giữ giá trị server thật, không
  trừ.
- **Mục 2:** `sendMove` gọi `RoomSocket.refreshLocalTimer()` (chính là `tickLocal`) ngay trước
  `snapshotTimerValues = Object.assign(...)` → snapshot lấy giá trị deadline-based tươi, không dính
  giá trị cũ do tab throttle.
- **Mục 3:** `visibilitychange → visible` và `window focus` → `requestResync()` (debounce 1s, chỉ khi
  ván `ongoing`). Không re-apply `lastSync` cũ (serverTime của nó sẽ quá cũ → `clockOffsetMs` giật).
- **Test:** `client/tests/game-optimistic-render.test.js` +13 case (#165): shave khi tick + mở màn,
  frozen không shave, snapshot tươi, RTT đo từ ack (ok/rejected) không đo từ timeout, mẫu vô lý bị
  bỏ, jump khi predictedTurn tắt co lại (2d→d), resync khi focus/visibility. 8/13 fail khi stash fix.
  `npm test` 1465/1465 xanh. Bump `?v=163 → 164` toàn repo.

**Hoãn cố ý (không nằm trong lần sửa này):**
- **Mục 4 (ease thay vì snap):** instruction.md ghi "không bắt buộc, làm nếu ±1s do `Math.round` vẫn
  khó chịu". Bỏ qua để giữ scope. Còn một bước ~`d` (chân *tải lên* của nước đi — client không biết
  cho tới khi ack về) khi predictedTurn tắt và ở đầu mỗi lượt của mình; đây là phần B167 (server hoàn
  giờ) hoặc một lần easing sau này. Nếu người báo cáo vẫn thấy khó chịu sau fix này → mở lại cho mục 4.
- **`tournament-match.js`** có bản sao `applyTimerSync`/`tickLocal` — **chưa** port sang. Ghi TODO
  riêng nếu muốn đồng bộ (đừng âm thầm sửa cả 2 — instruction.md B165 pitfall).

**Severity:** Medium — không mất giờ oan phía server (server vẫn đúng), nhưng người chơi thấy đồng
hồ tụt đột ngột mỗi nước đi, gây hiểu nhầm bị "ăn giờ" và mất tin tưởng vào clock.
**Platform:** Desktop (người báo cáo dùng **desktop + VPN**, ở Mỹ). Không phải lỗi mobile-throttle.
**Pages affected:** `room.html` khi đang chơi (turn-bar + đồng hồ). Chế độ `per_game`/`blitz` (ở
`per_move` đồng hồ người vừa đi reset về đầu nên không lộ).
**Reported by:** Người dùng — "click nhanh (nhờ CSP #155) nhưng sau khi click, đồng hồ nhảy 13s→10s".
Người dùng ở Mỹ, dùng VPN, **desktop**.

---

## Nguyên nhân gốc (đã truy vết, chưa sửa)

`getSync()` ([server/managers/TimerManager.js:138](../../server/managers/TimerManager.js#L138)) gắn
`serverTime` để khử **lệch đồng hồ (skew)** giữa hai máy, nhưng **không** khử **thời gian gói tin bay
trên đường (transit delay)**. Doc của chính hàm này chỉ nói tới skew.

Đặt `d` = one-way delay server→client của gói `timer:sync`. Trong `applyTimerSync()`
([client/js/room-socket.js:452](../../client/js/room-socket.js#L452)):

```
clockOffsetMs = sync.serverTime − Date.now()      // đo LÚC NHẬN, tức đã trễ d
→ serverNow() thấp hơn giờ-server-thật đúng d giây
→ remaining hiển thị = R − elapsed_local  (activeDeadline chưa trừ d)
→ (displayed − thật) = +d, CỐ ĐỊNH, ở mọi sync
```

Client **luôn hiển thị dư đúng `d` giây**. Với `d` nhỏ (~20ms) không ai thấy; với desktop Mỹ + VPN +
mạng kém, burst mất gói → TCP retransmit (RTO backoff 1–2–4s) hoặc VPN re-route → `d` chạm 1.5–3s.

Chuỗi tạo ra cú nhảy:
1. Người chơi thấy 13s (server thật 10s), bấm → `predictedTurn.snapshotTimerValues` đóng băng 13
   ([client/js/game-ui.js:105](../../client/js/game-ui.js#L105)).
2. Nước đi lên server, server xử lý, gửi `timer:sync` mới (remaining thật ≈ 10).
3. `applyTimerSync` ghi `st.timerValues = 10`; `game:moved` về → `predictedTurn` tắt →
   `renderTimers` chuyển từ snapshot 13 sang giá trị thật 10 → **nhảy 13→10**.
4. Sync mới vẫn dính `d` → lại thấy dư 3s → nước sau lại nhảy (khớp "mỗi lần click lại nhảy").

Đây **không** phải `setInterval` throttle: `tickLocal` là deadline-based nên throttle chỉ làm đồng hồ
tự giật *trước* khi bấm và tự chữa, không tạo lệch cố định `d`.

---

## Việc cần làm (chi tiết ở `instruction.md` B165)

1. **Bù transit delay phía client (chính):** client tự đo half-RTT (ack round-trip ngay sau khi nhận
   `timer:sync`, hoặc đọc từ `io.engine` ping/pong đã có sẵn của socket.io) rồi trừ khỏi
   `activeDeadline` / khỏi `remaining` hiển thị. Route bất đối xứng làm half-RTT không hoàn hảo nhưng
   vẫn cắt 3s xuống <1s. **Server không đổi — vẫn là nguồn chân lý cho timeout.**
2. **Trước khi chụp snapshot `predictedTurn`:** gọi `tickLocal()` một lần để `st.timerValues` tươi
   đúng theo deadline, tránh chụp phải giá trị cũ do main thread jank/throttle.
3. **Re-sync khi tab quay lại:** `visibilitychange → visible` và `window focus` → re-apply sync đang
   giữ (hoặc `requestResync()`) để repaint. Hiện `visibilitychange` chỉ gửi `room:presence`, không
   đụng timer ([client/js/room-socket.js:62](../../client/js/room-socket.js#L62)).
4. **(UX) Ease thay vì snap:** cho `renderTimers` chuyển giá trị về số server trong ~250–300ms thay
   vì gán cứng — che nốt phần lệch ±1s do `Math.round`. Thuần thị giác, không đụng logic.
5. Test mới `client/tests/game-optimistic-render.test.js` (mở rộng) — mock RTT, xác nhận displayed
   ≈ thật khi `d` lớn, snapshot không stale, không nhảy khi `predictedTurn` tắt.
6. Bump `?v=N`.

---

## Ngoài phạm vi (cố ý tách)

- **B166 — port cơ chế đã hoàn thiện sang mobile players-strip** (`room-ui.js` `updateStripTimers`,
  `renderStripPlayer` đọc thẳng `gameState.currentTurn`/`timerValues`, không đọc `predictedTurn`).
  Làm **sau** khi B165 chốt xong cơ chế bù trễ, rồi đồng bộ y hệt xuống mobile.
- **B167 — server-side lag compensation** (server đo transit của chính nước đi rồi *hoàn* bounded vào
  đồng hồ, kiểu Lichess `lag`): chỉ khảo sát sau khi đo phân bố RTT thật; kèm spec clamp +
  lag-budget. `clientTs` do client gửi **chỉ để cross-check**, không bao giờ làm nguồn tính giờ
  (`Date.now()` client là wall-clock, user chỉnh được).

---

## Liên quan

- **#155** (`docs/todo/B155-full-csp-am-thanh-luot-di-tuc-thi-0ms.md`) — sinh ra `predictedTurn`;
  B165 vá phần đồng hồ của nó trên kết nối trễ cao.
- **#154** (`docs/todo/B154-gap-detection-khong-pha-duoc-deadlock-2-nguoi.md`) — `armTurnWatchdog`
  dùng `activeDeadline`; nếu B165 trừ half-RTT khỏi `activeDeadline` thì phải kiểm lại watchdog vẫn
  arm đúng (đừng để nó bắn sớm hơn).
- **#10** (`docs/todo/B10-timer-tick-gui-deadline-1-lan-luot-review-4-3-client-tu.md`) — mô hình
  "server gửi deadline 1 lần/lượt, client tự đếm"; B165 là phần bù trễ còn thiếu của mô hình đó.
- Phân tích đầy đủ: hội thoại architect 2026-08-28 (Scope: Room, CSP, Timer).
