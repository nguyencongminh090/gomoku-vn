# B63. Standings nên cộng dồn điểm thật (`seriesScore`) thay vì 1 điểm/pairing thắng — TODO.md #63

**Trạng thái:** ✅ Đã đóng, KHÔNG triển khai (2026-08-08) — sau khi đối chiếu luật Swiss/FIDE và Double
Elimination thật (xem "Kết luận" cuối `docs/todo/B63-*.md`), xác nhận cơ chế hiện tại (1 điểm/pairing
+ Buchholz/SB) đúng chuẩn, không phải bug. Hướng tiếp cận bên dưới giữ lại làm tài liệu tham khảo nếu
sau này có yêu cầu house-rule riêng, nhưng KHÔNG được tự ý triển khai — cần hỏi lại người dùng trước.

**Nguồn:** báo cáo người dùng, 2026-08-08, đối chiếu Round Robin thực tế (series 3.5–0.5 nhưng bảng
hiện 1–0). Chưa qua vòng `features/<slug>/` discussion — phạm vi tuy đụng nhiều điểm gọi nhưng vấn đề
gốc đã rõ qua code, xem TODO.md #63 phần "Hiện trạng" cho bằng chứng chi tiết.

## Phạm vi

- `server/managers/tournament/standings.js` — `computeStandings()` (dòng 19-41) và `computeTiebreaks()`
  (dòng 53-83): input shape `completedPairings: {player1, player2, winner}[]` hiện KHÔNG mang điểm
  thật, chỉ mang ai thắng. Đây là hàm pure, có test riêng (`server/tests/pairing/standings.test.js`) —
  sửa an toàn hơn các phần io-bound khác trong repo.
- `server/managers/tournament/TournamentManager.js`:
  - `_recordCompletion()` (dòng 665-679) — nơi duy nhất push vào `tournament.completedPairings`, cần
    đổi shape đẩy vào (thêm field điểm thật).
  - `recordPairingResult()` (dòng 544-598) — nơi gọi `_recordCompletion`, đã có sẵn `pairing.seriesScore`
    (tính bởi `series.js#computeSeriesScore`) ngay tại thời điểm series quyết định — nguồn dữ liệu đúng
    để truyền vào `_recordCompletion`.
  - `_handlePairingDeadline()` (dòng 604-622, nhánh walkover) — cũng gọi `_recordCompletion` nhưng
    KHÔNG có `pairing.seriesScore` thật (walkover là do đối thủ vắng mặt, không phải chơi hết series) —
    cần quyết định điểm gán cho walkover là bao nhiêu (đề xuất: giữ nguyên 1-0 cho walkover, vì không
    có ván nào thật sự diễn ra để tính tổng — khác về bản chất với series đã chơi xong).
  - `_computeSwissStandings()` (dòng 752) — dùng để ghép cặp vòng Swiss kế tiếp, ĐỌC KỸ trước khi đổi:
    có thể cố ý cần giữ nguyên "điểm/pairing" cho mục đích ghép cặp (khác với điểm hiển thị Standings) —
    xem câu hỏi mở trong TODO.md #63.
- `client/js/tournament-detail.js#computeStandings()` (dòng 574-643) — bản sao tay của
  `standings.js`, PHẢI sửa đồng bộ 1-1 với bản server (đúng như đã đồng bộ từ B50) — dùng
  `pairingsById` (đã có `seriesScore` nếu server serialize kèm) thay vì hard-code 1/0.5.
  Kiểm tra `TournamentManager.serializePairing()` có expose `seriesScore` ra client hay không —
  nếu chưa, cần thêm vào serialize trước khi client dùng được.

## Hướng tiếp cận đề xuất

1. Đổi `_recordCompletion(tournament, pairing, winnerEntryId)` thành nhận thêm điểm thật (ví dụ tham
   số `scoreByEntry: {entryId: number}` — với series lấy từ `pairing.seriesScore`, với pairing
   `single`/bye/walkover suy ra 1-0 hoặc 0.5-0.5 như cũ).
2. Đổi shape `tournament.completedPairings` từ `{player1, player2, winner}` thành thêm
   `{player1Score, player2Score}` (hoặc giữ nguyên `winner` cho tương thích chỗ khác đang đọc field
   này — kiểm tra `_syncDoubleElimPairings`/bracket logic có đọc `winner` từ đây không, KHÔNG được đổi
   ý nghĩa `winner` hiện tại, chỉ bổ sung field điểm).
3. `computeStandings()` cộng theo `player1Score`/`player2Score` mới thay vì `+1`/`+0.5` cố định; giữ
   nguyên nhánh bye (`p.player2 == null`) vì bye không có điểm thật để cộng dồn (không có game nào chơi).
4. Đồng bộ y hệt công thức sang `client/js/tournament-detail.js#computeStandings()`.
5. Viết test mới trong `standings.test.js` cho case series-score lẻ (ví dụ 3.5-0.5), theo rule "Viết
   comprehensive test cases" trong CLAUDE.md — cả basic (single mode vẫn ra 1-0 như cũ, không regress)
   lẫn edge case (draw trong series, walkover, bye).
6. **Trước khi đổi `_computeSwissStandings`/Swiss pairing logic** — xác nhận với người dùng liệu Swiss
   ghép cặp vòng sau có nên dùng điểm thật mới hay giữ nguyên điểm/pairing cũ (2 khái niệm có thể cố ý
   tách biệt: "điểm ghép cặp" vs "điểm hiển thị standings"). Đừng tự ý đổi Swiss pairing nếu câu hỏi
   này chưa chốt — rủi ro thay đổi hành vi ghép cặp ngoài phạm vi báo cáo gốc (chỉ báo cáo về hiển thị
   Standings, không phải về ghép cặp).

## Ranh giới

- Không đổi ý nghĩa `pairing.result.winnerEntryId` (ai thắng PAIRING vẫn quyết bởi
  `evaluateSeries()`/`seriesModule`, dùng cho bracket Double Elimination) — chỉ đổi cách
  **standings.js cộng điểm hiển thị**, không đổi ai được coi là "thắng" một pairing.
- Không tự ý sửa Swiss pairing (`pairing/swiss.js`) cho tới khi câu hỏi mở về "2 khái niệm score" ở
  trên được chốt với người dùng.
- Không mở rộng sang Double Elimination — mục này chỉ xác nhận với báo cáo gốc trên Round Robin;
  Double Elimination hiện không hiển thị Standings dạng bảng điểm (`renderStandings()` client hiện show
  message "no standings, only bracket" cho double_elim) nên không có bề mặt hiển thị nào bị ảnh hưởng ở
  format đó.
