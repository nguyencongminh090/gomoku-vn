# #53. Modal "Tạo giải đấu" thiếu hẳn UI để chọn series mode (race-to-margin / số ván cố định) — tổ chức không cách nào set được dù backend đã hỗ trợ đầy đủ

**Nguồn:** báo cáo người dùng, 2026-08-07 — "Organizer cannot set race-to-margin or sub-game. Check
Backend & front-end?"

## Nguyên nhân đã xác nhận (đọc code, chưa sửa)

**Backend đúng, có test bao phủ:**
- `TournamentManager.createTournament` (`server/managers/tournament/TournamentManager.js:1059-1090`)
  nhận, validate `ruleSet.seriesMode`/`seriesGameCount`/`seriesTargetScore`/`seriesMargin` đầy đủ —
  sai/thiếu field đi kèm thì tự fallback về `'single'`, không throw.
- `server/managers/tournament/series.js`'s `evaluateSeries()` — logic 2 chế độ đã đúng, có test
  (`server/tests/series.test.js`, `TournamentManager.test.js:175-260`).
- `TournamentMatchHandler.js:145-150` đọc lại `ruleSet.seriesMode`/... để gửi cho client hiển thị
  điểm số trong trận — cũng đúng.

**Frontend thiếu hoàn toàn — đây là nguyên nhân thật của bug:**
- Modal `#modal-create-tournament` (`client/index.html:319` trở đi) có input cho `tFormat`,
  `tWinRule`, `tOpenRule`, `t-scheduling-hours`... nhưng **không có input nào cho series mode** —
  không có radio single/fixedCount/raceToMargin, không có ô nhập số ván / target / margin.
- `readTournamentRuleSet()` (`client/js/tournaments.js:275-293`) — hàm duy nhất gom dữ liệu form để
  gửi lên server khi bấm tạo giải đấu — **không đọc các trường series** vì chúng không tồn tại
  trong DOM. `ruleSet` gửi lên server luôn thiếu `seriesMode`, nên backend luôn fallback về
  `'single'` một cách im lặng.
- Kết quả: **tổ chức không có cách nào tạo giải đấu với series mode khác `'single'`** qua UI, dù
  toàn bộ hạ tầng backend cho tính năng đó đã hoạt động đúng.

## Vì sao lọt qua dù B50 đã đánh dấu "đã xong"

`docs/todo/B50-*.md`'s mục "Các quyết định thiết kế đã chốt" có ghi rõ yêu cầu `seriesMode` là
"tổ chức nhập tay" — nhưng nhìn lại 7 bước triển khai đã ghi trong log hoàn thành, không có bước
nào động vào modal tạo giải đấu (`client/index.html`/`tournaments.js`'s creation flow) — chỉ có
bước 5 động vào `tournament-match.html` (trang xem trận đấu, không phải trang tạo giải đấu). Đây là
khoảng trống thật giữa yêu cầu đã chốt và phạm vi đã triển khai.

## Việc cần làm khi triển khai fix

- Thêm UI vào `#modal-create-tournament` (`client/index.html`): chọn chế độ (Một ván / Số ván cố
  định / Race-to-margin), kèm ô nhập số tương ứng (ẩn/hiện theo chế độ đã chọn, tương tự cách
  `tOpenRule`/Swap2 đã ẩn hiện `t-rule-wall`/`t-rule-portal`).
- Sửa `readTournamentRuleSet()` (`client/js/tournaments.js`) để đọc các trường mới, gộp vào
  `ruleSet` gửi lên server.
- Validate phía client tối thiểu (số ván ≥ 2, target/margin > 0) trước khi gửi — dù backend đã tự
  fallback an toàn, không nên để tổ chức bấm gửi giá trị rác rồi âm thầm rớt về `'single'` không rõ
  lý do.
- Vì đây là bug trong tính năng đã merge (B50), không phải thay đổi thiết kế mới — không cần quay
  lại `features/tournament-match-series/` để thảo luận lại, thiết kế đã chốt sẵn từ trước.
