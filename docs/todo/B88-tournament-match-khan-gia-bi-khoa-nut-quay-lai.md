# Phần B #88. Khán giả/guest xem trận giải đấu bị khoá nút "Quay lại chi tiết giải đấu" giống người chơi

**Nguồn:** báo cáo người dùng — "Guest/audience View Tournament room cannot escape. Backend lock
Player (who playing) but also lock viewers escape." (2026-08-09).

## Vấn đề đã xác nhận qua code (CodeGraph + đọc trực tiếp)

`client/js/tournament-match.js`'s `setLeaveLocked(locked)` (dòng 64-67) toggle `disabled`/
`aria-disabled` trên link `#back-to-tournament` (`tournament-match.html:38`) — đây là cách
"thoát" DUY NHẤT khỏi trang trận đấu về lại trang chi tiết giải đấu. (Link logo `topnav__brand`
trỏ thẳng `index.html` không hề bị khoá — nhưng đó là thoát hẳn khỏi cả giải đấu, không phải
đường quay lại chi tiết giải mà nút này cung cấp.) Không có cơ chế khoá nào khác — đã kiểm tra,
không có `beforeunload`/`popstate` handler nào chặn điều hướng ở phía client, và phía server
(`TournamentMatchHandler.js`/`TournamentHandler.js`) không có khái niệm "khoá thoát" tương ứng —
đây thuần là 1 link bị disable qua CSS class + `aria-disabled`.

3 nơi gọi `setLeaveLocked(true)`, KHÔNG nơi nào kiểm tra người xem hiện tại có phải là 1 trong 2
người chơi hay không:

- dòng 71: khoá ngay khi trang load — TRƯỚC CẢ KHI biết `myPlayer()` là ai (guard mặc định,
  `gameState` vẫn `null` lúc này vì `tmatch:init` chưa về).
- dòng 134 (`tmatch:init` handler): khoá lại mỗi khi 1 ván mới bắt đầu/reconnect.
- dòng 779 (giữa series, sau khi 1 ván kết thúc nhưng series chưa xong): khoá lại.

Chỉ 1 nơi mở khoá — dòng 722 (`setLeaveLocked(false)`, khi pairing đã quyết định/series kết
thúc) — cũng áp dụng đồng loạt cho mọi socket trong room, không phân biệt vai trò.

`myPlayer()` (dòng 117-119, trả về entry khớp `userInfo.userId` trong `gameState.players`, hoặc
`null` nếu không khớp) và `myColor` (dòng 112, gán từ `myPlayer()` ở dòng 133) đã tồn tại sẵn
trong file và phân biệt đúng người chơi thật khỏi khán giả — kể cả khán giả là guest (guest vẫn
có `userInfo.userId` riêng, chỉ đơn giản không có entry nào trong `gameState.players` khớp với
nó) — nhưng không có lời gọi khoá nào ở trên tham chiếu tới chúng.

**Hệ quả:** bất kỳ ai vào xem trận đấu — khán giả đã đăng nhập hoặc guest xem — bị khoá nút
"Quay lại chi tiết giải đấu" y hệt 2 người chơi thật, trong suốt vòng đời trận đấu (từ lúc vào
xem tới khi ván/series kết thúc). Comment gốc tại dòng 61-63 nêu rõ mục đích khoá chỉ là
"Prevents a player from wandering off mid-series" — chưa từng có ý định áp dụng cho khán giả.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B88-khan-gia-bi-khoa-nut-quay-lai.md](../instruction/B88-khan-gia-bi-khoa-nut-quay-lai.md).

## Trạng thái

✅ ĐÃ XONG.

- **Client:** `client/js/tournament-match.js` — cả 3 nơi gọi `setLeaveLocked(true)` giờ gate theo
  `myPlayer()`/`mp`. Lock mù lúc load trang (dòng 71 cũ) đã BỎ HẲN theo đúng hướng dẫn (vì lúc đó
  `gameState` chưa có, `myPlayer()` sẽ luôn `null` bất kể vai trò thật) — mặc định không khoá cho
  tới khi `tmatch:init` biết chắc ai là người chơi. `showResultOverlay()`'s `setLeaveLocked(false)`
  giữ nguyên không điều kiện (mở khoá cho khán giả là no-op, vô hại).
- **Cache-bust:** `?v=94` → `?v=95` trên toàn bộ `client/*.html` + `client/js/*.js` (đã verify chỉ
  còn đúng 1 version qua grep).
- **Không đổi:** phía server — đã xác nhận không có cơ chế khoá điều hướng nào ở server/`beforeunload`,
  đây thuần là link bị disable phía client.
- **Test:** `client/js/` không có hạ tầng unit test — không thêm test tự động thường trực; xác
  minh qua đọc code (gate tái dùng đúng pattern `mp`/`myPlayer()` đã hoạt động đúng ở
  `showResultOverlay`/`showSeriesTransition` cùng file). `npm test`: 970/970 pass (không đổi gì
  phía server nên không có regression). Không chạy live browser/Playwright walkthrough cho fix
  này — nêu rõ thay vì bỏ qua âm thầm.
- Chi tiết đầy đủ: [docs/fix-log/2026-08-09-todo-88-tournament-match-spectator-leave-lock.md](../fix-log/2026-08-09-todo-88-tournament-match-spectator-leave-lock.md).
