# #57. Trận đấu giải đấu chỉ có Đầu hàng — thêm Cầu hoà (Draw) và Xin cộng giờ (Time Request) như phòng chơi thường

**Trạng thái:** ✅ Đã sửa (xem `docs/fix-log/2026-08-07-todo-57-tournament-match-draw-time-request.md`).

**Nguồn:** yêu cầu người dùng, 2026-08-07, giữa lúc làm TODO.md #52 full-refactor: "Tournament room
can keep: Resign, Draw, TIme Request as Tables." (Tables = `room.html`/phòng chơi thường).

## Hiện trạng

- `tournament-match.js`'s file header (dòng 10-16) ghi rõ đây là **quyết định phạm vi có chủ đích từ
  Phase 4** (B48): "draw offers, bonus-time requests... `TournamentMatchHandler.js` never implemented".
  `.match-actions`/`#match-actions` hiện chỉ có 1 nút Đầu hàng (`btn-resign` → `tmatch:resign`).
- `room.html`/`game-ui.js`/`GameHandler.js` có đủ 3 cơ chế: Đầu hàng (`game:resign`), Cầu hoà
  (`game:draw_offer`/`game:draw_accept`/`game:draw_decline`, banner `.draw-prompt`), Xin cộng giờ
  (`game:request_time`/`game:time_accept`/`game:time_decline`, cùng banner pattern, giới hạn số lần
  qua `timeRequestsUsed`/config).

## Việc cần làm khi triển khai (chưa làm, chỉ ghi nhận)

- **Đây là việc backend thật, không phải chỉ CSS/UI** — cần thêm event tương ứng trong
  `server/socket/handlers/TournamentMatchHandler.js` (`tmatch:draw_offer`/`tmatch:draw_accept`/
  `tmatch:draw_decline`, `tmatch:request_time`/`tmatch:time_accept`/`tmatch:time_decline`), suy xét
  cách áp dụng lên `PairingLifecycle`/`GameEngine` của trận đấu giải đấu (khác context với
  `RoomManager`/`GameHandler` phòng thường — xem ranh giới kiến trúc đã chốt ở B48/B50: tournament
  session phải tách biệt khỏi `RoomHandler`/`GameHandler`, không định tuyến qua room session thật).
- Cần quyết định: cộng giờ trong 1 ván của series có tính riêng theo từng ván hay theo cả trận đấu?
  Số lần xin cộng giờ tối đa có giữ nguyên config phòng thường hay cần giá trị riêng cho giải đấu?
  Cầu hoà có cần tổ chức/organizer duyệt không, hay 2 người chơi tự thoả thuận như phòng thường?
  — chưa có quyết định, cần thảo luận thêm trước khi implement (có thể cần quay lại
  `features/tournament-match-series/` hoặc 1 discussion folder mới nếu câu hỏi đủ lớn).
- Phần UI/CSS đã sẵn sàng tái dùng luôn: `.game-controls`/`.btn-game`/`.btn-game--draw`/
  `.btn-game--time`/`.draw-prompt`/`.btn-draw-action` (đã có trong `game.css`, đã được load trên
  `tournament-match.html` từ fix #52 full-refactor) — không cần CSS mới, chỉ cần JS/HTML nút bấm +
  backend event.
