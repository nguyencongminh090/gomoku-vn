# B50. Cặp đấu chơi nhiều ván (game series) thay vì một ván (TODO.md #50)

Toàn bộ quyết định thiết kế đã chốt qua thảo luận ở `features/tournament-match-series/planning.md`
— đọc file đó trước khi bắt đầu, tài liệu này chỉ tóm tắt trình tự triển khai + ranh giới.

## Round Robin — đã xác nhận khớp code hiện tại, không cần sửa

Từng có câu hỏi mở về việc Round Robin có cần "Round" không — người dùng đã xác nhận (2026-08-06)
là **có**, và mô tả đúng khớp với cách `roundRobinPairing.generateAllRounds()` đã hoạt động (mỗi
Round = mỗi người chơi gặp đúng 1 đối thủ mới, ứng với 1 cột trong bảng xoay vòng circle method).
Xem `features/tournament-match-series/planning.md` mục "Ghi chú thuật ngữ" để biết chi tiết. **Kết
luận: không cần sửa `roundRobin.js`/`TournamentManager.startTournament`** khi làm B50 — giữ nguyên
như hiện tại.

## Trình tự triển khai đề xuất

1. **Data model trước tiên.** Sửa `server/db/schema.sql` (bảng lưu pairing/kết quả) +
   `PairingLifecycle.js`'s in-memory `pairing` shape: `result` đơn → `games: [{index,
   winnerEntryId|draw, endedAt}]` + `seriesScore` suy ra. Đây là nền cho mọi bước sau, nên làm và có
   test trước khi đụng vào socket handler/UI.
2. **`RuleSet` schema** — thêm `seriesMode: 'single' | 'fixedCount' | 'raceToMargin'`,
   `seriesGameCount`, `seriesTargetScore`, `seriesMargin`. Mặc định `'single'` bắt buộc — các giải
   đấu/test hiện có (B48) không được đổi hành vi khi không cấu hình series.
3. **`TournamentManager`/`PairingLifecycle`: logic đánh giá chuỗi.** Viết hàm thuần (pure function,
   dễ test) nhận `games[]` + `RuleSet` series config, trả về `{seriesComplete, winnerEntryId|null}`.
   - `fixedCount`: `games.length === seriesGameCount` → so tổng điểm.
   - `raceToMargin`: `max(scoreA, scoreB) >= target && Math.abs(scoreA - scoreB) >= margin`. Không
     cần trần số ván (đã chốt uncapped) — nhưng viết test cho vài chuỗi dài (vd 20+ ván hoà liên
     tiếp) để chắc chắn không có giới hạn cứng nào vô tình sót lại từ code cũ.
4. **`TournamentMatchHandler`: chuyển ván kế tiếp.** Khi 1 ván kết thúc mà chuỗi chưa ngã ngũ: tạo
   `GameEngine` + `TimerManager` mới cho ván tiếp theo trong cùng `pairingId`, đổi màu (đảo
   Đen/Trắng so với ván trước), chạy lại Swap2 nếu `RuleSet` bật. Xem sequence diagram
   `features/tournament-match-series/diagram/uml_diagram/sequence-match-series-game-transition.md`
   cho luồng đề xuất — đây là **đề xuất chưa implement**, không phải code đã có, nên bám sát ý tưởng
   nhưng verify lại với code thật khi viết.
5. **Vắng mặt giữa chuỗi = xử thua cả chuỗi còn lại** — tái dùng đúng cơ chế walkover hiện có của
   B48 (decision "Round loss only"), chỉ mở rộng phạm vi áp dụng từ "ván" sang "toàn bộ ván còn lại
   của cặp đấu", không viết cơ chế walkover mới từ đầu.
6. **UI cuối cùng.** Sau khi backend ổn định + có test: chuyển component tab khán giả/chat từ
   `room.html`/`room.css` sang `tournament-match.html`. Đây là tái dùng **UI/CSS component**, không
   phải định tuyến qua `RoomHandler` thật — xem ranh giới bên dưới.

## Ranh giới — đừng đụng

- **Đừng định tuyến trận đấu giải đấu qua `RoomHandler`/`GameHandler` thật.** Người dùng đồng ý chỉ
  tái dùng UI/component (tab khán giả, chat) một cách thẩm mỹ — không phải chạy trận đấu giải đấu
  trong một room thật. Ràng buộc kiến trúc "tách biệt session model" đã chốt ở B48 vẫn giữ nguyên;
  `TournamentMatchHandler` vẫn là nơi quản lý session cho trận đấu giải đấu.
- **Đừng thêm trần số ván (max games) cho chế độ race-to-margin** — người dùng đã xác nhận rõ ràng
  là chấp nhận không giới hạn ("Score > margin is okay", ví dụ 12.5-12 → tiếp tục → 14.5-12 mới
  thắng). Không tự ý thêm safety cap dù có vẻ "an toàn hơn" — đó là đi ngược quyết định đã chốt.
- **Đừng đàm phán lại lịch/deadline cho từng ván.** Chỉ đàm phán một lần cho cả chuỗi — đừng mở rộng
  `PairingLifecycle`'s `Paired -> Negotiating -> Ready` flow thành lặp lại mỗi ván.
- **Đừng sửa B49 (kích thước bàn cờ) trong cùng nhánh/commit với B50** — hai việc độc lập, B49 đã có
  nhánh fix riêng theo quy tắc `fix/<slug>` (bug UI), còn B50 là feature mới đi theo
  `feature/tournament-match-series` off `dev`. Gộp chung sẽ vi phạm "một nhánh, một commit, một
  fix/feature".
