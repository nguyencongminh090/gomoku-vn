# B52. Trang trận đấu giải đấu UX kém — mất cân bằng bố cục (TODO.md #52)

## Hướng tiếp cận đề xuất

- **Đối chiếu trực tiếp với `room.html`'s layout đã hoàn thiện** thay vì thiết kế lại từ đầu —
  `room.html`/`room.css` đã có bố cục 2 cột đồng bộ chiều cao (`grid-template-columns: 1fr
  clamp(320px, 28vw, 420px)`, cả 2 cột cùng `height: calc(100vh - 76px)`) mà không bị khoảng trắng
  chết. `tournament-match.html` hiện dùng `.match-shell { grid-template-columns: 1fr 300px }` (flex
  column bên trong, không phải grid 2 cột đồng bộ chiều cao) — đây nhiều khả năng là nguyên nhân
  chính khiến bàn cờ và panel phải không "cùng hàng"/không giãn đều. Cân nhắc đổi
  `.match-shell`/`.match-board-wrap` sang cùng kiểu grid 2 cột + đồng bộ chiều cao như `room.html`,
  thay vì tiếp tục vá riêng lẻ trên nền flex hiện tại.
- **Trước khi sửa CSS, dùng skill `ux-audit`** (đã có sẵn trong danh sách skill) để đi qua trang
  thật như một người dùng thật — chụp lại cả PC lẫn Mobile ở nhiều độ rộng, liệt kê cụ thể từng
  điểm UX kém (không chỉ "khoảng trắng chết" mà cả spacing, tỉ lệ panel, căn chỉnh) trước khi viết
  CSS. Việc chỉ nhìn 1 ảnh chụp PC như báo cáo này không đủ để kết luận toàn bộ vấn đề.
- **Đây là việc thiết kế lại bố cục (layout), rộng hơn 1 giá trị CSS đơn lẻ** — khác hẳn phạm vi
  hẹp của #49 (chỉ 1 rule `align-self`/`max-width`). Đừng cố "vá thêm" trên nền
  `.match-shell`/`.match-board-wrap` hiện tại nếu đối chiếu với `room.html` cho thấy cần đổi hẳn
  sang cấu trúc grid 2 cột — vá từng phần nhỏ trên một cấu trúc sai gốc sẽ chỉ tạo thêm nợ kỹ
  thuật, giống rủi ro mà #49 vừa tránh được nhờ tìm đúng nguyên nhân gốc (`align-items: center`
  trên `.match-board-wrap` khiến `.board-area-shell` co lại).
- **Bắt buộc kiểm chứng bằng trình duyệt thật ở cả PC lẫn Mobile** trước khi coi là xong — như #49
  đã yêu cầu, layout/UX không có test tự động nào bắt được. Dựng 1 trận đấu giải đấu thật (theo quy
  trình Playwright/e2e đã dùng ở #49 — nhớ backup/restore `server/db/gomoku.db` theo quy tắc trong
  `CLAUDE.md`) và chụp so sánh trước/sau ở tối thiểu 3 mốc độ rộng.

## Ghi chú người dùng — cân nhắc full refactor nếu vá gia tăng quá tốn kém (2026-08-07)

Người dùng ghi chú: nếu việc dò lỗi/vá từng phần (#52 layout, và cùng cụm với #54 điều hướng, #55
click mode không đồng bộ — xem `docs/todo/B54-*.md`/`B55-*.md`) tốn chi phí trace quá cao mà UX vẫn
thấp, có thể **refactor toàn bộ `tournament-match.html` để dùng cùng UI với `room.html`** — không
chỉ tái dùng component cosmetic (tab Chat/Khán giả, đã làm ở B50) mà đồng bộ luôn cấu trúc
layout/CSS, để người chơi đã quen thao tác ở phòng chơi thường thấy quen mắt/dễ điều khiển khi vào
trận đấu giải đấu.

- Đây là 1 phương án dự phòng có điều kiện ("nếu... too costly"), không phải yêu cầu bắt buộc làm
  ngay — vẫn nên thử hướng vá có mục tiêu (đổi `.match-shell` sang grid 2 cột như đã đề xuất ở trên)
  trước; chỉ leo thang sang refactor toàn diện nếu hướng vá đó thực sự không đủ hoặc phát sinh thêm
  lỗi khó truy vết.
- **Không mâu thuẫn với ràng buộc kiến trúc đã chốt ở B48/B50** ("tournament session phải tách biệt
  khỏi `RoomHandler`/`GameHandler`") — ghi chú này chỉ nói về đồng bộ **UI/CSS/layout thị giác**,
  không đề xuất định tuyến trận đấu giải đấu qua room session thật. Nếu triển khai theo hướng này,
  vẫn giữ `TournamentMatchHandler` là chủ session riêng, chỉ mượn cấu trúc HTML/CSS của `room.html`
  làm khuôn mẫu (tương tự cách B50 bước 7 đã mượn tab Chat/Khán giả).
- Nếu chọn hướng full refactor, cân nhắc gộp luôn phạm vi #54 (điều hướng back mất tab) và #55
  (click mode không đồng bộ) vào cùng 1 đợt refactor thay vì vá riêng lẻ 3 lần — vì cả 3 đều bắt
  nguồn từ việc `tournament-match.js`/`tournament-match.html` không tái dùng đủ sâu code của
  `room.html`/`game-ui.js` ngay từ đầu. Quyết định gộp hay tách vẫn cần theo đúng quy tắc "one fix,
  one branch, one commit" trong `CLAUDE.md` — 1 branch cho đợt refactor gộp, không lẫn với các fix
  không liên quan khác.

## Ranh giới — đừng đụng

- **Đừng sửa `client/js/board.js`'s `resize()`** — vẫn là logic dùng chung với `room.html`, không
  liên quan tới vấn đề bố cục panel/khoảng trắng lần này.
- **Đừng gộp việc này vào commit/nhánh của #49** — #49 đã merge xong (`fix/tournament-match-board-size`
  → `dev`, đã xoá nhánh). #52 là 1 việc riêng, cần nhánh `fix/<slug>` mới của chính nó theo quy tắc
  Git workflow trong `CLAUDE.md` (lưu ý: nhánh này sẽ branch off `dev` chứ không phải `main`, vì
  `tournament-match.html`/`tournament.css` chỉ tồn tại trên `dev` — đúng theo exception mới ghi
  trong `CLAUDE.md`'s "Git workflow: one fix, one branch, one commit").
- **Đừng đổi nội dung/hành vi của tab Chat/Khán giả** (B50) — người dùng đã xác nhận phần đó hoạt
  động đúng, chỉ cần đổi *bố cục/kích thước* container chứa nó, không đổi logic bên trong.
