# #77 — Giải đấu (tournament) không sống sót qua restart server dù đã ghi DB

**Trạng thái:** ✅ ĐÃ XONG

Đã thêm `TournamentManager.loadTournamentsFromDb()` (được gọi 1 lần từ
`server/index.js`, trước `socketHandler.init(io)`) — dựng lại toàn bộ 3
`Map` trong bộ nhớ (`tournaments`, `pairings`, `userTournamentMap`) từ các
bảng SQLite đã có sẵn (`tournaments`, `tournament_players`,
`tournament_rounds`, `tournament_pairings`). Đóng thêm 2 lỗ hổng ghi DB có
sẵn từ trước (không liên quan trực tiếp đến bug report nhưng bắt buộc phải
sửa để reload đúng): `tournaments.organizer_name` (cột mới, trước đây chỉ có
trong bộ nhớ) và `tournament_players.final_rank` (cột đã có sẵn trong schema
nhưng chưa từng được ghi). `npm test`: 943/943 pass (thêm 12 test case mới
trong `TournamentManager.test.js`, describe `loadTournamentsFromDb`).

## Báo cáo gốc (người dùng, 2026-08-08)

> Nó có lưu database ko

Sau khi giải thích: mọi transition (create/register/start/pairing
lifecycle/cancel/complete) đã ghi SQLite từ trước, nhưng `TournamentManager`
chưa từng đọc lại — restart server xoá sạch mọi giải đấu khỏi những gì server
thực sự phục vụ, dù dữ liệu vẫn còn trong `gomoku.db`. Người dùng xác nhận
muốn "full restart-survival" (qua `AskUserQuestion`).

## Phạm vi đã làm

- Reload **mọi** giải đấu, mọi trạng thái (draft/active/completed/cancelled)
  — không chỉ active — để trang lịch sử/chi tiết vẫn xem được sau restart.
- Dựng lại state bằng cách **đọc sự thật đã ghi**, không chạy lại game logic
  để suy luận lịch sử — pairing đã có trong DB được nạp thẳng, chỉ những
  phần dẫn xuất chưa từng persist (Swiss `totalRounds`, round-robin
  `allRounds`, DE `bracket`) mới được tính lại bằng đúng hàm generator thuần
  túy `startTournament()` đang dùng, và chỉ để phục vụ các mutation **tương
  lai**.
- Pairing đang `InProgress` lúc server crash: không có state bàn cờ nào sống
  sót (`games[]` chỉ ghi các ván đã xong trong series, không ghi nước đi giữa
  chừng) → lùi về `Ready` qua chính transition `PairingLifecycle.startNextGame()`
  đã có sẵn (dùng cho "series chưa xong, sang ván kế") — giữ nguyên các ván
  trước đó trong series, chỉ mất ván đang chơi dở.
- Pairing đang `Reported`: hạ về `Negotiating` vì field `reportedBy` (dùng để
  chặn tự-xác-nhận trong `confirmTime`/`disputeTime`) không được persist —
  nếu giữ nguyên `Reported` mà mất `reportedBy` thì guard đó bị vô hiệu hoá
  âm thầm.
- **Giới hạn đã biết, chấp nhận không sửa trong lần này**: entry của khách
  (guest) mất liên kết `userId` sau restart, vì `tournament_players.player_id`
  vốn đã `NULL` cho khách (FK vào `users`, không có id thật để lưu). Muốn sửa
  cần thêm cột định danh khách bền vững — việc lớn hơn, ngoài phạm vi task
  này.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** cao — giải quyết đúng gốc rễ đã xác nhận qua code (comment
  tại `TournamentManager.js` xác nhận đây là lỗ hổng có chủ đích chưa làm ở
  Phase 1-4), không phải patch bề mặt.
- **An toàn:** không đổi hành vi khi server KHÔNG restart (constructor không
  tự gọi reload, giữ side-effect-free ở thời điểm `require()`) — chỉ thêm 1
  lệnh gọi tường minh ở `server/index.js`. Tự chữa lành (self-heal) trường
  hợp crash đúng lúc giữa "pairing cuối vừa xong" và "vòng/giải được đóng" —
  gọi lại `_advanceIfRoundComplete`/`_checkDoubleElimComplete` (đã có sẵn,
  idempotent-safe) sau khi hydrate xong 1 giải đang active.

## Trạng thái unit test

`server/tests/TournamentManager.test.js`, describe `loadTournamentsFromDb`
(12 test case: draft/guest organizer/guest entry gap/swiss/round-robin/
double-elim đầy đủ + chơi tiếp sau reload/bye/InProgress demotion/Reported
demotion/cancelled/userTournamentMap đa giải). `npm test`: 943/943 pass.
Chi tiết đầy đủ: [docs/instruction/B77-tournament-du-lieu-song-sot-qua-restart-server.md](../instruction/B77-tournament-du-lieu-song-sot-qua-restart-server.md).
