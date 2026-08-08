# B75. Cross Table sắp theo hạng + highlight Vô địch/Á quân — TODO.md #75

**Nguồn:** báo cáo người dùng kèm ảnh chụp Cross Table thật, tiếp nối TODO.md #64. Thiết kế đã chốt
qua `AskUserQuestion` — xem TODO.md #75 phần "Đã chốt với người dùng" trước khi đọc phần này.

## Phạm vi

- `client/js/tournament-detail.js#renderCrossTable()` (hiện đọc `const entries =
  tournament.entries;` rồi dùng trực tiếp cho cả trục hàng lẫn cột) — đổi thành lấy thứ tự đã sort từ
  `computeStandings()` (hàm này **giữ nguyên, không đổi logic tính rank/tie-break** — chỉ đổi cách
  `renderCrossTable()` tiêu thụ kết quả của nó).
- `client/js/tournament-detail.js#crossTableCell()`/`buildPairingLookup()` — không cần đổi, vẫn nhận
  `entryId` làm tham số, không phụ thuộc thứ tự hàng/cột.
- `client/css/tournament.css` — style mới cho highlight Vô địch/Á quân, đặt cạnh khối `.cross-table*`
  đã có (sau `.cross-table .cross-table__live`).
- `client/js/i18n.js` — có thể cần thêm nhãn "Vô địch"/"Á quân" (vi) + "Champion"/"Runner-up" (en) nếu
  quyết định hiện text thay vì chỉ icon/màu (xem hướng đề xuất bên dưới).

## Hướng tiếp cận đề xuất

1. Trong `renderCrossTable()`, đổi:
   ```js
   const entries = tournament.entries;
   ```
   thành lấy đúng entry object theo thứ tự `ranked` (đã sort theo rank):
   ```js
   const entriesById2 = new Map(tournament.entries.map((e) => [e.entryId, e]));
   const entries = ranked.map((r) => entriesById2.get(r.id)).filter(Boolean);
   ```
   (dùng tên biến khác `entriesById` module-level đã có ở đầu file để tránh nhầm — kiểm tra lại
   không trùng tên biến đang dùng chỗ khác trong file trước khi đặt tên).
   Vì `ranked` đến từ `computeStandings()` gọi NGAY TRƯỚC đó trong cùng hàm (dòng hiện tại), chỉ cần
   đổi thứ tự khai báo nếu cần (đảm bảo `ranked` có trước khi build `entries`).
2. Cả vòng lặp dựng header (`entries.map(...)`) lẫn vòng lặp dựng hàng (`entries.map(rowEntry =>
   ...)`) đã dùng chung biến `entries` — đổi 1 chỗ là tự động áp dụng cho cả 2 trục, lưới vẫn đối
   xứng đúng vì `crossTableCell()` không phụ thuộc thứ tự, chỉ phụ thuộc entryId truyền vào.
3. Cập nhật "real-time" (không chỉ sort 1 lần lúc tải) tự động có sẵn — `renderCrossTable()` đã được
   gọi lại mỗi khi `renderAll()` chạy (mỗi lần nhận `tournament:pairings_patch`/`tournament:updated`),
   nên chỉ cần đổi nguồn thứ tự là đủ, không cần thêm listener mới.
4. Highlight Vô địch/Á quân — thêm điều kiện `tournament.status === 'completed'` trong
   `renderCrossTable()`, gắn class vào đúng 2 hàng đầu tiên của `entries` sau khi đã sort theo rank
   (rank 1 → class `is-champion`, rank 2 → class `is-runner-up`) — LƯU Ý: vì `entries` giờ đã sort
   theo `ranked`, "2 hàng đầu tiên" trong mảng chính là rank 1/2, không cần tra `r.rank === 1` riêng —
   nhưng vẫn nên đọc `r.rank` thật (từ `rankById.get(entryId)`) để xử lý đúng trường hợp đồng hạng 1
   (xem điểm 5).
5. **Đồng hạng 1 (chưa chốt cách hiển thị với người dùng — cần hỏi lại nếu gặp khi triển khai):**
   `rankStandings()` để tie ở cùng rank khi mọi tiêu chí bằng nhau (xem hàm's doc comment "genuine,
   unresolved tie"). Nếu 2+ người cùng `rank === 1`, đề xuất tạm: highlight TẤT CẢ các hàng có
   `rank === 1` là "Vô địch" (không chỉ hàng đầu tiên trong mảng đã sort), và hàng đầu tiên có
   `rank === 2` (nếu có, sau khi bỏ qua các hàng đồng hạng 1) là "Á quân". Đây là suy luận hợp lý
   nhưng CHƯA được người dùng xác nhận trực tiếp — hỏi lại trước khi coi là quyết định cuối cùng nếu
   trường hợp này thực sự xảy ra trong lúc test.
6. Trực quan hoá: tái dùng icon `ph-trophy` (đã dùng ở `tournament-match.js#outcomeIconClass` cho kết
   quả thắng) đặt cạnh tên trong `cross-table__name-col`, cộng với nền màu nhẹ khác biệt (ví dụ vàng
   nhạt cho Vô địch, bạc nhạt cho Á quân — cần chọn token màu có sẵn trong theme, không tự bịa hex
   code mới; kiểm tra `main.css`/theme variables xem có sẵn `--c-gold`/`--c-silver` hay tương đương
   chưa, nếu chưa thì cân nhắc dùng `--c-warning`/`--c-brand` sẵn có thay vì thêm token mới chỉ cho 1
   chỗ dùng).
7. Verify: dựng 1 giải Round Robin thật tới lúc `completed` (đối chiếu quy trình Playwright/e2e-safety
   trong CLAUDE.md — worktree riêng hoặc db tạm), xác nhận: (a) thứ tự hàng/cột đổi đúng theo hạng khi
   có kết quả mới trong lúc giải còn `active` (chưa highlight), (b) sau khi hoàn thành, đúng 1-2 hàng
   đầu được highlight, (c) trường hợp hoà hạng 1 nếu dựng được kịch bản đó.

## Ranh giới

- Không đổi `computeStandings()`/`computeTiebreaks()`/`rankStandings()` — logic tính rank/tie-break
  giữ nguyên 100% (đã xác nhận đúng chuẩn Swiss/FIDE ở #63).
- Không đổi Swiss's bảng liệt kê (`.standings-table`) — mục này chỉ áp dụng cho nhánh
  `round_robin`/Cross Table.
- Không tự ý quyết định cách hiển thị đồng hạng 1 nếu gặp phải lúc code — hỏi lại người dùng theo
  điểm 5 ở trên thay vì tự chọn một cách và coi là xong.
