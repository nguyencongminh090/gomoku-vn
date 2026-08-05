# B48. Tournament (Tables & Tournaments) — từ yêu cầu người dùng, thảo luận 2026-08-04

### B48. Tournament (Tables & Tournaments) — từ yêu cầu người dùng, thảo luận 2026-08-04

**Nguồn:** không phải từ review bên ngoài — người dùng tự đề xuất tính năng
Tournament, đã thảo luận nhiều vòng (mode Swiss/Round robin/Double
Elimination, time management kiểu World Blitz Cup, vai trò Organizer),
chốt tên gọi "Tables & Tournaments", duyệt blueprint layout, rồi yêu cầu
dựng mockup front-end trước khi làm thật.

## Tài liệu nguồn — đọc theo thứ tự này trước khi code bất kỳ dòng nào

1. `features/tournament/user_story.md` — actor (Organizer, Player), user
   stories, rule cấu hình được, và **ràng buộc kiến trúc cứng: Tournament
   phải tách biệt khỏi casual game session** (không tái dùng
   `GameHandler`/`RoomHandler` nguyên trạng).
2. `features/tournament/diagram/uml_diagram/sequence-match-scheduling.md` —
   sequence diagram luồng tự-thoả-thuận lịch giữa 2 người chơi → báo server
   → check-in → server tính giờ + kết quả.
3. `features/tournament/diagram/state-diagram-match-lifecycle.md` — state
   machine đầy đủ của 1 cặp đấu (Paired → Negotiating → Reported → Ready →
   InProgress/Walkover/DoubleNoShow → Completed), kèm class diagram khái
   niệm (KHÔNG phải schema cuối cùng).
4. `features/tournament/planning.md` — **10 câu hỏi mở, bắt buộc phải được
   người dùng trả lời trước khi thiết kế data model/API thật.** Đừng tự suy
   đoán câu trả lời rồi code — mỗi câu trả lời sai sẽ kéo theo phải sửa lại
   schema/API đã viết.
5. `client/tables-tournaments-mockup.html` (nhánh
   `feature/tables-tournaments-mockup`, branch off `dev`) — mockup tĩnh đã
   duyệt: tab switcher "Bàn chơi"/"Giải đấu" ngay dưới header, sidebar
   "Đang online" giữ nguyên xuyên suốt 2 tab, tab Giải đấu có filter
   row (trạng thái + thể thức) và card giải đấu (tên, badge thể thức,
   trạng thái, số người chơi, organizer, dòng trạng thái riêng cho người
   xem). Đã áp dụng: touch target 44px, `focus-visible` ring, card có
   `tabindex="0"` + `role="link"` + `aria-label` cho keyboard nav,
   spacing theo lưới 4px, `prefers-reduced-motion`. Đã verify bằng
   Playwright ở light/dark theme, keyboard-tab focus, viewport 390px —
   **coi các quyết định UI này là đã chốt, không thiết kế lại từ đầu.**

## Quyết định đã chốt — không cần hỏi lại

- Tên gọi tính năng: **"Tables & Tournaments"**.
- Vị trí trong UI: 1 trang Lobby duy nhất, tab switcher (không phải route
  `/tournaments` riêng) — xem lý do trade-off đã thảo luận (giữ tất cả
  trong 1 URL, tái dùng sidebar/actions).
- Bảng màu: **dùng nguyên token hiện có** (`--c-brand: #4F46E5` v.v. trong
  `client/css/main.css`) — đã đối chiếu với bộ màu tham chiếu SaaS/dashboard
  của skill `ui-ux-pro-max` (`#2563EB`/`#3B82F6` "trust blue") và xác nhận
  brand indigo hiện tại của site đã đúng convention, **không cần đổi màu**.
  Không áp bảng màu "gaming/neon" (`#7C3AED` nền tối, Russo One) mà skill đề
  xuất cho từ khoá "gaming tournament" — sai tông với phần còn lại của site.

## Bẫy cụ thể — dễ làm sai nếu không đọc kỹ

- **Đừng tái dùng `RoomManager.createRoom()`/`GameHandler` cho session
  tournament match.** Ràng buộc kiến trúc đã ghi rõ trong `user_story.md` —
  tournament match có thể tái dùng primitive cấp thấp hơn (`TimerManager`
  cho đồng hồ trong ván) nhưng session/state phải là của riêng tournament.
- **Đừng tự quyết định nghĩa "overtime (by date)"** (per-round/per-match/
  per-tournament) hay **"punishment"** — đây là 2 trong 10 câu hỏi mở, sai
  1 trong 2 sẽ làm sai toàn bộ walkover logic.
- **CSS mới cho tab/card mockup đang nằm inline trong chính
  `client/tables-tournaments-mockup.html`**, cố ý không đưa vào
  `client/css/lobby.css` — khi tính năng chuyển sang triển khai thật (nối
  vào `index.html`/`lobby.js` production), **lúc đó mới** tách các rule đó
  ra file css thật dưới `client/css/` và **nhớ bump `?v=N`** theo rule
  `CLAUDE.md` (rule này chưa áp dụng cho giai đoạn mockup vì mockup không
  nằm trong bundle versioned).
- **Đừng xoá banner cảnh báo mockup** (`.mock-banner`) cho tới khi trang
  thật sự được nối logic — đây là dấu hiệu duy nhất phân biệt file mockup
  với trang production trong `client/`.

## Thứ tự đề xuất khi bắt đầu làm thật (sau khi câu hỏi mở đã được trả lời)

1. Chốt câu trả lời cho 10 câu hỏi mở → cập nhật `features/tournament/planning.md`
   (ghi thêm, không sửa đè quyết định cũ — xem rule append-only tương tự
   `docs/fix-log.md` nếu áp dụng được).
2. Thiết kế data model thật (không phải class diagram khái niệm trong
   `state-diagram-match-lifecycle.md`) — quyết định SQLite schema mới trong
   `server/db/schema.sql`.
3. Viết socket handler tournament mới (không sửa `GameHandler`/`RoomHandler`
   hiện có ngoài các điểm tích hợp tối thiểu cần thiết).
4. Nối UI: chuyển nội dung đã duyệt trong
   `client/tables-tournaments-mockup.html` vào `client/index.html` thật +
   `client/js/lobby.js`, tách CSS mockup ra `client/css/` + bump `?v=N`.
5. Viết Jest test cho toàn bộ state transition (bám theo case table trong
   `state-diagram-match-lifecycle.md`) trước khi coi là xong — theo rule
   "Writing comprehensive test cases" trong `CLAUDE.md`.
6. Tiếp tục làm trên `feature/tables-tournaments-mockup` (hoặc branch
   `feature/tournament-*` mới nếu tách nhỏ hơn) — branch off `dev`, merge
   `dev` khi ổn định, theo git workflow đã có trong `CLAUDE.md`.

---

## Cập nhật 2026-08-05 — kiến trúc 6-phase đã chốt, Phase 1 đã xong

10 câu hỏi mở đã được người dùng trả lời (xem `features/tournament/planning.md`
"Resolved decisions"). Implementation được chia thành **6 phase độc lập, làm
từng phase một, có check-in với người dùng sau mỗi phase** (người dùng chọn
rõ "phase by phase" thay vì làm hết một lượt) — không tự ý gộp phase để "cho
nhanh". Toàn bộ kiến trúc chi tiết (thuật toán pairing từng thể thức, cách
enforce deadline không dùng 1 timer/pairing, cách match session tách khỏi
`RoomManager`/`GameHandler`) nằm trong plan file gốc của phiên làm việc —
tóm tắt lại đây phần liên quan tới từng phase để không cần đọc lại toàn bộ
lịch sử hội thoại.

**2 diễn giải đã ghi nhận rõ (không phải suy đoán ngầm):**
- `Reported → Ready` tự động khi 2 bên đồng thuận thời gian; chỉ chuyển qua
  organizer khi có tranh chấp (dispute). Nhãn "Organizer confirms..." trong
  state diagram chỉ áp dụng cho nhánh dispute, không áp dụng cho happy path
  (đối chiếu với sequence diagram — P2 tự confirm thẳng, không qua organizer).
- Quyết định 2 (1 deadline/match) được hiện thực bằng 1 field
  `pairing.deadline` duy nhất; khi deadline tới mà pairing chưa `InProgress`,
  kết quả rẽ nhánh theo sub-state hiện tại (chưa ai ready → walkover/void-replay
  theo quyết định 1/5; đang dispute chưa giải quyết → bắt buộc organizer xử lý).

**3 quyết định nhỏ tự đưa ra (không thuộc 10 câu hỏi gốc — sẽ để người dùng
sửa lại ở check-in nếu không đúng ý):**
- Organizer được phép tự đăng ký làm Player trong chính giải đấu mình tạo
  (user story không cấm) — đã có test riêng cho case này.
- Organizer duyệt đổi lịch chỉ đổi `agreedTime`, **không** reset lại deadline
  gốc — deadline vẫn neo theo `pairedAt` ban đầu (đúng tinh thần quyết định 2
  "per-match window từ lúc ghép cặp", không phải từ lần reschedule gần nhất).
- Xử lý mất kết nối giữa chừng ván tournament: để ngỏ tới Phase 4 (socket
  layer), không đoán trước ở Phase 1-3.

### Phase 1 — ĐÃ XONG (nhánh `feature/tournament-server`, branch off `dev`)

CRUD + đăng ký giải đấu, **chưa có** pairing/round generation (đó là Phase 3),
**chưa có** socket handler (Phase 4), **chưa có** UI (Phase 5).

- `server/db/schema.sql` — 4 bảng mới: `tournaments`, `tournament_players`
  (guest-tolerant, `entry_id` là PK thật vì `player_id` có thể null),
  `tournament_rounds`, `tournament_pairings` (state machine đầy đủ 9 trạng
  thái). Khác với `rooms` (chỉ lưu RAM), tournament được persist **từ lúc
  tạo**, không chỉ lúc kết thúc — vì lịch sử pairing cần cho việc giải quyết
  tranh chấp/audit của organizer sau này.
- `server/db/database.js` — thêm `createTournament`, `getTournamentById`,
  `updateTournamentStatus`, `saveTournamentPlayer`, `deleteTournamentPlayer`,
  `getTournamentPlayers`. Chưa thêm `savePairing`/`getPairingsByTournament` —
  để dành cho Phase 3 khi pairing thật sự tồn tại (tránh code chết).
- `server/config.js` — thêm `TOURNAMENT_FORMATS`, `DEFAULT_SCHEDULING_WINDOW_MS`
  (48h, override qua env `TOURNAMENT_SCHEDULING_WINDOW_MS`), `DEFAULT_TIEBREAK_RULE`
  (`'buchholz_sonneborn_berger'`, theo quyết định 9).
- `server/managers/tournament/TournamentManager.js` (mới) — singleton
  `EventEmitter`, giống hệt hình dạng `RoomManager` nhưng **hoàn toàn tách
  biệt** (không đụng `RoomManager.rooms`/`userRoomMap`). Khác biệt quan
  trọng: `userTournamentMap` là `Map<userId, Set<tournamentId>>` (không phải
  1-1 như `RoomManager`) vì quyết định 6 cho phép 1 người tham gia nhiều giải
  đấu cùng lúc. `startTournament()` hiện chỉ là stub (chuyển status →
  `active`, chưa sinh pairing) — có comment TODO trỏ rõ tới Phase 3.
- `server/tests/TournamentManager.test.js` (mới) — 38 test case, bao gồm
  boundary test cho `timerSeconds` (4/5/3600/3601), quyết định 6 (đăng ký
  đồng thời nhiều giải đấu), organizer-cũng-là-player, double-registration,
  unregister-chưa-từng-đăng-ký (không throw). Theo đúng convention
  `save-game.test.js`: mock `better-sqlite3` sang `:memory:` để chạy schema
  thật + `jest.useFakeTimers()` để tránh treo worker do
  `database.js`'s hourly WAL-checkpoint interval.
- **Lưu ý sửa lúc code:** `schema.sql`'s `tournaments.organizer_id` ban đầu
  viết nhầm là `NOT NULL` — sai với quy ước guest-tolerant của `games.*_player_id`
  (organizer là khách thì phải cho phép null). Đã sửa thành nullable.
- `npm test` (toàn bộ suite): **539/539 xanh**, không có regression.

### Phase 2 — ĐÃ XONG (cùng nhánh `feature/tournament-server`)

3 thuật toán pairing/bracket + standings/tiebreak, **hàm thuần** (pure
function), không I/O, không phụ thuộc `TournamentManager`'s Maps — tách
biệt hoàn toàn để test độc lập.

- `server/managers/tournament/pairing/swiss.js` — `generateNextRound(standings)`.
  Score-group/fold pairing đơn giản hoá (không phải FIDE Dutch đầy đủ — cân
  bằng màu quân không áp dụng ở đây vì màu đến từ luật Swap2 của
  `GameEngine`, không phải từ pairing). Tránh đấu lại (rematch avoidance) +
  bye tối đa 1 lần/người + score-group lẻ float xuống nhóm dưới.
- `server/managers/tournament/pairing/roundRobin.js` — `generateAllRounds(players)`.
  Circle method, sinh **toàn bộ lịch một lần** (khác Swiss/DE vì lịch RR
  không phụ thuộc kết quả).
- `server/managers/tournament/pairing/doubleElim.js` — `generateBracket(players)`
  + `resolveBracket(bracket, results)` + `needsBracketReset(bracket, results)`.
  Bracket là **slot-graph tĩnh** dựng sẵn toàn bộ (mọi trận mọi vòng, winners +
  losers + grand final) bằng tham chiếu id (`{type:'winner'|'loser', matchId}`)
  — chưa cần biết kết quả thật. `resolveBracket` mới đệ quy tra ra người chơi
  thật từ 1 map kết quả. Seed theo thuật toán chuẩn (`computeSeedOrder`) giữ
  seed1/seed2 tách nhau tới chung kết; field không phải luỹ thừa 2 được đệm
  bằng seed ảo (phantom) — do seed ảo luôn rơi vào seed số cao nhất trong thứ
  tự ghép, **bye tự động rơi vào top seed** (đúng ý đồ thiết kế).
- `server/managers/tournament/standings.js` — `computeStandings`,
  `computeTiebreaks` (Buchholz + Sonneborn-Berger, quyết định 9),
  `rankStandings` (tie thật sự — giống hệt cả 3 chỉ số — giữ nguyên đồng
  hạng, không tự ý phá tie).
- 4 file test mới dưới `server/tests/pairing/` (46 test case): boundary
  N=0/1/2 cho từng thuật toán, bye/rematch-avoidance cho Swiss, exhaustive
  pairwise coverage cho Round robin, walkthrough đầy đủ 8 người cho Double
  Elimination (xác nhận đúng vị trí rớt xuống losers bracket + bracket-reset
  đúng điều kiện), Buchholz/SB đối chiếu tính tay.
- `npm test` (toàn bộ suite): **585/585 xanh**, không regression.

Phase 3-6 (state machine + deadline sweep, socket handler, client UI wiring)
**chưa bắt đầu** — chờ người dùng xác nhận Phase 2 trước khi tiếp tục, đúng
như lựa chọn "phase by phase, check in after each".

---
