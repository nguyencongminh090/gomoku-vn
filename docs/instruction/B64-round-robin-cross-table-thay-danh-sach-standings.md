# B64. Round Robin: Cross Table thay bảng Standings dạng danh sách — TODO.md #64

**Nguồn:** tiếp nối #63 (đã đóng, không sửa tie-break) — thảo luận 2026-08-08, thiết kế đã chốt với
người dùng qua nhiều vòng hỏi-đáp (xem TODO.md #64 "Thiết kế đã chốt").

## Phạm vi

- `client/js/tournament-detail.js`:
  - `renderStandings()` (dòng 645-684) — thêm nhánh `if (tournament.format === 'round_robin')` tương tự
    nhánh `double_elim` đã có, TRƯỚC khi rơi vào code path Swiss hiện tại (Swiss dùng nguyên
    `computeStandings()` + bảng liệt kê như cũ, không đổi).
  - `computeStandings()` (dòng 574-643) — **giữ nguyên, không xoá** — Swiss vẫn cần hàm này. Không tái
    dùng cho nhánh round_robin mới (round_robin cần dữ liệu pairwise, không phải danh sách rank).
  - `pairingsById` (dòng 71) — đã có sẵn toàn bộ pairing của giải (Map theo `pairingId`). Cross Table
    cần tra theo **cặp entryId**, không phải theo `pairingId` — viết hàm phụ dựng
    `Map<"entryIdA|entryIdB", pairing>` (key 2 chiều, hoặc chuẩn hoá thứ tự entryId khi build key) một
    lần mỗi lần render, quét `pairingsById.values()`.
- `server/managers/tournament/TournamentManager.js` — kiểm tra `serializePairing()` (tìm bằng
  `codegraph_explore "serializePairing"` nếu cần định vị) có include `seriesScore` trong payload gửi
  cho client hay không. Nếu **chưa có**, đây là điểm duy nhất cần sửa phía server: thêm field
  `seriesScore` vào object trả về — **không đổi logic tính** `seriesScore` (đã đúng, tính bởi
  `series.js#computeSeriesScore`), chỉ đổi việc có expose ra ngoài hay không.
- `client/css/tournament.css` — style mới cho bảng lưới N×N (`.cross-table` hay tên tương tự), đặt
  cùng khu vực với `.standings-table` hiện có.
- `client/js/i18n.js` — thêm khoá text mới (tiêu đề Cross Table, có thể chú thích "tỉ số thật từng cặp
  đấu" để người xem hiểu khác gì với bảng Standings kiểu Swiss).

## Hướng tiếp cận đề xuất

1. Đọc lại toàn bộ `renderStandings()` hiện tại để hiểu style/class convention đang dùng
   (`.standings-table`, `me` highlight row, `escapeHtml`/`entryName` helper) — Cross Table nên tái
   dùng đúng các helper này (`entryName`, `escapeHtml`, `me`/`userInfo` để highlight hàng/cột của
   chính người xem) để nhất quán UI, không phát minh lại.
2. Build lưới: hàng ngoài cùng + cột ngoài cùng đều là `tournament.entries` (cùng thứ tự, ví dụ theo
   `seed` hoặc thứ tự đăng ký). Ô đường chéo (chính mình gặp chính mình) để trống/gạch chéo. Ô [i][j]
   với i≠j: tra pairing giữa entry i và j qua map phụ ở trên; nếu tìm thấy và có `seriesScore`, hiện
   `${seriesScore[i]}–${seriesScore[j]}`; nếu pairing chưa `Completed`/`Walkover` (đang đấu hoặc chưa
   đấu), hiện placeholder (ví dụ "—" hoặc icon "đang đấu" nếu `InProgress`).
3. **Bye và Walkover:** bye có `player2EntryId === null` nên không xuất hiện trong lưới pairwise (chỉ
   liên quan 1 người) — có thể bỏ qua hoàn toàn trong Cross Table (không có ô nào để hiện), hoặc thêm 1
   cột "Bye" riêng ở cuối lưới nếu muốn đầy đủ — hỏi lại người dùng nếu không chắc, đây là edge case
   chưa được thảo luận trực tiếp. Walkover không có `seriesScore` thật (không ai chơi ván nào) — hiện
   theo `result.winnerEntryId` dạng "W" (thắng walkover) thay vì tỉ số số, tương tự cách bảng Standings
   hiện tại xử lý walkover như 1 điểm bình thường.
4. Round Robin có thể có nhiều vòng đấu lại (`_createReplayPairing` cho double_elim only — xác nhận
   Round Robin có replay pairing hay không trước khi giả định 1 cặp entry chỉ có đúng 1 pairing; nếu
   có nhiều pairing giữa cùng 1 cặp — hiếm nhưng cần kiểm tra — quyết định hiện pairing nào/gộp ra
   sao).
5. Responsive: bọc bảng trong `overflow-x: auto` (nhất quán với các bảng rộng khác trong repo theo
   convention artifact/CSS chung) — test ở tournament có nhiều người chơi (N lớn, ví dụ 8-16) trên
   viewport mobile thật.
6. Vì đây là thay đổi UI thuần (`client/js/`, không có test infra tự động theo CLAUDE.md) — verify
   bằng cách chạy `run` skill / mở trình duyệt thật, dựng 1 giải Round Robin có vài pairing đã hoàn
   thành + 1 pairing đang đấu + 1 pairing chưa đấu, xác nhận Cross Table hiện đúng từng trường hợp.
7. Nhớ bump `?v=N` cache-bust nếu sửa `tournament-detail.js`/`tournament.css` (theo quy tắc
   "Cache-busting version bump" trong CLAUDE.md).

## Ranh giới

- **Không đổi** `computeStandings()`/`computeTiebreaks()`/`rankStandings()` trong
  `server/managers/tournament/standings.js` hay bản sao ở `tournament-detail.js` — logic xếp hạng/tie-
  break (match points + Buchholz/SB) giữ nguyên 100%, kể cả cho Round Robin (dù #64's ghi chú "Quan hệ
  với #63" có nêu Buchholz/SB hơi lệch chuẩn cho Round Robin thật — người dùng đã chọn KHÔNG sửa phần
  đó, chỉ đổi hiển thị).
- **Không đổi** Swiss hay Double Elimination — chỉ thêm nhánh mới cho `round_robin`, 2 format kia giữ
  nguyên 100% code path hiện tại.
- **Không đổi** `finalRank` logic (`TournamentManager._completeTournament()`) — Cross Table thuần là
  view mới, không ảnh hưởng tới việc gán hạng cuối khi giải kết thúc.
