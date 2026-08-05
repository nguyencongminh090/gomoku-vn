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

### Phase 3 — ĐÃ XONG (cùng nhánh `feature/tournament-server`)

State machine đầy đủ + deadline sweep + tích hợp `TimerManager` +
`TournamentManager.startTournament()`/round-advancement thật (không còn
stub). Đây là phase nặng nhất tới giờ — 3 bug thật phát hiện và sửa ngay
trong lúc code (không phải sau khi merge):

- **Bug 1 — FK sai:** `tournaments.organizer_id` ban đầu viết `NOT NULL`,
  sai với guest-tolerant convention (`games.*_player_id` cho phép null).
  Đã sửa (ghi lại ở Phase 1's note, chỉ nhắc lại vì liên quan).
- **Bug 2 — `_sweep` không thể spy được:** `setInterval(_sweep, ...)` bind
  thẳng vào function reference tại thời điểm require, khác với
  `RoomManager`'s `setInterval(() => this._idleCleanup(), ...)` (late-bind
  qua `this`). Test spy trên export không chặn được lệnh gọi thật của
  interval. Sửa: `setInterval(() => module.exports._sweep(), ...)`.
- **Bug 3 — pairingId đụng độ giữa các giải Double Elimination (nghiêm
  trọng nhất, phát hiện qua test, không phải qua đọc code):** id trận đấu
  của DE ('W1M1', 'GF', 'GF_RESET'...) đến từ Phase 2's bracket engine —
  cùng 1 tên cho MỌI giải đấu dùng thể thức này, không global-unique. Vì
  `this.pairings` (Map toàn cục), `tournamentState`'s Map, và
  `tournament_pairings.id` (PRIMARY KEY trong SQLite) đều dùng thẳng
  pairingId làm key/PK, 2 giải Double Elimination chạy đồng thời sẽ **ghi
  đè lẫn nhau** (`ON CONFLICT DO UPDATE` càng làm việc này âm thầm, không
  báo lỗi). Sửa bằng `_deId(tournament, localMatchId)` — pairingId thật sự
  dùng khắp nơi (DB, `this.pairings`, `tournamentState`) là
  `${tournamentId}:${localMatchId}` (vd `"<uuid>:W1M1"`); `tournament.bracketResults`
  và mọi lệnh gọi vào `resolveBracket`/`needsBracketReset` (Phase 2, thuần
  hàm) vẫn giữ nguyên namespace LOCAL không đổi — chỉ pairing object mới có
  `pairing.bracketMatchId` lưu tên local để map ngược lại.

**Các file mới:**
- `server/managers/tournament/PairingLifecycle.js` — state machine (9
  trạng thái), 12 hàm chuyển trạng thái (report/confirm/dispute/
  organizerResolve/organizerAdjust/requestReschedule/approve/deny/
  markReady/resolveDeadline), mỗi hàm nhận id "người có quyền" làm tham số
  tường minh (không tự tra cứu tournament) để test độc lập không cần mock
  `TournamentManager`.
  - **Diễn giải đã ghi nhận:** `Reported → Ready` tự động khi 2 bên đồng ý
    (không qua organizer) — chỉ nhánh dispute mới cần organizer.
  - **Quyết định nhỏ mới phát sinh khi code (chưa có trong 10 câu hỏi
    gốc):** khi 1 pairing bị đánh dấu `overdue` (hết hạn giữa lúc tranh
    chấp chưa giải quyết) rồi organizer mới resolve, pairing được cấp
    **deadline mới** (từ lúc resolve, không phải deadline cũ đã hết hạn) —
    nếu không, sweep sẽ lập tức void/replay lại ngay tick kế tiếp, vô hiệu
    hoá hoàn toàn hành động can thiệp của organizer.
- `server/socket/tournamentState.js` — `tournamentTimerMap`,
  `pendingDeadlines`, sweep interval (`config.TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS`,
  mặc định 10s), `setDeadlineHandler()` (TournamentManager cài callback vào
  đây lúc khởi tạo — 1 chiều, `tournamentState.js` không bao giờ require
  `TournamentManager` để tránh circular require).
- `server/managers/tournament/TournamentManager.js` (sửa) —
  `startTournament()` giờ sinh pairing vòng 1 thật cho cả 3 thể thức;
  `recordPairingResult()`, `markPairingReady()`, và 7 wrapper khác
  (report/confirm/dispute/organizerResolve/organizerAdjust/
  requestReschedule/approve/denyReschedule) tra `userId → entryId` rồi gọi
  `PairingLifecycle`; `_advanceIfRoundComplete()` (Swiss/Round robin) +
  `_syncDoubleElimPairings()` (Double Elimination, pull-based: gọi lại
  `resolveBracket` mỗi khi có kết quả mới, tự động phát hiện trận nào vừa
  đủ 2 người chơi — kể cả cascade bye→bye ở losers bracket) đảm nhiệm việc
  sinh vòng/trận kế tiếp.
  - **Void/replay (quyết định 5) khác nhau theo thể thức:** Swiss/Round
    robin sinh pairingId MỚI (không có gì tham chiếu id cũ). Double
    Elimination **reset lại chính pairing cũ, cùng id** — vì các trận khác
    trong bracket tham chiếu tới id đó, không thể đổi.
  - **Xếp hạng cuối Double Elimination:** chỉ chính xác cho hạng 1
    (champion) và hạng 2 (runner-up, quyết định trực tiếp từ trận chung
    kết/reset) — xếp hạng đầy đủ hạng 3 trở xuống cần theo dõi độ sâu bị
    loại ở losers bracket, **để ngỏ ngoài phạm vi phase này**, ghi rõ TODO
    trong code thay vì suy đoán bằng điểm số (không có ý nghĩa xếp hạng cho
    thể thức này).
- 3 file test mới: `PairingLifecycle.test.js` (44 case — bảng quyết định
  đầy đủ mọi chuyển trạng thái hợp lệ/không hợp lệ, nhánh walkover-vs-
  void/replay, non-organizer-bị-từ-chối viết TRƯỚC theo đúng class bug đã
  gặp 2 lần ở phòng thường `TODO.md #33`/`#34`), `tournamentDeadlineSweep.test.js`
  (9 case — cadence từ config với sentinel, giống hệt `RoomManager.test.js`),
  và mở rộng `TournamentManager.test.js` thêm 16 case tích hợp (sinh pairing
  vòng 1 đúng cho cả 3 thể thức, full walkthrough round-robin 3 người +
  double-elim 4 người bao gồm cả bracket-reset, deadline-sweep-driven
  walkover/void-replay/reset-in-place qua fake timers).
- `npm test` (toàn bộ suite): **654/654 xanh**, không regression.

Phase 4-5 (socket handler `TournamentHandler.js`, client UI wiring vào
`index.html`/`lobby.js` thật) **chưa bắt đầu** — chờ người dùng xác nhận
Phase 3 trước khi tiếp tục.

---

## Phase 4 — Socket handler layer (`TournamentHandler.js` + `TournamentMatchHandler.js`) — ĐÃ XONG (2026-08-05)

Branch `feature/tournament-server`. Không đổi gì ở Phase 1-3's public API ngoài
các bổ sung nêu dưới; `npm test` toàn bộ suite: **713/713 xanh**, không
regression.

**Các file mới:**
- `server/socket/handlers/TournamentHandler.js` — domain quản lý giải đấu:
  `tournament:subscribe/unsubscribe` (join/leave `tournament-lobby`, diff+
  debounce `tournament:list_patch` giống hệt `_diffLobbyRooms`/
  `broadcastLobbyUpdate` ở `state.js`, đặt local trong file này vì
  `tournamentState.js` không được phép require `TournamentManager` ngược
  lại — xem header của file đó), `tournament:create/register/unregister/
  start/get/leave_room`, và 9 action lịch trình pairing
  (report_time/confirm_time/dispute_time/organizer_resolve/
  organizer_adjust/request_reschedule/approve_reschedule/deny_reschedule/
  ready) — mỗi action chỉ forward `userId` vào wrapper tương ứng của
  `TournamentManager`, không tự làm authorization (đã làm ở tầng manager).
  - `init(io)` (gọi 1 lần lúc khởi động, không phải mỗi kết nối) lắng nghe
    3 event `TournamentManager` phát ra (`tournament_started`,
    `tournament_completed`, `pairing_changed`) rồi mới thật sự `io.to(...)
    .emit(...)` — đây là **điểm broadcast DUY NHẤT** cho mọi thay đổi
    pairing, kể cả những thay đổi tự động (deadline sweep walkover/
    void-replay, Double Elimination bracket auto-sync) không có socket
    call site nào để tự broadcast. Nhờ vậy handler action ở trên không cần
    tự gọi broadcast sau mỗi lần gọi manager — chỉ cần gọi đúng, phần còn
    lại tự động.
- `server/socket/handlers/TournamentMatchHandler.js` — domain gameplay
  thật một khi pairing vào `InProgress`: `tmatch:move/swap2_place/
  swap2_choice/resign`, dùng `GameEngine` trực tiếp (không qua
  `GameHandler.js`/`RoomManager` — đúng ràng buộc kiến trúc "tách khỏi
  casual game" từ `user_story.md`). Room Socket.io riêng
  `tournament-match:<pairingId>`, tách biệt hoàn toàn khỏi `roomId`-keyed
  rooms của phòng thường.
  - `startMatch(io, tournamentId, pairingId)` — được `TournamentHandler.
    init()`'s `pairing_ready` listener gọi (event mới, phát ra từ
    `TournamentManager.markPairingReady()` khi cả 2 người check-in xong).
    Sinh bàn cờ/tường/cổng y hệt `GameHandler.startGame()` (dùng lại
    `WallGenerator`/`PortalGenerator`, cùng vòng lặp retry 1000 lần), rồi
    `new GameEngine(...)`.
  - `resyncOnConnect(io, socket)` — được `SocketHandler.js` gọi ở mọi kết
    nối, y hệt khối reconnect `existingRoom` cho phòng thường: nếu user có
    trận tournament đang sống, tự join lại room + gửi `tmatch:init`.
  - **Bug thật phát hiện lúc code (không phải review):** `PairingLifecycle.
    markReady()` (Phase 3) tạo `TimerManager` với
    `blackPlayerId: player1EntryId, whitePlayerId: player2EntryId` —
    **entryId, không phải userId** — vì lúc đó chưa có `GameEngine` để biết
    userId thật. Nếu `onTimeout` gọi thẳng `engine.handleTimeout(entryId)`
    thì sai hoàn toàn (GameEngine so khớp theo `userId`). Sửa: `_handleTimeout`
    dịch `entryId → userId` qua `match.userIdByEntry` (map dựng lúc
    `startMatch`) trước khi gọi `engine.handleTimeout()`. Đồng thời màu
    quân được gán khớp với quy ước của timer: `player1EntryId` luôn là
    "black slot" nên `entry1` luôn nhận `color: 'BLACK'` (và ngược lại cho
    Swap2, nơi `entry1`/`entry2` đóng vai `firstPlayerId`/`secondPlayerId`).
  - `timer.onTimeout` **không** được gán lúc `TimerManager` khởi tạo (Phase
    3's `markReady()` không biết `GameEngine` sẽ dựng lúc nào) — `startMatch`
    gán trực tiếp `timer.onTimeout = fn` như một field thường (TimerManager
    không có setter riêng, đây là cách `_tick()` đã set sẵn từ trước) ngay
    sau khi lấy timer từ `tournamentState.tournamentTimerMap`.
- `server/managers/tournament/TournamentManager.js` (sửa) — thêm
  `serializePairing()` (chuyển `readyPlayers` Set → array cho socket.io),
  event `pairing_ready` (phát khi `markPairingReady()` đạt `bothReady`) và
  `pairing_changed` (phát ở **mọi** điểm pairing thay đổi — 8 wrapper action,
  `_handlePairingDeadline`, `_createAndRegisterPairing`,
  `_createReplayPairing` — qua helper `_emitPairingChanged()`).
  - **Quyết định nhỏ mới:** `recordPairingResult(tournamentId, pairingId,
    outcome)` giờ nhận `outcome` là entryId thắng **hoặc** chuỗi `'draw'`
    (Phase 2's `standings.js` vốn đã hỗ trợ `winner: 'draw'` trong
    `completedPairings`, nhưng Phase 3 chưa từng expose đường dẫn để gọi
    nó — lỗ hổng lộ ra ngay khi wiring gameplay thật ở Phase 4, vì cờ
    caro/gomoku có thể hoà khi đầy bàn). Double Elimination không có chỗ
    cho 1 trận hoà (bracket cần người thắng dứt khoát) — hoà ở thể thức
    này được xử lý như `DoubleNoShow`: void + tạo pairing replay mới, tái
    dùng nguyên `_createReplayPairing()` đã test kỹ ở Phase 3 (quyết định
    5) thay vì viết luồng riêng.
- `server/socket/tournamentState.js` (sửa) — thêm
  `tournamentGameMap: Map<pairingId, {engine, tournamentId, entryByUserId,
  userIdByEntry}>`, dọn trong `shutdown()`.
- `server/socket/SocketHandler.js` (sửa) — require 2 handler mới;
  `TournamentHandler.init(io)` gọi 1 lần ở đầu `init()`; 2 handler
  `.register(io, socket)` ở cuối khối "Wire domain handlers"; thêm
  `TournamentMatchHandler.resyncOnConnect(io, socket)` ngay trước đó (cùng
  chỗ với khối reconnect `existingRoom` của phòng thường).
- 2 file test mới:
  - `TournamentHandler.test.js` (47 case) — mock toàn bộ `TournamentManager`
    (như `LobbyHandler.test.js` mock `RoomManager`), test tầng dịch
    socket-event → manager-call: validate payload thiếu field, forward
    đúng tham số + đúng thứ tự, propagate lỗi (kể cả `ORGANIZER_ONLY`/
    `NOT_A_PARTICIPANT`) thành `tournament:error` mà **không** phát broadcast
    nào, và test riêng phần wiring event của `init(io)`
    (`tournament_started`/`tournament_completed`/`pairing_changed` →
    đúng room, đúng payload, an toàn khi pairing/tournament đã biến mất).
  - `TournamentMatchHandler.test.js` (12 case) — mock `TournamentManager`
    + `findSocketsByUserId`, nhưng dùng **`GameEngine` thật** (không mock)
    để test genuine: người ngoài cuộc bị chặn, đi sai lượt bị engine từ
    chối, 5 quân thẳng hàng → `tmatch:ended` + `recordPairingResult` đúng
    entryId thắng, resign → đối thủ thắng, bàn 4×4 lấp đầy (không thể có 5
    liên tiếp trên bàn rộng 4 ô → hoà chắc chắn, xác định được) →
    `outcome:'draw'`, timeout qua `timer.onTimeout` → đúng người thua cuộc,
    và `resyncOnConnect` cho người chơi có trận sống vs. người ngoài cuộc.
- `server/tests/SocketHandler.test.js` (sửa) — mock thêm 2 handler mới
  (giống các handler khác đã mock sẵn trong file này), vì file này gọi
  `init(io)` ~15 lần trong các test case khác nhau — không mock sẽ khiến
  `TournamentManager` (singleton EventEmitter thật) tích luỹ listener thật
  qua từng lần gọi, gây `MaxListenersExceededWarning` (phát hiện thật khi
  chạy `npm test` lần đầu sau khi thêm `TournamentHandler.init()`).

**Phạm vi cố tình bỏ qua ở Phase 4** (ghi rõ thay vì âm thầm bỏ sót — xem
`TournamentMatchHandler.js`'s header comment):
- Đề nghị hoà (`game:draw_offer/accept/decline`) và xin thêm giờ
  (`game:request_time/...`) của `GameHandler.js` **không** được port sang
  `tmatch:*` — trận vẫn kết thúc đúng khi thắng tự nhiên/hết bàn cờ/đầu
  hàng/hết giờ (đủ cho quyết định 1 "chỉ thua ván"). Đây là tiện ích chơi
  thường, không nằm trong 10 quyết định đã khoá, để lại làm việc sau nếu
  cần.
- Không lưu `games` table cho trận tournament (khác phòng thường) — bảng
  đó gắn với `roomId` thật của 1 `Room`, còn trận tournament không có
  `Room`. Lịch sử nước đi được lưu trực tiếp vào `tournament_pairings.moves`
  (cột đã có sẵn từ Phase 1's schema nhưng chưa từng được set — `_endMatch`
  giờ gán `pairing.moves = engine.moveHistory` trước khi gọi
  `recordPairingResult()`).

Phase 5 (client UI wiring vào `index.html`/`lobby.js`/`tournaments.js` thật)
**chưa bắt đầu** — chờ người dùng xác nhận Phase 4 trước khi tiếp tục.

---

## Phase 5 — Client UI wiring (tab switcher + tournament list + create/register) — ĐÃ XONG (2026-08-05)

Branch `feature/tournament-client` (off `dev`, sau khi `feature/tournament-server` và
`feature/tables-tournaments-mockup` đã merge vào `dev`). `npm test`: **714/714 xanh**.
Xác minh thật bằng Playwright (guest login → tạo giải đấu → giải đấu thứ 2 đăng ký/huỷ
đăng ký, 2 browser context riêng biệt) — 0 lỗi console/page, mọi bước phản ánh đúng
trên UI theo thời gian thực qua `tournament:list_patch`.

**Phạm vi (khớp đúng những gì mockup đã duyệt — không thêm UI chưa được thiết kế):**
tab switcher Bàn chơi/Giải đấu, danh sách thẻ giải đấu (từ `tournament:list`/
`tournament:list_patch`), bộ lọc trạng thái + thể thức (lọc phía client trên dữ liệu đã
có, không gọi server), modal Tạo giải đấu (→ `tournament:create`), nút Đăng ký/Huỷ đăng
ký (→ `tournament:register`/`unregister`), nút Bắt đầu cho organizer khi `playerCount >= 2`
và `status === 'draft'` (→ `tournament:start`).

**Cố tình để ngoài phạm vi Phase 5** (ghi rõ trong header comment của
`tournaments.js`, không phải bỏ sót): trang chi tiết giải đấu/bracket/bảng xếp hạng, UI
lịch trình cặp đấu (báo giờ/xác nhận/tranh chấp/check-in — `tournament:report_time` v.v.,
đã có ở Phase 4 nhưng chưa có UI), và bàn cờ chơi thật cho `tmatch:*`. Không cái nào trong
số này từng được mock — xây bây giờ là tự thiết kế UI chưa qua duyệt, vi phạm quy trình
"mockup trước, code sau" mà người dùng đã thiết lập. Đây là việc **Phase 6** trong tương
lai, cần mockup riêng trước khi triển khai.

**Lỗ hổng dữ liệu phát hiện khi wiring (không phải bug — API Phase 1-4 đơn giản là chưa
cần các field này cho tới khi có UI thật):**
- `TournamentManager.listTournaments()` trước đây chỉ trả `{tournamentId, name, format,
  organizerId, playerCount, status}` — không đủ để client tự tính "bạn đã đăng ký"/"bạn
  là người tổ chức" cho mỗi thẻ mà không gọi `tournament:get` cho từng giải đấu một. Thêm
  `entryUserIds: string[]` (danh sách userId đã đăng ký) vào cả `listTournaments()` lẫn
  `serializeTournament()`.
- Tournament object không lưu `organizerName` (chỉ có `organizerId`) — không hiện được
  "Tổ chức bởi X" như mockup. Thêm `organizerName` (lưu tại `createTournament()`, giống
  cách `RoomManager` lưu `hostName` cạnh `hostId`) — **chỉ lưu trong bộ nhớ, không có cột
  DB mới**, vì tính năng này chưa có đường khôi phục từ DB sau khi restart server (giống
  hệt giới hạn đã có từ Phase 1).
- Cả 2 field được thêm test mới trong `TournamentManager.test.js` (assert trực tiếp trên
  field, không phải `toEqual` nguyên object, nên không phá test cũ nào).

**Các file mới:**
- `client/js/tournaments.js` — controller cho tab Giải đấu: tab switching, subscribe
  `tournament:subscribe` (không cần đợi user bấm tab — cùng kiểu với `lobby.js`'s
  `lobby:subscribe` không điều kiện), render danh sách/thẻ, modal tạo giải đấu (đọc form
  y hệt cấu trúc `lobby.js`'s `readFormSettings()`, kể cả 2 interlock Swap2⇄wall/portal và
  Blitz⇄increment), đăng ký/huỷ đăng ký/bắt đầu. **Reuse đúng 1 kết nối socket.io** — import
  `client` từ `lobby.js` (xem export mới bên dưới) thay vì tự tạo `SocketClient` thứ 2 (sẽ
  tự đá chính mình ra do luật "1 phiên/tài khoản" phía server).

**Các file sửa:**
- `client/js/lobby.js` — `const client = new SocketClient()` → `export const client = ...`.
- `client/js/index-entry.js` — thêm `import './tournaments.js?v=58';` sau `lobby.js`.
- `client/index.html` — thêm `.section-tabs` (Bàn chơi/Giải đấu) phía trên
  `.lobby__header` cũ; bọc toàn bộ khối `#room-list` cũ (giữ nguyên mọi id) vào
  `#panel-tables`; thêm `#panel-tournaments` (header + filter-row + `#tournament-list`)
  và modal `#modal-create-tournament` (bản rút gọn của modal tạo phòng — không có toggle
  lite/pro vì tạo giải đấu vốn là hành động của organizer/power-user, không cần giản lược
  như modal phòng thường dành cho người mới).
- `client/css/lobby.css` — chuyển nguyên khối CSS mockup-only (`.section-tabs`,
  `.tab-panel`, `.filter-row`, `.tournament-grid`, `.tournament-card`, `.badge--*`) từ
  `client/tables-tournaments-mockup.html`'s inline `<style>` vào file dùng chung (bỏ
  `.mock-banner`, thêm `.tournament-card__actions` mới cho nút Đăng ký/Bắt đầu).
- `client/js/i18n.js` — khối `tabs.*`/`tournaments.*` (vi+en) và 7 khoá `err.*` cho các mã
  lỗi tournament thực sự có thể xảy ra ở tầng lobby Phase 5 chạm tới (`INVALID_FORMAT`,
  `MISSING_TOURNAMENT_ID`, `TOURNAMENT_NOT_FOUND`, `TOURNAMENT_ALREADY_STARTED`,
  `ALREADY_REGISTERED`, `NOT_REGISTERED`, `ORGANIZER_ONLY`) — các mã lỗi thuộc luồng lịch
  trình cặp đấu (`NOT_A_PARTICIPANT`, `INVALID_STATE`, ...) chưa cần vì chưa có UI gọi tới.
- `server/managers/tournament/TournamentManager.js` — `organizerName`/`entryUserIds` như
  mô tả ở trên.
- Bump cache-bust `?v=57` → `?v=58` **ở mọi nơi** (tất cả `client/*.html`, mọi
  `import` trong `client/js/*-entry.js`, kể cả `tables-tournaments-mockup.html` dù không
  sửa nội dung file đó) theo đúng quy tắc `CLAUDE.md`.

**Xác minh:** `npm test` (714/714), cộng với Playwright thật (theo đúng quy trình an toàn
DB của `CLAUDE.md`: dừng server thật của người dùng → dời `gomoku.db` thật sang
`.pre-e2e` → khởi động server mới với DB rỗng từ schema → chạy Playwright trên
`localhost:3000` → dừng server → xoá DB thử nghiệm → khôi phục `gomoku.db` thật, xác minh
bằng `md5sum` khớp checksum trước khi dời → khởi động lại server người dùng y hệt cách cũ,
`npm run dev:stable`).

---
