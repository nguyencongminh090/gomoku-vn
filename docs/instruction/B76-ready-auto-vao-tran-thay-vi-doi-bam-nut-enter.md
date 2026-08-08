# B76 — Ready → tự động vào trận (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #76 (2026-08-08).

## Bối cảnh kỹ thuật (đã xác nhận qua code, không suy diễn)

Đồng hồ trận đấu bắt đầu chạy **phía server** ngay khi cả 2 người chơi gọi
`tournament:ready` xong (`TournamentManager.markPairingReady()` →
`result.timer.start()`, `server/managers/tournament/TournamentManager.js:505`).
Client chỉ hiện nút "Vào trận" và chờ người dùng tự bấm
(`client/js/tournament-detail.js:422-423`, `handlePairingAction` case
`'enter'` gọi `goToMatch()`). Vì bấm là thao tác thủ công không đồng bộ giữa
2 người, người bấm sau bị mất thời gian đã trôi qua trên đồng hồ của họ.

## Cách làm

- Sửa ở **client**, nơi nhận sự kiện cập nhật pairing (tìm listener xử lý
  `tournament:pairing_changed` hoặc sự kiện tương đương trong
  `client/js/tournament-detail.js` — nơi gọi lại `renderPairings()` khi có
  pairing mới) và trong đường load trang lần đầu (nơi pairing list được lấy
  về và render lần đầu).
- Khi phát hiện một pairing của **chính người dùng đang xem** (`isMine`,
  logic đã có sẵn trong `renderPairingCard`) chuyển sang trạng thái
  `InProgress`, gọi `goToMatch(pairingId)` ngay — không chờ người dùng bấm
  nút.
- **Không đổi hành vi cho khán giả.** Chỉ áp dụng auto-navigate cho
  `isMine === true`. Nút "Xem trận" (`btn_watch_match`) cho khán giả giữ
  nguyên hành vi bấm thủ công như hiện tại — người xem không tham gia đồng hồ
  nên không có lý do ép họ rời trang danh sách giải đấu.
- **Tránh vòng lặp điều hướng lặp lại nhiều lần**: chỉ tự-điều-hướng đúng 1
  lần cho mỗi pairing khi phát hiện chuyển sang `InProgress` (vd. dùng một
  `Set` các pairingId đã tự-điều-hướng trong phiên trang hiện tại, hoặc kiểm
  tra trạng thái pairing *trước đó* khác `InProgress` trước khi tự chuyển) —
  để tránh trường hợp `renderPairings()` được gọi lại nhiều lần (mỗi lần có
  cập nhật không liên quan) mà vô tình gọi lại `goToMatch` liên tục.
- **Trường hợp load trang lần đầu khi pairing đã là `InProgress` từ trước**
  (người chơi F5 hoặc quay lại `tournament-detail.html` giữa ván): đây là
  hành vi **nên có** — tự động đưa thẳng vào lại trận đấu, không phải bug
  cần né. Đảm bảo logic init cũng chạy qua cùng 1 đường kiểm tra
  `isMine && state === 'InProgress'` như trên, không chỉ áp dụng cho sự kiện
  cập nhật real-time.

## Bẫy cụ thể

- `goToMatch()` set `window.location.href` — một khi gọi thì trang
  `tournament-detail.html` sẽ unload, không cần lo dọn dẹp listener sau đó.
- Đừng đổi thời điểm server start timer (`TournamentManager.js:505`) — đó là
  quyết định thiết kế đúng (đồng hồ chạy khi "cả 2 đã sẵn sàng", không phải
  khi "cả 2 đã vào phòng xem bàn cờ" — 2 khái niệm khác nhau và giữ nguyên
  server làm nguồn thời gian thật là đúng). Việc cần sửa là **thu ngắn độ trễ
  điều hướng phía client về gần 0** cho người chơi thật, không phải dời mốc
  server-side.
- Không đụng logic `btn_watch_match`/khán giả.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi cách `TimerManager` tính giờ hay bù trừ độ trễ mạng — đó là vấn
  đề khác (nếu cần, ghi TODO riêng).
- Không đổi UI/label cho trạng thái `Ready` (nút "Sẵn sàng") — chỉ đổi hành
  vi tại điểm chuyển `InProgress`.
