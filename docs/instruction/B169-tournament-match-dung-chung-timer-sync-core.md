# B169 — Hướng dẫn thực thi

Task nhỏ, cơ học, **nhưng có 1 câu hỏi phải chốt với người dùng trước khi viết code**
(xem §Câu hỏi chốt). Đọc `docs/todo/B169-*.md` trước.

## Ràng buộc

- Chỉ đụng phần **đồng hồ** của `client/js/tournament-match.js`. Không nhân tiện dọn
  thứ khác trong file — nó bị hoãn ở #165/#166 có lý do (bàn cờ/series/khoá rời trận).
- `timer-sync-core.js` là **extraction đã đóng băng** từ B168. Nếu trang giải đấu cần một
  biểu thức mới, thêm hàm mới vào core — **không** sửa hàm đang có, phòng thường đang
  chạy chúng.
- Nạp bằng thẻ `<script src="js/timer-sync-core.js?v=N">` cổ điển trong
  `tournament-match.html`, **không** `import` trong `tournament-match-entry.js`: file là
  UMD, Vite commonjs plugin sẽ bọc lười và `window.TimerSyncCore` không bao giờ được set
  trong bản production (bẫy #65 — chính xác cách `escape-utils.js` từng 404).
  `vite.config.js` tự quét thẻ classic nên không cần khai báo thêm.
- **Server vẫn là nguồn chân lý timeout duy nhất** (R2/#167). Mọi số ở đây chỉ để hiển thị.

## Câu hỏi chốt (hỏi người dùng TRƯỚC khi làm)

Trang giải đấu hiện không đo half-RTT — không có `recordMoveRtt`/`RoomState.halfRttMs`
tương đương. Nên:

- **(a) Tối thiểu** — chỉ thay `clockOffsetMs`, truyền `0` cho half-RTT ở
  `compensatedRemainingSec`. Sửa đúng lỗi 1ms, đồng hồ giải đấu vẫn **không** có bù
  transit-delay như phòng thường. Rủi ro ~0.
- **(b) Đầy đủ** — mang cả cơ chế đo RTT sang để đồng hồ hai trang khớp nhau. Đây là
  thay đổi hành vi thật trên trang giải đấu, cần verify trận thật, rủi ro cao hơn hẳn.

Mặc định đề xuất **(a)**, và nếu chọn (a) thì ghi rõ trong `docs/todo/B169-*.md` rằng
khoảng cách #165 giữa hai trang vẫn còn — đừng để nó lặng lẽ biến mất khỏi hồ sơ.

## Thứ tự bước

1. Thêm thẻ `<script>` vào `tournament-match.html`.
2. `applyTimerSync()`: `clockOffsetMs = TimerSyncCore.clockOffsetMs(sync.serverTime, Date.now())`.
3. `tickLocal()`: `TimerSyncCore.compensatedRemainingSec(...)` theo phương án đã chốt ở trên.
4. Thêm `tournament-match.js` vào `timer-sync-conformance.test.js` (cấm bản sao biểu thức).
5. Test jsdom trong `client/tests/` + verify trận giải đấu thật.
6. Bump `?v=N` toàn repo, grep verify đúng 1 giá trị.

## Pitfalls

- `tournament-match.js` **không** dùng `RoomState` — nó có biến module-scope riêng
  (`clockOffsetMs`, `timerValues`, `activeColor`, `activeDeadline`). Đừng copy nguyên si
  lời gọi từ `room-socket.js`; chữ ký hàm giống nhau nhưng nguồn dữ liệu thì không.
- Sửa `tickLocal()` mà quên `applyTimerSync()` (hoặc ngược lại) ⇒ giá trị mở màn sau mỗi
  sync lệch 1 nhịp so với các tick tiếp theo — đúng lỗi nháy hình #165 đã sửa cho phòng
  thường. Hai chỗ đi cùng nhau.
- Trang này có đường `series`/rematch: `applyTimerSync` bị gọi lại giữa các ván. Kiểm tra
  đồng hồ ván 2 chứ không chỉ ván 1.
