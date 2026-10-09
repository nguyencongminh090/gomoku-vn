# B169 — Hướng dẫn thực thi

## Ranh giới (đọc trước khi mở file)

- **Chỉ đường hiển thị.** `activeDeadline`, `serverNow()`, `clockOffsetMs`, watchdog lượt
  (`armTurnWatchdog`) **không đổi** — đây là ranh giới #165 đã đặt và `timer-sync-core.js` header
  ghi rõ ("None of this ever decides a timeout"). Phá ranh giới này là biến một bug hiển thị thành
  bug tính giờ.
- **Không đụng server.** `TimerManager`/`getSync()` đang đúng; sửa server là #167.
- **Không đụng `tournament-match.js`** (quyết định người dùng 2026-08-28).
- Sửa trong `client/js/timer-sync-core.js` (hàm thuần) + call site ở `room-socket.js`. `room-ui.js`
  mobile strip đọc qua `GameUI.effectiveTimerValues()` (#166) nên tự hưởng, **không** viết logic
  thứ hai ở đó.

## Thứ tự làm

1. **A1 — hysteresis cho `displayShaveSec()`.** Hàm hiện tại không giữ trạng thái
   (`Math.round(transitDelaySec(halfRttMs))`). Hysteresis **bắt buộc phải có bậc trước đó** làm đầu
   vào — giữ nó thuần bằng cách nhận thêm tham số (`displayShaveSec(halfRttMs, prevShaveSec)`), state
   nằm ở `room-socket.js`. **Đừng** biến `timer-sync-core.js` thành module có state: nó được
   `require()` trực tiếp trong Jest và nhiều test dùng chung một instance.
2. **A3 — kẹp đơn điệu.** Trong `applyTimerSync()`: giá trị hiển thị của **màu đang đi** chỉ được
   giảm so với lần render trước *trong cùng một lượt*. Reset kẹp khi `sync.activeColor` đổi, khi
   `sync.running` từ `false → true` (hết pause grace), và khi giá trị nhảy lên đủ lớn để chỉ có thể
   là tăng giờ thật (`addTime`/increment — xem `TimerManager.addTime`, `server/managers/TimerManager.js:177`).
3. Verify trình duyệt thật (skill `run`), **không chỉ** jsdom — xem Pitfalls.

## Chọn số: đừng chọn số tròn (rule CLAUDE.md)

- Dải đệm hysteresis phải dẫn xuất từ jitter đo được, không phải "±100 vì tròn". Dữ liệu hiện có:
  jitter 199,6 ms ở lượt CN duy nhất, 1,7–15,9 ms ở 4 lượt VN. **Một điểm dữ liệu ở dải cao là mỏng**
  — ghi rõ trong `docs/todo/B169-*.md` con số cuối cùng lấy từ đâu, và nếu chỉ có 1 mẫu thì nói thẳng
  là tạm, giống cách `diag-report.js` tự đánh dấu ngưỡng loss/jitter là provisional.
- Nếu chờ thêm được vài lượt `/diag` từ người chơi Mỹ/TQ rồi mới chốt số thì tốt hơn. Hỏi người dùng
  trước khi tự quyết "làm luôn với 1 mẫu".

## Pitfalls

- **jsdom không thấy được bug này.** Triệu chứng là chuỗi giá trị qua thời gian dưới nhiễu; suite
  `client/tests/` stub socket nên phải **bơm chuỗi `halfRttMs` nhiễu có chủ đích** (ví dụ lặp
  376/906/376/659…) rồi assert dãy hiển thị **đơn điệu không tăng** và **không đổi bậc quá 1 lần**
  trong N sync. Assert trạng thái/dãy thật, không phải "không throw".
- **`timer-sync-core.test.js` khối "room-parity"** chạy lại biểu thức tiền-#168. Đổi công thức
  `displayShaveSec` ⇒ **phải cập nhật kỳ vọng ở khối đó theo ý định mới**, nếu không nó vừa là false
  failure vừa mất tác dụng canh gác. Đây là yêu cầu tường minh của
  `.claude/rules/diagnostic-page-sync.md` mục (a).
- **`server/tests/timer-sync-conformance.test.js`** canh việc `room-socket.js`/`game-ui.js` không
  giữ bản sao riêng của biểu thức. Thêm state hysteresis ở `room-socket.js` là hợp lệ (state, không
  phải công thức) — nhưng nếu test này đỏ, đọc kỹ chứ đừng nới test.
- **Kẹp đơn điệu dễ làm đồng hồ "kẹt"** nếu quên reset ở đổi lượt / hết pause / `addTime`. Viết
  bảng quyết định cho các chuyển trạng thái này *trước* khi code (rule "Writing comprehensive test
  cases": liệt kê cả chuyển hợp lệ lẫn không hợp lệ).
- Đồng hồ đối thủ (không phải màu đang đi) **không** áp shave — giữ nguyên hành vi hiện tại.

## Sau khi sửa

- **Bump `?v=N` toàn repo** (client-side). Verify bằng đúng lệnh grep trong CLAUDE.md — phải ra
  **đúng 1** giá trị, và nhớ `client/js/diag/` cũng import chéo có `?v=`.
- Kiểm lại `.claude/rules/diagnostic-page-sync.md` mục (b): đổi cách room hiển thị ⇒ đọc lại xem
  ngưỡng/diễn giải trong `client/js/diag/diag-report.js` còn đúng không, cập nhật header nếu cần.
- Verify cả 2 tầng theo checklist "Feature completion" — jsdom **và** trình duyệt thật.
