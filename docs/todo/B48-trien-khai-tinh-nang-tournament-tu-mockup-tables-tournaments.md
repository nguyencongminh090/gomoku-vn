# Phần B #48. Triển khai tính năng Tournament (Tables & Tournaments) từ mockup

**Nguồn:** yêu cầu người dùng — thảo luận + blueprint UI cho tính năng Tournament (2026-08-04)

48. **Triển khai đầy đủ tính năng Tournament** — hiện mới có (1) tài liệu thảo
    luận ở `features/tournament/` (user stories, sơ đồ tuần tự/trạng thái,
    câu hỏi mở) và (2) mockup front-end tĩnh
    `client/tables-tournaments-mockup.html` trên nhánh
    `feature/tables-tournaments-mockup` (branch off `dev`) — **chưa có bất kỳ
    logic server/socket/DB thật nào**, chưa nối vào `index.html`/`lobby.js`
    thật. Đọc kỹ `instruction.md` §B48 trước khi làm — có nhiều quyết định
    kiến trúc chưa chốt.
    - **Điều kiện tiên quyết — chưa làm được nếu chưa xong:** toàn bộ câu hỏi
      mở trong `features/tournament/planning.md` (định nghĩa "punishment",
      nghĩa chính xác của "overtime by date", ai duyệt đổi lịch, rule theo
      từng thể thức hay dùng chung, xử lý double no-show, giới hạn
      concurrency, quan hệ với `TimerManager`, vị trí trong site nav,
      tiebreak, thuật toán ghép cặp) **phải được người dùng trả lời trước**.
    - **Phạm vi dự kiến khi triển khai:** thiết kế data model (tournament,
      round, pairing, rule set), socket handler mới **tách biệt hoàn toàn**
      khỏi `GameHandler`/`RoomHandler` (ràng buộc kiến trúc đã ghi trong
      `features/tournament/user_story.md`), nối UI mockup vào
      `client/index.html` + `client/js/lobby.js` thật (tab switcher Bàn
      chơi/Giải đấu), CRUD tournament cho Organizer, luồng lịch thi đấu
      tự-thoả-thuận + báo server (state machine đã vẽ ở
      `features/tournament/diagram/state-diagram-match-lifecycle.md`).
    - **Đánh giá hiệu quả/an toàn:** hiệu quả cao (tính năng lớn, người dùng
      chủ động đề xuất) nhưng **rủi ro cao nếu làm trước khi câu hỏi mở được
      chốt** — dễ phải làm lại data model/API. Không đánh giá được mức độ an
      toàn cụ thể cho tới khi có thiết kế server thật (ví dụ: cần rate-limit
      tạo tournament? cần kiểm tra quyền Organizer thế nào?) — để ngỏ, bổ
      sung khi có thiết kế.
    - **Trạng thái:** ⏳ CHƯA LÀM — mới ở giai đoạn discussion + mockup tĩnh.
    - **Test:** chưa có gì để test (chưa có logic thật). Khi triển khai server
      thật, áp dụng nguyên rule "Bug-fix workflow"/"Writing comprehensive test
      cases" trong `CLAUDE.md` — viết Jest test cho mọi state transition mới
      trong `server/tests/`, giữ lại vĩnh viễn, không xoá sau khi xác nhận
      pass.

## Trạng thái: đã xong (phát hiện 2026-08-06 — mục index bị lỗi thời)

Khi rà lại mục #48 này, phát hiện toàn bộ tính năng đã được triển khai đầy đủ và
merge vào `dev` từ trước — mục index trong `TODO.md` chỉ đơn giản chưa được cập
nhật để phản ánh việc đó (khác với #50, vốn đã có bước "docs: mark done" riêng).
Không có code mới nào được viết trong lượt rà soát này; đây thuần là sửa tài
liệu tracking cho khớp thực tế.

Bằng chứng — 6 phase triển khai đầy đủ, mỗi phase một/nhiều commit trên các
nhánh `feature/tournament-server`, `feature/tables-tournaments-mockup`,
`feature/tournament-client`, `feature/tournament-detail-mockup` (tất cả off
`dev`, đã merge):

1. `91d547d` — Phase 1: DB schema (`tournaments`, `tournament_players`,
   `tournament_rounds`, `tournament_pairings`) + `TournamentManager` CRUD core.
2. `1cd59d8` — Phase 2: thuật toán ghép cặp/bracket (Swiss, Round robin,
   Double Elimination) + tiebreak Buchholz/Sonneborn-Berger
   (`server/managers/tournament/pairing/*`, `standings.js`).
3. `4b01367` — Phase 3: state machine vòng đời trận đấu
   (`PairingLifecycle.js`, đúng state diagram trong
   `features/tournament/diagram/`) + deadline sweep.
4. `f7bfd5b` — Phase 4: lớp socket handler (`TournamentHandler.js` —
   `tournament:*`, `TournamentMatchHandler.js` — `tmatch:*`), tách biệt hoàn
   toàn khỏi `GameHandler`/`RoomHandler` theo đúng ràng buộc kiến trúc trong
   `user_story.md`, dùng `tournamentState.js` riêng (không dùng chung
   `state.js` của phòng chơi thường).
5. `e0983b9` — Phase 5: nối UI mockup vào `client/index.html` +
   `client/js/lobby.js` thật (tab switcher Bàn chơi/Giải đấu), điều khiển bởi
   `client/js/tournaments.js` mới.
6. `d29a921`/`c4389e3` — Phase 6: trang chi tiết giải đấu
   (`client/tournament.html` + `tournament-detail.js`), luồng lịch thi đấu
   tự-thoả-thuận, và trang thi đấu trực tiếp (`client/tournament-match.html` +
   `tournament-match.js`) — dùng lại `TimerManager` hiện có (một instance mới
   mỗi pairing, lưu trong `tournamentTimerMap` riêng của
   `tournamentState.js`) đúng theo quyết định #7 trong `planning.md`.

Việc dọn hiệu năng sau đó (`bd68585`, `bd9ae5c` — diff/patch thay vì gửi lại
toàn bộ danh sách) và tính năng mở rộng #50 (chuỗi nhiều ván) đã được theo dõi
riêng, không thuộc phạm vi #48.

**Xác minh tại thời điểm rà soát (2026-08-06):** `npm test` — 34 test suite,
806 test, toàn bộ pass (bao gồm `PairingLifecycle.test.js`,
`TournamentManager.test.js`, `TournamentHandler.test.js`,
`TournamentMatchHandler.test.js`, `pairing/swiss.test.js`,
`pairing/roundRobin.test.js`, `pairing/doubleElim.test.js`,
`pairing/standings.test.js`, `tournamentDeadlineSweep.test.js`, `series.test.js`).

---
