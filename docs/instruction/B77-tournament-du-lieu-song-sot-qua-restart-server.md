# B77 — Tournament reload từ SQLite khi server khởi động (hướng dẫn thực thi)

Nguồn: người dùng hỏi "Nó có lưu database ko" + xác nhận muốn full
restart-survival qua `AskUserQuestion`, TODO.md #77 (2026-08-08). Thảo luận
thiết kế diễn ra trực tiếp trong phiên plan-mode (không tạo `features/<slug>/`
riêng — coi phiên plan-mode đó là bước thảo luận tương đương).

## Bối cảnh kỹ thuật (đã xác nhận qua code, không suy diễn)

`TournamentManager` giữ 3 `Map` trong bộ nhớ (`tournaments`, `pairings`,
`userTournamentMap`) là nguồn sự thật duy nhất server phục vụ. Mọi mutation
(`createTournament`, `registerPlayer`, `startTournament`, mọi transition
pairing, `cancelTournament`, `_completeTournament`) đã ghi SQLite từ trước,
nhưng không có đường đọc ngược nào — comment tại
`TournamentManager.js:98-101` (trước khi sửa) xác nhận đây là lỗ hổng có chủ
đích ("Phase 1-4 never added a 'reload tournaments from DB' path").

## Cách làm

### 1. Đóng lỗ hổng ghi DB nhỏ trước khi reload

- `schema.sql` + migration `ALTER TABLE` (theo đúng khuôn mẫu
  `cancelled_at`/`cancel_reason`, `database.js:45-53`): thêm cột
  `tournaments.organizer_name` — trước đây chỉ có trong bộ nhớ
  (`tournament.organizerName`), lưu cả cho organizer là khách.
- `database.js`: `createTournament()` nhận + ghi `organizerName`.
- Mới `updateTournamentPlayerRank(entryId, finalRank)` — `entry.finalRank`
  trước đây chỉ set trong bộ nhớ ở `_completeTournament`/
  `_assignDoubleElimFinalRanks`, chưa từng ghi DB dù cột `final_rank` đã có
  sẵn trong schema. Gọi ở cả 2 chỗ đó.
- `getTournamentPlayers()`: thêm `ORDER BY registered_at ASC` — trước đây
  không sắp xếp, nhưng regenerate lịch round-robin/bracket double-elim phụ
  thuộc thứ tự mảng entry (seed theo thứ tự đăng ký).
- Mới `getTournamentRounds(tournamentId)` và `getAllTournaments()` — chưa
  từng có reader nào cho 2 truy vấn này.

### 2. `TournamentManager.loadTournamentsFromDb()`

Method public mới, **không gọi trong constructor** (giữ side-effect-free lúc
`require()`) — gọi 1 lần từ `server/index.js`, trước
`socketHandler.init(io)`, giống cách `sessionManager.sweepExpiredSessions()`
được gọi tường minh thay vì tự chạy trong constructor của `SessionManager`.

Với mỗi tournament row (`database.getAllTournaments()`):
1. Dựng object tournament từ row + `organizer_name` (cột mới). Entries từ
   `getTournamentPlayers` (đã sắp thứ tự).
2. Nếu `status === 'draft'`: dừng ở đây — chưa có round/pairing nào.
3. Load `tournament_rounds` (`getTournamentRounds`, mới) → map
   `roundId -> {roundIndex, bracketSide}`.
4. Load pairings (`getPairingsByTournament`, đã có sẵn) → dựng từng pairing
   object trực tiếp từ row, field không có cột DB (proposedTime, reportedBy,
   disputed, overdue, rescheduleRequest, readyPlayers) reset về default của
   `createPairing()`, TRỪ 2 trường hợp cần xử lý đặc biệt (xem "Bẫy cụ thể"
   bên dưới): `Reported` → hạ về `Negotiating`; `InProgress` → lùi 1 ván qua
   `PairingLifecycle.startNextGame()`. Cả 2 fixup đều `_persistPairing()`
   ngay để lần reload sau không lặp lại.
   `roundIndex` lấy từ map ở bước 3. `bracketMatchId` (double-elim) suy ra
   từ chính `pairingId` (xem bên dưới, không cần cột mới).
   `seriesScore` tính lại qua `series.computeSeriesScore(games, ...)` — rẻ
   và chính xác vì `games` đã persist đầy đủ.
   `completedPairings` (dùng bởi `standings.js`) dựng lại bằng cách quét
   pairing có `state === 'Completed' || state === 'Walkover'` — đúng tập
   `_recordCompletion` từng được gọi lúc chạy live (OrganizerAdjusted/
   Cancelled/DoubleNoShow không bao giờ gọi `_recordCompletion`).
5. State theo format (chỉ khi có round, tức đã start với ≥2 entry):
   - **Swiss**: `totalRounds` tính lại bằng công thức y hệt
     `startTournament()`. `currentRoundIndex = max(round_index)` — đúng vì
     `_materializeRound` chỉ bao giờ tạo đúng 1 round mới hơn round hiện tại.
   - **Round robin**: `allRounds = roundRobinPairing.generateAllRounds(entryIds)`
     regenerate từ entryIds (đã đúng thứ tự) — chỉ dùng cho các round
     **tương lai**, không cần khớp lại lịch sử pairing đã có.
   - **Double elim**: `bracket = doubleElimPairing.generateBracket(entryIds)`.
     `bracketMatchId` mỗi pairing = cắt bỏ tiền tố `${tournamentId}:` khỏi
     chính `pairingId` (vì `_deId()` là hàm thuần túy tạo ra đúng chuỗi đó —
     không cần cột DB mới). `bracketResults` dựng lại bằng cách quét pairing
     `Completed`/`Walkover` có `player2EntryId` thật, y hệt nhánh double-elim
     của `_recordCompletion`.
   - Sau khi hydrate xong, nếu `status === 'active'`: gọi
     `_advanceIfRoundComplete`/`_checkDoubleElimComplete` 1 lần để tự chữa
     crash xảy ra đúng lúc giữa "pairing cuối vừa xong" và "vòng/giải được
     đóng".

### 3. `server/index.js`

`tournamentManager.loadTournamentsFromDb()` gọi trước
`socketHandler.init(io)`, sau `io.use(verifySocketToken)`.

## Bẫy cụ thể

- **`Reported` không được giữ nguyên khi reload** — `confirmTime`/
  `disputeTime` chặn tự-xác-nhận bằng cách so `entryId === pairing.reportedBy`;
  nếu `reportedBy` không persist mà giữ state `Reported`, guard đó bị vô
  hiệu hoá âm thầm (bất kỳ ai, kể cả người đã report, có thể "confirm"). Hạ
  về `Negotiating` là lựa chọn an toàn hơn — không giấu bug, người chơi chỉ
  cần report lại.
- **`InProgress` không có state bàn cờ nào để khôi phục** — cột `games` chỉ
  ghi các ván ĐÃ XONG trong series, không ghi nước đi giữa chừng, và cột
  `moves` trong schema chưa từng được ghi ở bất kỳ đâu (đã xác nhận qua
  grep). Dùng lại đúng `PairingLifecycle.startNextGame()` — không viết cơ
  chế mới, không xoá `games[]` các ván trước.
- **Đừng quên `_persistPairing()` sau 2 fixup trên** — nếu không, reload lần
  2 (chưa có hoạt động gì thêm) sẽ thấy lại đúng state cũ trong DB và xử lý
  lại từ đầu (không sai về mặt logic nhưng tạo deadline mới mỗi lần reload,
  gây khó hiểu khi debug).
- **`getTournamentPlayers()` phải có `ORDER BY registered_at ASC`** — thiếu
  dòng này thì round-robin/double-elim reload ra thứ tự entry không xác
  định, seed bracket/lịch có thể khác lần chạy trước (vẫn hợp lệ về thuật
  toán, nhưng khác với "kế hoạch" người chơi đã thấy trước restart).
- **Guest entry mất `userId`** — đã biết, không sửa trong task này (xem
  "Không thuộc phạm vi" bên dưới). Đừng cố suy đoán/gán tạm một userId giả
  cho guest — sẽ tạo bug khó phát hiện hơn (match nhầm người).

## Không thuộc phạm vi (đừng gộp vào task này)

- Không thêm cột định danh khách bền vững để sửa gap "guest mất userId sau
  restart" — việc lớn hơn, ghi TODO riêng nếu người dùng cần.
- Không đổi cách `tournament_players.withdrawn` hoạt động (cột có sẵn nhưng
  chưa từng được set ở đâu — `unregisterPlayer` xoá cứng row, không soft-
  withdraw) — hành vi có từ trước, không phải phạm vi của #77.
- Không phục hồi board state/nước đi của 1 ván `InProgress` bị crash giữa
  chừng — không có dữ liệu nào để phục hồi (xem "Bẫy cụ thể").
