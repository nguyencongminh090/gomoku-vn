# B170 — Đếm ngược `readyDeadline` dùng `Date.now()` thô, sai đúng bằng lệch đồng hồ máy khách

**Trạng thái:** ⬜ CHƯA LÀM — **rà xác minh 2026-08-29: quick-fix trong `instruction.md` (đổi
`Date.now()`→`serverNow()`) đã bị loại — là no-op vì `clockOffsetMs` còn `0` ở giai đoạn sẵn sàng.**
Cần chốt Phương án A (thêm field `serverTime`, đụng `server/`) hay B (chấp nhận + ghi giới hạn) —
xem "Cách sửa thật" bên dưới. Người dùng 2026-08-29: để dành, mở hội thoại riêng để làm.

**Severity:** Medium — sai số bằng đúng độ lệch đồng hồ hệ thống của người chơi. Bình thường vài chục
ms (vô hại), nhưng đã đo được **−8,4 giây** trên một máy thật ⇒ với máy đó, bộ đếm ngược "sẵn sàng"
hiển thị sai 8 giây, có thể hiện `0` khi vẫn còn thời gian hoặc ngược lại.
**Platform:** Mọi nền tảng. Chỉ biểu hiện khi đồng hồ hệ thống máy khách lệch so với server.
**Reported by:** Rà soát phát sinh từ phân tích dữ liệu `/diag` (#168) —
`server/data/diag-results/2026-08-28.jsonl` dòng 5 đo `clockOffsetMs.p50 = −8407,75 ms`, 2026-08-28.

---

## Bằng chứng

Lượt đo `wbcplayer` (CN, Windows, Chrome 109) báo `run.clockOffsetMs.p50 = −8407,75`,
`driftMsPerMin = −37,4`. Cách tính trong `client/js/diag/latency-probe-session.js` đã **cộng bù
½RTT** (`clockOffsetMs(serverTime, recvTs) + half`) để không trừng phạt khoảng cách địa lý — nên sau
khi trừ ~376 ms bù đó, phần dư ≈ **−8 giây là lệch đồng hồ hệ thống thật** của máy đó, không phải
nhiễu đo. Drift −37,4 ms/phút nhỏ ⇒ lệch ổn định, không tự trôi thêm đáng kể trong một ván.

## Chỗ sai — `client/js/room-ui.js:464`

```js
const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
```

`deadline` ở đây là `st.roomData.readyDeadline` — **mốc theo đồng hồ server**. Trừ đi `Date.now()`
(đồng hồ máy khách, người dùng/NTP chỉnh được) ⇒ kết quả lệch **đúng bằng** `clockOffsetMs`.

Phòng chơi đã có sẵn lời giải: `room-socket.js:431` có `serverNow()` = `Date.now() + clockOffsetMs`,
cập nhật lại ở **mỗi** `timer:sync`. Vấn đề thuần cơ học: `serverNow` là hàm module-local, **không
nằm trong `global.RoomSocket`** (`room-socket.js:~700`: `{ serverMessage, requestResync,
armMoveConfirmWatchdog, refreshLocalTimer }`), nên `room-ui.js` không gọi được và đã dùng `Date.now()`
thô.

### Xác minh 2026-08-29 — bẫy "phần vỏ" đã được xác nhận LÀ THẬT

`clockOffsetMs` **chỉ** được gán ở `applyTimerSync` (`room-socket.js:526`), chạy khi có `timer:sync`
— tức **chỉ khi ván đã bắt đầu**. Bộ đếm `readyDeadline` chạy ở **giai đoạn sẵn sàng, trước ván
đầu** ⇒ lúc nó chạy `clockOffsetMs` **vẫn là `0`**. Server đặt `room.readyDeadline = Date.now() +
READY_WINDOW_MS` (`server/socket/state.js:487`) và gửi trong room-update payload **không kèm
`serverTime`**. ⇒ Client **không có mốc đồng hồ server nào** trong giai đoạn này.

**Kết luận:** đổi `Date.now()` → `serverNow()` ở call site là **no-op** (cộng offset `0`) — sẽ ship
đúng kiểu "phần vỏ" mà `instruction.md` cảnh báo. Fix thật cần một mốc server trong giai đoạn sẵn
sàng. Xem "Cách sửa thật" bên dưới.

### Cách sửa thật (cần quyết định — đụng `server/`)

**Phương án A (khuyến nghị):** server đóng dấu `serverTime: Date.now()` **cạnh** `readyDeadline`
trong room payload — `server/socket/state.js` (delta, ~dòng 319) + `server/managers/RoomManager.js`
(full, ~dòng 703). Client nhận được thì tính `offset = serverTime − Date.now()` và dùng cho bộ đếm.
Cùng khuôn mẫu `timer:sync`, thêm đúng 1 field. Phải cập nhật `server/tests/room-update-delta.test.js`
(assert shape payload) + `RoomManager.test.js`.

**Phương án B:** chấp nhận, ghi rõ giới hạn "bộ đếm sẵn sàng có thể lệch bằng skew đồng hồ máy khách
cho tới `timer:sync` đầu tiên" và chỉ sửa call site để *sau khi ván chạy* thì đúng. Rẻ hơn, không
đụng server, nhưng không sửa được đúng lượt đo `wbcplayer` (−8,4 s ngay ở màn sẵn sàng).

**KHÔNG** dựng cơ chế đồng bộ đồng hồ mới / message type mới — `clockOffsetMs` + 1 field `serverTime`
là đủ.

## Điểm được rà soát nhưng KHÔNG phải lỗi

- `client/js/game-ui.js:414` — `(Date.now() - pt.switchedAtLocalTs)`: hiệu **local trừ local**
  (`switchedAtLocalTs` cũng do `Date.now()` đặt ở dòng 134). Lệch đồng hồ triệt tiêu. Đúng như đang có.
- `client/js/game-ui.js:140/151` — `sentAt`/`recordMoveRtt`: cũng local−local, đo RTT. Đúng.
- `client/js/room-socket.js:336`, `chat-ui.js:85` — dấu thời gian hiển thị cục bộ của tin nhắn/nước
  đi, không so với mốc server. Chấp nhận được.
- `client/js/session.js:47` — `expiresAt` vs `Date.now()`: có lệch, nhưng chỉ quyết định "coi như hết
  hạn sớm/muộn 8 giây" trên một hạn tính bằng giờ/ngày. Không đáng sửa; ghi lại để lần sau khỏi rà lại.

## Ngoài phạm vi

- **`client/js/tournament-detail.js:199`** — `formatHoursRemaining()`: `new Date(iso).getTime() -
  Date.now()`, cũng là mốc server trừ đồng hồ máy khách. Nhưng kết quả làm tròn theo **giờ**
  (`Math.round(ms / 3_600_000)`, tối thiểu 1) ⇒ lệch 8 giây không đổi được chữ số nào. Không nhận vào
  task này; ghi ở đây để không bị "phát hiện lại" như mới.
- **`client/js/tournament-match.js:523/553`** — có `serverNow()` + `clockOffsetMs` riêng nhưng vẫn
  đọc `Date.now()` hai lần trong `applyTimerSync` (lỗi mà `timer-sync-core.js` đã sửa). Giữ nguyên
  theo quyết định người dùng 2026-08-28 ("do not touch tournament for now").
- Không dựng cơ chế đồng bộ đồng hồ mới. `clockOffsetMs` sẵn có là đủ.

## Liên quan

- **#168** — nguồn phát hiện; `timer-sync-core.js` `clockOffsetMs()` là hàm dùng chung.
- **#169** — cùng đợt phân tích, nhưng khác nguyên nhân: #169 là jitter độ trễ, #170 là lệch đồng hồ
  tường. Sửa cái này không sửa cái kia.
- **#167** — không liên quan: #167 là giờ thật phía server, ở đây chỉ là hiển thị phía client.
