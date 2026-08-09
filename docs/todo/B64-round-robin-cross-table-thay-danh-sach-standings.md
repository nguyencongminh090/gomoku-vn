# Phần B #64. Round Robin: thay bảng Standings dạng danh sách bằng Cross Table (bảng chéo) hiện tỉ số thật từng cặp đấu

**Nguồn:** tiếp tục từ #63 (2026-08-08) — sau khi #63 xác nhận cơ chế xếp hạng hiện tại (1 điểm/pairing
+ Buchholz/SB) đúng chuẩn Swiss/FIDE và bị đóng không sửa, người dùng đề xuất một hướng khác, **hẹp và
đúng chuẩn thật hơn**: không đổi cách tính rank, chỉ đổi **cách hiển thị Standings riêng cho Round
Robin**.

## Quan hệ với #63

- **Không mâu thuẫn với #63** — #63 kết luận Buchholz/SB (tie-break) và match points (1 điểm/pairing,
  xếp hạng chính) đúng chuẩn Swiss/FIDE cho **Swiss**, vẫn giữ nguyên hoàn toàn.
- Mục này chỉ nói về **Round Robin**, và chỉ đổi **hiển thị**, không đổi cách tính điểm/rank nội bộ.
  Tra cứu thêm (2026-08-08) xác nhận Round Robin (league-style) thật ra dùng bộ tie-break khác Swiss:
  match points → head-to-head → điểm/hiệu số thật → tổng điểm ghi được — **không dùng Buchholz/SB**
  (vì mọi người đều gặp đủ mọi đối thủ, nên "sức mạnh đối thủ" không phân biệt được ai với ai).
  ([printyourbrackets.com — Tiebreaker Rules for Round Robin](https://www.printyourbrackets.com/tiebreaker-in-round-robin-tournaments.html),
  [pickleball518.com — round-robin tiebreak FAQ](https://www.pickleball518.com/how-do-you-break-a-tie-in-a-round-robin-pickleball-tournament/))
  → Buchholz/SB hiện đang áp cho cả Round Robin lẫn Swiss (`standings.js` dùng chung 1 hàm cho mọi
  format không phải double_elim) là hơi lệch chuẩn, nhưng người dùng chọn **không sửa phần tie-break
  này** — chỉ đổi hiển thị sang Cross Table, xem "Ranh giới" bên dưới.

## Thiết kế đã chốt với người dùng (2026-08-08)

64. **Round Robin: thay hẳn bảng Standings dạng liệt kê hiện tại bằng Cross Table.**
    - Lưới N×N, hàng và cột là tên người chơi trong giải.
    - Mỗi ô giao giữa 2 người hiện **tỉ số thật của pairing đó** — ví dụ ô [A,B] = "4–2" nếu A thắng B
      4-2 (series nhiều ván), "0.5–0.5" nếu hoà, để trống/gạch ngang nếu 2 người chưa đấu (hoặc pairing
      chưa hoàn thành).
    - Dữ liệu nguồn: `pairing.seriesScore` (đã có sẵn, tính bởi `series.js#computeSeriesScore`, cập
      nhật mỗi lần `recordPairingResult` chạy) — không cần thêm state mới, chỉ cần đọc đúng field này
      theo từng pairing và render thành lưới thay vì danh sách.
    - Chỉ áp dụng cho **Round Robin** — Swiss giữ nguyên bảng Standings dạng danh sách + Buchholz/SB
      như hiện tại (khác hệ thi đấu → khác cách hiển thị, đúng như người dùng phát biểu: "với một hệ
      thi đấu khác nhau sẽ có một display khác nhau"). Double Elimination không đổi (vẫn không có
      Standings, chỉ có bracket).
    - **Không đổi cách tính rank/tie-break nội bộ** — `standings.js#computeStandings/computeTiebreaks/
      rankStandings` giữ nguyên logic hiện tại (dùng nội bộ nếu cần, ví dụ để xác định thứ hạng cuối
      `finalRank` khi tournament hoàn thành) — chỉ đổi phần RENDER ở `renderStandings()`
      (`tournament-detail.js`) cho format `round_robin`.

## Phạm vi kỹ thuật dự kiến

- `client/js/tournament-detail.js#renderStandings()` (dòng 645-684) — hiện có nhánh riêng cho
  `double_elim` (chỉ hiện thông báo, không có bảng). Cần thêm nhánh riêng cho `round_robin`: build
  lưới N×N từ `tournament.entries` (hàng/cột) + `pairingsById` (tra theo cặp `player1EntryId`/
  `player2EntryId` để lấy `seriesScore`, hoặc `result.winnerEntryId`/`reason:'bye'` cho pairing không
  có 2 người). Swiss vẫn dùng `computeStandings()` hiện tại (danh sách + Buchholz/SB).
- Cần map nhanh `(entryIdA, entryIdB) -> pairing` — hiện `pairingsById` chỉ index theo `pairingId`,
  cần duyệt qua để build map phụ (hoặc build 1 lần khi render).
- CSS mới cho layout lưới (`tournament.css`) — bảng N×N có thể rộng hơn nhiều màn hình khi N lớn, cần
  `overflow-x: auto` hoặc tương tự để không vỡ layout mobile (đối chiếu "Feature completion checklist"
  trong CLAUDE.md — verify cả responsive, không chỉ desktop).
- i18n: thêm khoá mới cho tiêu đề Cross Table (namespace `tdetail.*` hiện có).
- Không cần đổi gì phía `server/` — dữ liệu (`seriesScore`) đã serialize sẵn qua pairing, chỉ cần xác
  nhận `TournamentManager.serializePairing()` có expose `seriesScore` ra client hay chưa (nếu chưa,
  đây là phần server duy nhất cần đụng — thêm field vào serialize, không đổi logic tính).

## Đánh giá hiệu quả/an toàn (sơ bộ)

- Hiệu quả cao — đúng nhu cầu thật của người dùng (xem chi tiết từng cặp đấu trực quan hơn dạng danh
  sách tổng), đúng chuẩn hiển thị round-robin thật (cross table là dạng hiển thị kinh điển của round-
  robin trong cờ vua/esports).
- An toàn cao — thuần thay đổi hiển thị (client-side render), không đổi state machine, không đổi logic
  xếp hạng/tie-break/pairing nội bộ. Rủi ro chính chỉ là UI responsive với N lớn (xem phần CSS ở trên).

## Trạng thái

✅ ĐÃ XONG (2026-08-08, nhánh `feature/round-robin-cross-table` off `dev`, chạy trong git worktree
riêng — xem ghi chú cuối mục này).

- `client/js/tournament-detail.js` — `renderStandings()` thêm nhánh `tournament.format === 'round_robin'`
  gọi `renderCrossTable()` mới, TRƯỚC nhánh Swiss hiện có (Swiss không đổi gì, vẫn dùng
  `computeStandings()` + bảng liệt kê cũ). `renderCrossTable()`: lưới N×N từ `tournament.entries`,
  map pairwise `entryIdA|entryIdB -> pairing` dựng 1 lần mỗi render (`buildPairingLookup()`), mỗi ô
  đọc `pairing.seriesScore` (đã serialize sẵn từ server, không cần sửa server) format qua `fmtScore()`
  (bỏ `.0` thừa cho số nguyên, giữ `.5` cho số lẻ). 2 cột cuối (Điểm/`#`) tái dùng đúng
  `computeStandings()` không đổi — rank/tie-break Buchholz/SB nguyên vẹn như trước.
  - Ô đường chéo (chính mình): "—".
  - Chưa có pairing giữa 2 người (round chưa materialize tới, hoặc round-robin chưa xếp cặp đó) hoặc
    pairing tồn tại nhưng chưa `Completed`/`Walkover`/`InProgress`: "–" (placeholder).
  - `InProgress`: nhãn "Đang đấu"/"Live" (`tdetail.cross_table_live`).
  - `Walkover` (không có ván nào thật để cộng điểm): "T (bỏ cuộc)"/"W (walkover)" hoặc
    "B (bỏ cuộc)"/"L (walkover)" (`tdetail.cross_table_walkover_win/loss`) thay vì tỉ số, đúng theo
    hướng dẫn trong `docs/instruction/B64-*.md`.
  - Bye (`player2EntryId === null`): không có ô pairwise nào cần vẽ (đúng như instruction đề xuất, edge
    case đã xử lý bằng cách bỏ qua trong `buildPairingLookup()`), chỉ ảnh hưởng cột "Điểm" qua
    `computeStandings()` như trước.
- `client/css/tournament.css` — style mới `.cross-table*` (thêm sau `.standings-table`), cột tên người
  chơi `position: sticky; left: 0` để giữ cố định khi cuộn ngang trên mobile/N lớn, bọc
  `.cross-table-wrap { overflow-x: auto; }` đúng pattern `.bracket-wrap` đã có.
- `client/js/i18n.js` — 3 khoá mới `tdetail.cross_table_live`/`cross_table_walkover_win`/
  `cross_table_walkover_loss`, cả vi + en.
- Server: **không đổi gì** — xác nhận `TournamentManager.serializePairing()` (dòng 1044-1068) đã
  expose sẵn `seriesScore` (và `result`/`games`) trong payload, đúng như instruction dự đoán.
- `?v=`: 84 → 85 trên toàn bộ `client/*.html` + mọi `import '...?v=N'` trong `client/js/*.js` (script
  verify trong CLAUDE.md cho ra đúng 1 giá trị `85`).

**Verify:** `npm test` — 931/931 pass (không có test mới vì đây là thay đổi UI thuần
`client/js/`, không có test infra tự động theo CLAUDE.md — đã nêu rõ thay vì bỏ qua). Xác minh trình
duyệt thật theo đúng quy trình Playwright/e2e trong CLAUDE.md, **chạy trong 1 git worktree riêng**
(`git worktree add`, không phải trên nhánh làm việc chính của người dùng — xem ghi chú bên dưới) nên
không cần dời `server/db/gomoku.db` thật (worktree không có file db, tự tạo db tạm mới từ
`schema.sql`, xoá cùng worktree khi dọn dẹp):
  - Kịch bản 1 (socket.io-client dựng dữ liệu + Playwright/Chromium kiểm tra DOM thật): tạo giải Round
    Robin 3 người, chơi xong 1 cặp đấu (thắng 0-1), để 1 cặp khác "Negotiating" (chưa đấu), 2 bye tự
    động `Completed`. Mở `tournament.html` bằng guest thứ 4 (khách, để test rendering không phụ thuộc
    danh tính), tab Bảng xếp hạng: xác nhận đúng lưới 3×3 — ô [KindBull, TealElk] hiện "0–1" (màu
    loss), ô [TealElk, KindBull] hiện "1–0" (màu win), ô liên quan tới PaleMink (bye) hiện "–", cột
    Điểm/# đúng theo `computeStandings()` (cả 3 người 1 điểm — do mỗi người có đúng 1 kết quả đã quyết
    (bye hoặc 1 ván) — rank tách bởi Buchholz/SB đúng logic cũ, không phải bug). **0 console error.**
  - Kịch bản 2 (trạng thái `InProgress`): giải Round Robin 2 người riêng, đưa cặp đấu duy nhất tới
    `InProgress` (không kết thúc), xác nhận cả 2 ô chéo hiện đúng nhãn "Đang đấu". **0 console error.**
  - Ảnh chụp màn hình xác nhận bố cục desktop hợp lý (sticky cột tên, viền rõ ràng); chưa test riêng
    viewport mobile hẹp thật (chỉ dựa vào `overflow-x: auto` theo pattern có sẵn của `.bracket-wrap`,
    chưa đo bằng thiết bị/viewport thật) — nếu cần xác nhận thêm, verify riêng ở lần dùng thật tiếp
    theo.
  - Ghi chú vận hành: phiên làm việc này chạy song song với 1 nhánh khác của người dùng
    (`fix/tournament-match-sound-and-display-mode`, không liên quan) đang có edit chưa lưu trong cùng
    thư mục làm việc chính — để tránh xung đột, toàn bộ việc code + verify của #64 được làm trong 1
    `git worktree` tách biệt (branch off `dev`), không đụng tới thư mục làm việc chính của người dùng.
