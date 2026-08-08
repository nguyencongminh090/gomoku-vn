# #78 — Tournament Games History: lưu lịch sử từng ván đấu riêng, tách khỏi games thường

**Trạng thái:** ✅ ĐÃ XONG

Đã thêm bảng `tournament_games` (`server/db/schema.sql`) — mỗi ván đấu tournament
được ghi 1 hàng riêng (moves/walls/portals đầy đủ), tách hoàn toàn khỏi bảng
`games` của các ván ngoài giải đấu. `TournamentMatchHandler._endMatch()` gọi
`database.saveTournamentGame()` ngay tại điểm mỗi ván kết thúc — trước đây chỗ
này chỉ ghi `pairing.moves = engine.moveHistory` (bị GHI ĐÈ mỗi ván mới trong
1 series nhiều ván). 2 route REST mới (`server/routes/tournamentGames.js`):
`GET /api/tournaments/:id/games` (danh sách) và `GET /api/tournament-games/:id`
(chi tiết + moves, cùng shape với `/api/games/:id`). Trang chi tiết giải đấu
(`client/tournament.html`) có thêm tab "Lịch sử ván đấu" liệt kê từng ván, nút
"Xem lại" tái dùng nguyên vẹn replay viewer đã có (`client/js/history.js` —
`MoveTree`/`BoardRenderer`/`TreeView`) qua tham số `?source=tournament`, không
viết lại UI replay từ đầu. `npm test`: 948/948 pass (+5 test case mới trong
`TournamentMatchHandler.test.js`). Xác minh thủ công bằng Playwright thật (3
guest: 1 tổ chức + 2 người chơi, throwaway DB) — chơi xong 1 ván (đầu hàng),
tab "Lịch sử ván đấu" hiện đúng tên người chơi/kết quả/giờ kết thúc, "Xem lại"
mở replay đúng ván vừa chơi, bấm "Quay lại" đưa về đúng trang giải đấu (không
phải danh sách games thường) — 0 lỗi console trên cả 3 trang.

## Yêu cầu gốc (người dùng, 2026-08-08)

> We have database, I would like to save player history during tournament
> Tournament -> Games History
> Seperate it from Normal games (game out of tournament)
> Each tournament has it own history, store all player played games

Xác nhận phạm vi qua `AskUserQuestion`: lưu **1 hàng cho mỗi ván riêng lẻ**
(không phải 1 hàng cho cả pairing/series), và làm cả **backend + UI cơ bản**
(không chỉ lưu DB âm thầm).

## Phạm vi đã làm

- Bảng `tournament_games` mới, độc lập với `games` — dùng `tournament_id` +
  `pairing_id` + `game_index` (0-based, khớp `pairing.games[].index`) để định
  danh, và `black_entry_id`/`white_entry_id` (entry của giải đấu, không phải
  raw user id) — khác với `games` (không cần ẩn user id vì entry id đã lộ
  sẵn cho client qua `serializePairing`).
- Điểm gọi lưu duy nhất: `TournamentMatchHandler._endMatch()`, đặt KHÔNG
  điều kiện (không nằm trong nhánh `if (outcome)`) — vì `_endMatch` chỉ bao
  giờ được gọi từ 1 `GameEngine` thực sự đã kết thúc (thắng/hoà/đầu
  hàng/hết giờ); `forceCancelMatch` (huỷ giải) cố tình KHÔNG đi qua đây (đã
  ghi rõ trong chính comment của nó) — nên walkover/void-replay của tổ chức
  không bao giờ tạo ra 1 hàng `tournament_games` giả (không có ván nào thực
  sự diễn ra).
- 2 route REST mới, public (không cần đăng nhập, giống `routes/games.js`):
  danh sách nhẹ (không kèm moves) và chi tiết đầy đủ (kèm moves, cùng shape
  `GET /api/games/:id` — để replay viewer khỏi phải đổi code render).
- UI: tab mới "Lịch sử ván đấu" trên `tournament.html`, tái dùng đúng pattern
  `renderCrossTable()` đã có (build 1 chuỗi HTML, ghi `innerHTML` 1 lần).
  Nút "Xem lại" trỏ thẳng sang `history.html?id=...&source=tournament` —
  `history.js` chỉ thêm nhánh chọn endpoint theo `source`, không viết lại
  `MoveTree`/`BoardRenderer`/`TreeView`.
- `closeReplay()`/nút "Quay lại" trong `history.js`: nếu ván vừa xem đến từ
  tournament (`replayGameData.tournament_id` có giá trị), điều hướng về
  `tournament.html?id=...` thay vì về danh sách games thường (khách chưa
  từng mở) — đã xác minh đúng hành vi qua Playwright thật.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** cao — closes đúng gap người dùng chỉ ra: trước đây tournament
  hoàn toàn không có replay nào khả dụng (0 UI), và ngay cả dữ liệu thô cũng
  bị ghi đè mỗi ván mới trong 1 series.
- **An toàn:** không đụng bảng `games`/route `/api/games` hiện có (yêu cầu rõ
  "Seperate it from Normal games") — toàn bộ thay đổi là bảng/route/tab mới,
  cộng 1 đoạn code thêm vào `_endMatch` (không sửa logic sẵn có của nó).
  `history.js`'s thay đổi là additive (tham số `source` optional, mặc định
  hành vi cũ giữ nguyên cho ván thường).

## Trạng thái unit test

`server/tests/TournamentMatchHandler.test.js`, describe mới "tournament games
history (_endMatch persistence)" (5 test: five-in-a-row lưu đúng 1 hàng, đầu
hàng ghi đúng người thắng/reason, hoà (board full), guest player vẫn có
entry_id thật, series nhiều ván lưu ĐÚNG NHIỀU HÀNG không bị ghi đè). Phải tắt
`PRAGMA foreign_keys` cho riêng file test này (giải thích trong comment tại
chỗ) — file này cố tình mock `TournamentManager` nên không có row
`tournaments`/`tournament_pairings`/`tournament_players` thật để FK tham
chiếu tới; đây không phải rủi ro production vì `TournamentManager` thật luôn
tạo các row đó trước khi có pairing nào tồn tại. `npm test`: 948/948 pass.
Chi tiết đầy đủ: [docs/instruction/B78-tournament-games-history-luu-tung-van-dau-rieng.md](../instruction/B78-tournament-games-history-luu-tung-van-dau-rieng.md).
