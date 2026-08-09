# B59. Organizer huỷ giải đấu bất cứ lúc nào (TODO.md #59)

Toàn bộ quyết định thiết kế đã chốt qua thảo luận ở `features/tournament-cancel/planning.md` — đọc
file đó (và `user_story.md`) trước khi bắt đầu, tài liệu này chỉ tóm tắt trình tự triển khai + ranh
giới.

## Quyết định đã chốt với người dùng (2026-08-07, qua `AskUserQuestion`)

- **Trận đang sống (`InProgress`) khi bị huỷ → dừng ngay lập tức**, không phải "cho chơi nốt, chỉ
  chặn vòng mới". Lý do người dùng chọn: huỷ "bất cứ lúc nào" ngụ ý dừng ngay, không phải dừng có
  lịch trình — để trận sống tiếp tục chạy sau khi tournament đã coi là huỷ tạo ra trạng thái nước đôi
  không rõ ràng.
- **Có tính bảng xếp hạng tạm (partial standings)** từ các pairing đã `Completed` trước khi huỷ,
  không phải bỏ trắng hoàn toàn — các ván đã chơi công bằng trước khi huỷ vẫn được ghi nhận.

## Trình tự triển khai đề xuất

1. **Data model trước tiên.** Thêm trạng thái `cancelled` (draft/active/completed/cancelled) +
   `cancelledAt`/`cancelReason` trên tournament record. Kiểm tra `server/db/schema.sql` xem bảng
   `tournaments` cần cột mới không trước khi giả định cấu trúc.
2. **`TournamentManager.cancelTournament(organizerId, tournamentId, reason)`** — bám sát đúng khuôn
   `startTournament()` (`TournamentManager.js:240-296`): check `ORGANIZER_ONLY`
   (`tournament.organizerId !== organizerId`), check trạng thái hợp lệ (chỉ từ `draft`/`active`, trả
   lỗi mã tương tự `TOURNAMENT_ALREADY_STARTED`/`INVALID_STATE` nếu đã `completed` hoặc đã
   `cancelled`).
3. **Duyệt toàn bộ pairing của tournament, ép về terminal:**
   - `InProgress` → cần một helper teardown trận sống mới (đề xuất đặt cạnh `_endMatch` trong
     `TournamentMatchHandler.js` vì đó là nơi đã có sẵn kiến thức `matchRoom`/socket room): emit sự
     kiện huỷ vào phòng `tournament-match:<pairingId>`, `socketsLeave`, gọi
     `TournamentManager._teardownPairingTimer(pairingId)`, xoá entry
     `tournamentState.tournamentGameMap`, huỷ theo dõi deadline đang chờ nếu có.
   - Các state khác (`Paired`/`Negotiating`/`Reported`/`Ready`) → chuyển thẳng state, không đụng
     socket (chưa có trận sống).
   - **Việc cần quyết định lúc code, không chặn thiết kế:** dùng state terminal mới (`'Cancelled'`)
     hay tái dùng `'OrganizerAdjusted'` với `result.reason = 'tournament_cancelled'` — xem
     `features/tournament-cancel/planning.md#open-questions-non-blocking--can-default-and-adjust-later`
     mục 1. Nghiêng về state mới cho rõ ràng, nhưng verify lại bề mặt UI đang render pairing state ở
     đâu trước khi quyết (tránh phải sửa nhiều chỗ UI không lường trước).
4. **Bảng xếp hạng tạm** — tái dùng đúng logic tính standings đã có trong `_completeTournament`
   (`TournamentManager.js:842-862`), chỉ chạy trên tập pairing `Completed`. Nếu logic đó đang inline
   trong `_completeTournament`, tách thành helper dùng chung thay vì copy-paste.
5. **`TournamentHandler.js`**: `socket.on('tournament:cancel', ...)` theo đúng khuôn
   `tournament:start` (`TournamentHandler.js:296-308`). Broadcast: verify kênh lobby đang dùng để cập
   nhật trạng thái giải đấu real-time là gì (đừng tự bịa kênh mới nếu đã có sẵn cơ chế tương tự cho
   `tournament:start`/`tournament_completed`).
6. **Client**:
   - `tournaments.js`: nút "Huỷ giải đấu" trong `actions` của thẻ giải đấu, gate bởi `isOrganizer &&
     (status === 'draft' || status === 'active')` — khác với gate hiện tại của nút Start
     (`if (tournament.status === 'draft')` bao trọn cả khối `actions`, Cancel cần gate riêng rộng
     hơn).
   - `tournament-detail.js`/`tournament.html`: chưa có control cấp-tournament nào trong trang chi
     tiết (chỉ có organizer-tools cấp-pairing) — cần thêm UI slot mới, gần
     `detail-name`/`detail-meta`. Tái dùng đúng pattern modal xác nhận nguy hiểm đã có cho "Điều
     chỉnh/Huỷ cặp đấu" (`client/tournament.html:164-180`, class `.btn-cancel` nền
     `--c-danger-bg`/`--c-danger`) thay vì `confirm()` trần, vì đây là hành động phá huỷ toàn giải.
   - `tournament-match.js`: nghe sự kiện huỷ (mở rộng handler `tmatch:ended` sẵn có với
     `reason: 'tournament_cancelled'`, hoặc event riêng — xem open question 2 trong
     `features/tournament-cancel/planning.md`), hiện overlay "Giải đấu đã bị huỷ bởi người tổ chức",
     redirect về `tournament.html` theo đúng pattern đã có cho lỗi `NO_ACTIVE_MATCH`
     (`tournament-match.js:94-97`).

## Ranh giới — đừng đụng

- **Đừng cho phép huỷ từ trạng thái `completed`.** Giải đã hoàn thành thật thì không có gì để huỷ —
  nếu người dùng muốn "xoá lịch sử" đó là một tính năng khác (chưa được yêu cầu), đừng tự mở rộng
  phạm vi.
- **Đừng để huỷ trở thành hành động lặp lại được (không idempotent).** Huỷ lần 2 trên tournament đã
  `cancelled` phải trả lỗi rõ ràng, không phải no-op âm thầm hay lỗi crash.
- **Đừng định tuyến việc dừng trận sống qua `GameEngine.resign()`/`handleTimeout()` thật** — đây
  không phải một kết cục trong-game, là một hành động cấp-tournament từ bên ngoài. Dùng đường teardown
  trực tiếp (timer + socket room + map cleanup), không giả lập một resign/timeout giả để "cho ra đúng
  format sự kiện" — sẽ ghi sai reason/log nếu làm vậy.
- **Đừng tự thêm giới hạn/safety cap nào không có trong thiết kế đã chốt** (vd. giới hạn số lần huỷ,
  cooldown giữa các lần huỷ) — không nằm trong yêu cầu, đừng tự suy diễn thêm ràng buộc.

## Tài liệu liên quan

- [features/tournament-cancel/user_story.md](../../features/tournament-cancel/user_story.md)
- [features/tournament-cancel/planning.md](../../features/tournament-cancel/planning.md)
