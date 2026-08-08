# B78 — Tournament Games History (hướng dẫn thực thi)

Nguồn: yêu cầu người dùng trực tiếp, TODO.md #78 (2026-08-08). Thảo luận
thiết kế diễn ra trong phiên plan-mode (không tạo `features/<slug>/` riêng —
coi phiên đó là bước thảo luận tương đương, giống B77).

## Bối cảnh kỹ thuật (đã xác nhận qua code, không suy diễn)

Ván thường (ngoài giải đấu) đã lưu đầy đủ move history: `GameHandler.js`'s
`handleGameEnd()` build 1 object từ `GameEngine` vừa kết thúc, gọi
`database.saveGame()` → bảng `games`. Ván tournament đi qua đường hoàn toàn
khác (`TournamentMatchHandler.js` → `TournamentManager.recordPairingResult`)
— trước #78, đường này KHÔNG BAO GIỜ gọi `saveGame()`. Dấu vết duy nhất của 1
ván tournament đã kết thúc là `pairing.moves = match.engine.moveHistory`
(`TournamentMatchHandler.js` dòng 378 cũ) — 1 cột DUY NHẤT trên *pairing*,
bị GHI ĐÈ mỗi ván mới, nên 1 series nhiều ván chỉ còn lại moves của ván
cuối cùng.

## Cách làm

### 1. Bảng mới `tournament_games` (`server/db/schema.sql`)

Đặt ngay sau `tournament_pairings`, trước khối `CREATE INDEX`. Cùng shape với
`games` (moves/walls/portals/board_size/winner/reason) nhưng thêm
`tournament_id`/`pairing_id`/`game_index`, và dùng
`black_entry_id`/`white_entry_id` (FK vào `tournament_players.entry_id`) thay
vì raw user id — vì entry id đã lộ sẵn cho client (`serializePairing`), không
cần logic ẩn giống `games`/`withWinnerName`.

### 2. `server/db/database.js`

- `saveTournamentGame(...)` — sao y logic chuẩn hoá `winner` của `saveGame()`
  (so `result.winner` với `black.id`/`white.id` để ra `'BLACK'/'WHITE'/'draw'`),
  chỉ đổi cột đích từ `*_player_id` sang `*_entry_id`.
- `getTournamentGames(tournamentId)` — danh sách nhẹ, `ORDER BY started_at ASC`.
- `getTournamentGameById(id)` — đầy đủ (kèm moves/walls/portals JSON-parse),
  **và thêm `row.winner_name`** giống `withWinnerName()` tính cho `games` —
  bắt buộc phải có vì `history.js`'s `getResultTextFull()` đọc trực tiếp
  `g.winner_name`; thiếu field này thì replay tournament sẽ hiện "Người chơi"
  chung chung thay vì tên thật (bug đã bắt được và sửa ngay trong lúc code,
  trước khi verify).

### 3. `TournamentMatchHandler.js` — điểm gọi duy nhất

Trong `_endMatch(io, tournamentId, pairingId, engineResult)`, ngay sau dòng
`pairing.moves = match.engine.moveHistory;` và TRƯỚC
`tournamentState.tournamentGameMap.delete(pairingId)` — vì sau dòng đó
`match.engine` không còn dùng được nữa. `gameIndex = pairing.games.length`
(đọc TRƯỚC khi `recordPairingResult()` bên dưới push entry mới vào
`pairing.games`) — cùng công thức `startMatch()` đã dùng.

Đặt lệnh lưu **không điều kiện**, không nằm trong nhánh `if (outcome)` —
`_endMatch` chỉ bao giờ được gọi từ tmatch:move (thắng/hoà)/tmatch:resign/
tmatch:draw_accept/timeout — tất cả đều có 1 `GameEngine` thật vừa kết thúc.
`forceCancelMatch` (huỷ giải, TODO.md #59) cố tình KHÔNG gọi `_endMatch` (đã
ghi rõ trong doc comment của chính nó) — nên walkover/void-replay do tổ chức
huỷ giải sẽ không bao giờ tạo ra 1 hàng `tournament_games` giả.

### 4. REST routes — `server/routes/tournamentGames.js` mới

Mirror `routes/games.js`: public, rate-limit giống hệt. Mount ở
`server/index.js` bằng `app.use('/api', tournamentGamesRouter)` (route path
đầy đủ khai báo ngay trong router, không cần base path riêng).

### 5. Client

- `client/tournament.html`: thêm 1 cặp `sub-tabs__btn`/`sub-tab-panel` thứ 3
  ("Lịch sử ván đấu"), đúng khuôn mẫu 2 tab có sẵn.
- `client/js/tournament-detail.js`: `activateSubTab()` cũ hard-code toggle
  boolean 2 chiều — viết lại thành loop qua object `SUB_TABS` (3 tab) cho dễ
  mở rộng. Fetch danh sách games CHỈ khi tab được mở lần đầu (không fetch
  eager cùng `renderAll()` như pairings/standings, vì đây là section duy
  nhất cần REST call thay vì dùng dữ liệu socket đã có sẵn).
- `client/js/history.js`: `openReplay(gameId, source)` thêm tham số optional
  — `source==='tournament'` thì fetch `/api/tournament-games/:id` thay vì
  `/api/games/:id`, URL rewrite thành `...&source=tournament`. Init block đọc
  thêm `source` từ query string. `closeReplay()`: nếu
  `replayGameData.tournament_id` có giá trị thì điều hướng
  `tournament.html?id=...` thay vì hiện lại danh sách games thường.

### 6. Cache-busting

`?v=88` → `?v=89` (đã sửa `tournament-detail.js`, `history.js`, `i18n.js`) —
áp dụng cho MỌI `client/*.html` và MỌI `import '...?v=N'` trong
`client/js/*.js` (trừ 2 file `*-mockup.html`), theo đúng rule trong
`CLAUDE.md`.

## Bẫy cụ thể

- **`winner_name` phải tính ở server, không phải chỉ ở client** — nếu bỏ qua
  bước này, `history.js` không cần sửa gì cả (đúng như kế hoạch ban đầu) NHƯNG
  sẽ hiện sai tên người thắng khi replay 1 ván tournament — bắt được lỗi này
  khi review lại `getResultTextFull()` trước khi viết test, không phải qua
  test tự động (không có test client-side).
- **File test `TournamentMatchHandler.test.js` mock `TournamentManager` hoàn
  toàn** — không có row `tournaments`/`tournament_pairings`/
  `tournament_players` thật nào được tạo cho các id giả `'t1'`/`'p1'`/`'e1'`/
  `'e2'` dùng xuyên suốt file. `tournament_games`'s FK columns sẽ chặn MỌI
  `saveTournamentGame()` nếu không tắt `PRAGMA foreign_keys` cho riêng file
  test này — đã xác nhận qua chạy thử (16 test cũ vốn đang pass bỗng fail
  toàn bộ với `SqliteError: FOREIGN KEY constraint failed` cho tới khi tắt
  pragma). Đây không phải rủi ro production — `TournamentManager` thật luôn
  tạo các row cha trước khi có pairing.
- **File test này share 1 `:memory:` DB xuyên suốt cả file** (không reset
  giữa các test, quy ước có sẵn) — phải tự `DELETE FROM tournament_games`
  trong `beforeEach` của describe block mới, nếu không `getTournamentGames('t1')`
  sẽ lẫn cả kết quả của những test chạy trước đó trong cùng file (đã bắt
  được lỗi này khi chạy thử lần đầu — 4/5 test fail vì đếm nhầm số hàng).
- **Xác minh thủ công cần `CORS_ORIGIN` env var** khi khởi `node
  server/index.js` để test — thiếu biến này thì mọi kết nối socket.io bị
  chặn âm thầm (client hiện "Đang online: 0", mọi hành động qua socket
  không có phản hồi, không có lỗi console nào) — trùng khớp với memory đã
  ghi từ trước (`project_cors_origin_required.md`), không phải bug mới của
  #78.
- **Nút "Xác nhận giờ"/"Đầu hàng" trên UI dùng `confirm()`/`alert()` native**
  — script Playwright verify phải đăng ký handler `page.on('dialog', ...)`
  và gọi `accept()`, nếu không các nút này im lặng không có tác dụng (không
  phải bug — hành vi UI có chủ đích, chỉ là điều cần biết khi viết script
  test thủ công).

## Không thuộc phạm vi (đừng gộp vào task này)

- Không đổi bảng/route `games`/`/api/games` hiện có cho ván thường — người
  dùng yêu cầu rõ "Seperate it from Normal games".
- Không thêm phân trang cho danh sách games của 1 giải đấu — số ván trong 1
  giải (số vòng × số cặp × độ dài series) đủ nhỏ để trả về hết 1 lần; thêm
  phân trang khi thực tế cần, không làm trước.
- Không đổi cách `history.js` hiển thị/điều hướng cho ván THƯỜNG (source
  mặc định `undefined`/không phải `'tournament'`) — mọi thay đổi ở file này
  chỉ additive qua tham số `source` optional.
