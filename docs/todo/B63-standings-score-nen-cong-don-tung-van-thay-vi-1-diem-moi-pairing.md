# Phần B #63. Bảng xếp hạng (Standings) tính điểm theo pairing (1 điểm/pairing thắng) thay vì cộng dồn điểm từng ván trong series

**Trạng thái:** ✅ Đã đóng, không sửa (2026-08-08) — xem "Kết luận sau khi đối chiếu luật thật" ở cuối
file. Cơ chế hiện tại đúng chuẩn Swiss/FIDE; đề xuất ban đầu ("dùng tổng điểm") sẽ lệch chuẩn nếu áp
dụng vào xếp hạng/tie-break, nên người dùng chọn giữ nguyên sau khi xem bằng chứng.

**Nguồn:** báo cáo người dùng, 2026-08-08 — "Final score in standing tables is wrong and not match."
Xác nhận qua trao đổi: giải đấu **Round Robin**, một cặp đấu (pairing) là series nhiều ván, người
chơi thắng series với tỉ số **3.5–0.5** (tổng điểm cộng dồn từng ván), nhưng bảng Standings chỉ hiện
**1–0**. Người dùng đề xuất: "we should use sum scores instead" (dùng tổng điểm thật thay vì 1
điểm/pairing).

## Hiện trạng (đã xác nhận qua code, không phải bug tính sai — là quyết định thiết kế có chủ đích)

- `server/managers/tournament/standings.js` — `computeStandings()` (dòng 19-41): với mỗi pairing đã
  `Completed`/`Walkover`, cộng **đúng 1 điểm** cho người thắng (0.5/0.5 nếu hoà), bất kể pairing đó là
  series bao nhiêu ván hay tỉ số thật là gì. `computeTiebreaks()` (Buchholz/Sonneborn-Berger) cũng
  dùng `score` theo đơn vị "điểm/pairing" này làm input.
- `client/js/tournament-detail.js` — `computeStandings()` (dòng 574-643) là **bản sao tay** của đúng
  logic trên (cùng công thức, viết lại phía client cho live-update) — cùng hành vi, cùng giới hạn.
- `server/managers/tournament/series.js` — comment đầu file ghi rõ đây là chủ đích từ B50: *"Extends
  the base tournament feature's 'one pairing = one game' model to 'one pairing = N games', **without
  changing how a decided pairing.result is consumed downstream** (Swiss standings, Double Elimination
  bracket resolution...)"*. Tức là lúc thiết kế series (B50) đã cố tình giữ nguyên "1 pairing = 1 điểm
  xếp hạng" để không phải sửa `standings.js`/bracket logic — đánh đổi lấy đúng vấn đề người dùng đang
  gặp.
- `pairing.seriesScore` (điểm thật từng ván, ví dụ `{entryId1: 3.5, entryId2: 0.5}`) **đã có sẵn** trên
  mỗi pairing (tính bởi `series.js#computeSeriesScore`, cập nhật mỗi lần `recordPairingResult` chạy) —
  dữ liệu cần thiết để sửa đã tồn tại, chỉ là `computeStandings()` hiện không dùng nó.

## Đề xuất (theo đúng ý người dùng): Standings cộng dồn điểm thật (`seriesScore`) thay vì 1 điểm/pairing

- **Phạm vi kỹ thuật dự kiến:**
  - `server/managers/tournament/standings.js#computeStandings()` — với mỗi completed pairing, thay vì
    cộng cố định 1/0.5, cộng theo điểm thật của pairing đó. Cần quyết định nguồn: dùng
    `pairing.seriesScore` trực tiếp (chỉ có ở pairing dạng series) hay tính lại từ danh sách
    `completedPairings` hiện có (hiện chỉ lưu `{player1, player2, winner}` — **không đủ dữ liệu**, cần
    mở rộng shape này để mang theo điểm thật, xem câu hỏi mở bên dưới).
  - `TournamentManager._recordCompletion()` (dòng 665-679) — nơi push vào `tournament.completedPairings`
    — cần đổi shape push để mang thêm điểm thật (không chỉ `winner`), vì `computeStandings()` là hàm
    pure chỉ nhận đúng input này.
  - `client/js/tournament-detail.js#computeStandings()` — bản sao tay, phải sửa **song song, giống hệt
    công thức mới** (đúng như 2 bản đã đồng bộ từ trước) để tránh lệch giữa live-view và server.
  - `computeTiebreaks()` (Buchholz/SB) — cần xác nhận có nên đổi theo (đối thủ mạnh/yếu vẫn tính theo
    "opponent's score" — nếu score giờ là tổng điểm thật thay vì điểm/pairing, ý nghĩa Buchholz cũng
    đổi theo, cần cân nhắc có còn đúng chuẩn Buchholz hay không).
  - `server/tests/pairing/standings.test.js` — bộ test hiện tại giả định "1 điểm/pairing"; cần viết
    lại/thêm case cho pairing dạng series với điểm lẻ.
- **Đánh giá hiệu quả/an toàn (sơ bộ):** hiệu quả cao — đúng kỳ vọng người dùng cho tính năng series
  (B50) đã triển khai, sửa gốc thay vì vá hiển thị. Rủi ro: đổi ý nghĩa "score" trong toàn bộ hệ thống
  xếp hạng — ảnh hưởng tới **Swiss pairing** (`pairing/swiss.js` dùng `score` để chia nhóm/ghép cặp
  vòng sau) và **finalRank** khi tournament kết thúc (`TournamentManager._completeTournament()`). Đây
  không phải thay đổi cô lập trong 1 file — cần rà lại toàn bộ nơi `score` được dùng trước khi đổi ý
  nghĩa của nó.
- **Trạng thái:** chưa làm — mới ghi nhận theo yêu cầu người dùng, cần thảo luận thêm câu hỏi mở dưới
  đây trước khi triển khai (xem `docs/instruction/B63-*.md`).

## Câu hỏi mở

- Với pairing **không phải series** (`single` mode, hoặc pairing thường chưa bật series), điểm thật =
  1/0 = giống hệt hành vi hiện tại — không đổi gì cho trường hợp này, đúng không? (Có vẻ đúng, vì
  `evaluateSeries` cho `single` mode luôn có đúng 1 game, `seriesScore` = `{winner:1, loser:0}`, khớp
  hệt công thức cũ.)
- Swiss pairing (`pairing/swiss.js`) hiện dùng `score` (điểm/pairing) để chia score-group ghép cặp
  vòng sau — nếu đổi `score` sang tổng điểm thật, ghép cặp Swiss vòng sau có cần đổi theo không, hay
  Swiss pairing nên **tiếp tục dùng điểm/pairing riêng** (khác với điểm hiển thị Standings)? Cần chốt
  trước khi sửa, vì đụng 2 khái niệm "score" khác nhau trong cùng hệ thống có thể gây nhầm lẫn hơn.

## Kết luận sau khi đối chiếu luật thật (2026-08-08) — đóng mục này

Người dùng yêu cầu tra cứu luật Swiss/Double Elimination thật trước khi quyết định sửa. Kết quả:

- **Swiss (chuẩn FIDE):** "score" dùng để xếp hạng chính **là điểm theo VÒNG** (mỗi vòng/pairing = 1
  trận, thắng=1/hoà=0.5/thua=0) — hoàn toàn không có khái niệm "trận nhiều ván nhỏ" trong luật Swiss
  gốc (mỗi vòng chỉ có 1 ván). Khi hoà điểm, thứ tự tie-break chuẩn FIDE là **Buchholz** (tổng điểm —
  theo vòng — của các đối thủ đã gặp) → **Buchholz Cut 1** → **Sonneborn-Berger** — tất cả tính trên
  điểm-theo-vòng của đối thủ, không phải tổng điểm ván lẻ trong nội bộ 1 trận.
  ([FIDE Tie-Break Regulations](https://handbook.fide.com/chapter/TieBreakRegulations2023),
  [Score7 — Buchholz and Swiss Tiebreakers Explained](https://kb.score7.io/blog/guides/buchholz-and-swiss-tiebreakers-explained/))
- **Double Elimination:** không có khái niệm "bảng điểm"/tie-break theo tổng điểm trong luật DE tiêu
  chuẩn — đây là bracket loại trực tiếp thuần túy, tỉ số/số ván thắng trong 1 trận không ảnh hưởng gì
  ngoài việc quyết ai thắng trận đó để đi tiếp. Không có "2 người cùng hạng, ai điểm cao hơn thắng"
  trong DE vì DE không xếp hạng giữa chừng, chỉ có vị trí trên bracket.
  ([Double-elimination tournament — Wikipedia](https://en.wikipedia.org/wiki/Double-elimination_tournament))
- **Kết luận:** cơ chế hiện tại của repo (1 điểm/pairing thắng + Buchholz/Sonneborn-Berger, DE không
  hiện Standings) **đúng chuẩn Swiss/FIDE**, không phải bug. Đề xuất ban đầu ("dùng tổng điểm từng ván
  để xếp hạng/tie-break") sẽ là một house rule lệch chuẩn nếu triển khai. Sau khi xem bằng chứng, người
  dùng chọn **giữ nguyên, đóng mục này** (2026-08-08) — không triển khai bất kỳ thay đổi nào ở
  `standings.js`/`tournament-detail.js`/`swiss.js`.
