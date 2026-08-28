# B165 — Hướng dẫn thực thi

## Xác minh trước khi code

1. **Đo `d` thật trước khi chọn cách bù.** Thêm log tạm: ở `applyTimerSync`, so `sync.serverTime`
   với `Date.now()` client, và đo một ack round-trip. Xác nhận `d` (one-way) thực sự cỡ 1–3s với
   người báo cáo (desktop Mỹ + VPN). Nếu `d` chỉ ~50ms thì cú nhảy 3s có nguồn khác — dừng lại, điều
   tra lại (đừng vá nhầm tầng — CLAUDE.md "Root-cause diagnosis").
2. **Đọc `armTurnWatchdog`** ([client/js/room-socket.js:600](../../client/js/room-socket.js#L600)) —
   nó dùng `activeDeadline - serverNow()`. Nếu mục 1 trừ half-RTT khỏi `activeDeadline`, watchdog sẽ
   arm sớm hơn một chút; kiểm bằng test hiện có `client/tests/turn-watchdog-resync.test.js` là không
   sinh false-positive resync.
3. Xác nhận chế độ đồng hồ trong report là `per_game` hoặc `blitz` (ở `per_move` người vừa đi được
   reset về đầu nên sẽ thấy nhảy *lên*, không phải xuống).

## Cách làm — thứ tự ưu tiên

**Mục 1 (bù transit delay) là cái sửa được bug. Mục 2–4 là bọc lỗ hổng phụ.**

- **Mục 1:** ưu tiên đọc RTT từ **`io.engine` ping/pong sẵn có** của socket.io (không tự dựng cơ chế
  ping mới nếu tránh được — xem `socket-client.js`). Nếu không lấy được rẻ, thêm một
  `client.timeout(x).emitWithAck('timer:probe')` **một lần ngay sau mỗi `timer:sync`**, đo RTT, lưu
  `halfRttMs`. Trừ `halfRttMs` khỏi `remaining` hiển thị (hoặc khỏi `activeDeadline` — chọn một, ghi
  rõ trong summary). **KHÔNG** đụng `TimerManager` / `getSync` phía server.
- **Mục 2:** trong `sendMove` ([client/js/game-ui.js:91](../../client/js/game-ui.js#L91)), gọi
  `tickLocal()` (hoặc tương đương) **ngay trước** dòng `snapshotTimerValues = Object.assign(...)` —
  để snapshot lấy giá trị deadline-based tươi, không phải giá trị `setInterval` ghi lần cuối.
- **Mục 3:** listener `visibilitychange` hiện có (dòng 62) — thêm nhánh: khi `!document.hidden`, gọi
  `applyTimerSync(lastSync)` với sync gần nhất đang giữ (cần lưu lại `lastSync` trong module), hoặc
  `requestResync()` nếu rẻ hơn. Thêm cả `window.addEventListener('focus', ...)`.
- **Mục 4:** thuần CSS/JS thị giác trong `renderTimers` — ease giá trị số về đích trong ~250ms
  (lerp theo `requestAnimationFrame`, hoặc CSS transition nếu render bằng số nguyên giây thì bỏ qua
  mục này). Không bắt buộc; làm nếu ±1s do `Math.round` vẫn gây khó chịu.

## Pitfalls / ranh giới

- **KHÔNG** sửa `server/managers/TimerManager.js` trong B165. Server đang đúng; đây là bug hiển thị
  client. Sửa server = phần B167 (khảo sát riêng).
- **KHÔNG** map sang "client gửi timestamp lúc click" ở task này — đó là B167, có bề mặt bảo mật
  (clamp, lag-budget). B165 chỉ để client **tự đo RTT của chính nó** và vẽ cho đúng.
- Route bất đối xứng: half-RTT ≠ one-way delay thật. Chấp nhận — vẫn cắt phần lớn. Đừng cố suy luận
  one-way từ client (không làm được tin cậy).
- `tournament-match.js` có bản sao cơ chế timer (`applyTimerSync`/`tickLocal` port từ room-socket).
  B165 **chỉ** phòng thường; nếu muốn đồng bộ sang giải đấu, ghi TODO riêng (đừng âm thầm sửa cả 2).
- Bump `?v=N` toàn `client/` + grep verify đúng 1 giá trị (CLAUDE.md "Cache-busting").
- Client chưa có e2e cho timer drift dễ; nếu không ép được RTT mô phỏng qua CDP (giới hạn Chromium
  đã biết — xem fix-log #153), ghi thẳng HONESTY NOTE thay vì báo khống, và dựa vào unit test mock
  RTT + xác minh browser thật thủ công.

## Test

- Mở rộng `client/tests/game-optimistic-render.test.js`: mock `halfRttMs` lớn (vd 1500), xác nhận
  `renderTimers` ra giá trị ≈ (deadline − now − halfRtt), snapshot `predictedTurn` không stale, và
  khi `predictedTurn` tắt không có bước nhảy > ~1s.
- Xác nhận test không rỗng: stash sửa → chạy lại → phải fail.
- `npm test` xanh toàn bộ.
