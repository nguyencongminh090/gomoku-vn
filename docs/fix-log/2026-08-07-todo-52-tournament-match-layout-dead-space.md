# Fix log entry — 2026-08-07 06:59

## Prompt

"Do #52" — TODO.md #52: `tournament-match.html` UX kém dù bàn cờ đã to hơn (sau fix #49) — mất cân
bằng bố cục, khoảng trắng chết lớn ở nửa dưới và bên phải trang, cả PC lẫn Mobile.
`docs/instruction/B52-...md` đề xuất đối chiếu trực tiếp với `room.html`'s layout (grid 2 cột đồng
bộ chiều cao), dùng skill `ux-audit`/kiểm chứng bằng trình duyệt thật trước khi coi là xong, và nêu
phương án dự phòng (full refactor) nếu vá gia tăng quá tốn kém.

## Action

Đối chiếu `client/room.html`/`client/css/room.css` với `client/tournament-match.html`/
`client/css/tournament.css`, xác định 2 nguyên nhân gốc độc lập:

1. **`.lobby-layout` (lobby.css) là `grid-template-columns: 1fr 260px`** — cột 260px dành cho
   `.lobby-sidebar`, nhưng `tournament-match.html` không render sidebar này. CSS Grid vẫn dành chỗ
   cho track đã khai báo dù không có item nào chiếm — 260px bị lãng phí thành khoảng trắng chết bên
   phải toàn trang.
2. **`.match-shell` dùng `align-items: start`** (thay vì `stretch`/mặc định của grid) và
   `.match-shell .ui-core` bị cap cứng `max-height: 480px` — nên panel bên phải không bao giờ giãn
   theo chiều cao thật của cột bàn cờ (vốn đã cao hơn hẳn sau fix #49), để lại khoảng trắng chết lớn
   ở dưới panel.

Sửa trong [client/tournament-match.html](client/tournament-match.html) và
[client/css/tournament.css](client/css/tournament.css):

- Thêm modifier `.lobby-layout--single` (chỉ áp dụng cho `tournament-match.html` qua class trên
  phần tử, không đổi rule gốc `.lobby-layout` mà `index.html`/`tournament.html` vẫn cần) —
  `grid-template-columns: 1fr; max-width: 1400px`.
- Đổi `.match-shell` sang `grid-template-columns: 1fr clamp(320px, 28vw, 420px); align-items: stretch`
  (đồng bộ giá trị cột với `room.css`'s `.room`, thay vì `300px` cũ).
- Đổi `.match-shell .ui-core` từ `max-height: 480px` sang `height: 100%` (giãn đầy theo grid item đã
  stretch), giữ nguyên `max-height: 480px` chỉ trong `@media (max-width: 768px)` vì mobile xếp
  chồng 1 cột, không có gì để "đồng bộ chiều cao" theo (giống cách `room.css` reset
  `.board-area-shell`/`.panel-right-shell` về `height: auto` dưới 768px).

Không dùng `calc(100vh - Npx)` cứng như `room.css`'s `.board-area-shell`/`.panel-right-shell` — trang
này có phần header cao/thay đổi (back-link + `.detail-header` + `#swap2-banner-slot` điều kiện) mà
`room.html` không có phía trên `.room`, nên 1 hằng số vh sẽ sai lệch tuỳ nội dung header. Grid
`stretch` tự động khớp theo chiều cao thật đã render, không cần hard-code.

Bump cache-bust `?v=67 → ?v=68` (toàn bộ `client/*.html` + mọi `import '...?v='` trong
`client/js/*.js`, trừ 2 file `*-mockup.html`) — verify bằng
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` cho đúng 1 giá trị duy nhất.

**Kiểm chứng bằng trình duyệt thật (Playwright/Chromium), bắt buộc theo instruction.md — không có
test tự động nào bắt được lỗi layout này.** Viết script `socket.io-client` throwaway dựng 1 trận đấu
giải đấu thật (`tournament:create` timerSeconds:1200 → 2 guest `tournament:register` →
`tournament:start` → `report_time`/`confirm_time` → 2×`tournament:ready` → `InProgress`), nạp
`tournament-match.html?tournamentId=...&pairingId=...` với `localStorage.gvn_token` hợp lệ, đo trước
(qua `git stash`)/sau ở 3 mốc 1440px/800px/390px (đo lại cùng 1 trận, không tạo 2 trận khác nhau, để
loại yếu tố nhiễu). Trước khi khởi động server: chuyển `server/db/gomoku.db`(+`-wal`/`-shm`) ra
`*.pre-e2e`; sau khi xong: dừng server, xoá db test, phục hồi file gốc — đã xác nhận `git status
server/db/` sạch sau khi phục hồi.

## Decision

**Đi xa hơn phạm vi hẹp gợi ý ban đầu của instruction.md** (chỉ đổi `.match-shell`/
`.match-board-wrap`) — thêm phát hiện #1 (`.lobby-layout` phantom sidebar column) vì đo thực tế cho
thấy đây là nguyên nhân chính của "khoảng trắng chết bên phải" mà báo cáo mô tả, không chỉ là vấn đề
đồng bộ chiều cao 2 cột của `.match-shell`. Đây vẫn nằm trong phạm vi #52 (cùng 1 triệu chứng được
báo cáo: khoảng trắng chết ở bố cục trang này), không phải mở rộng sang việc khác.

**Không chọn hướng full-refactor** (phương án dự phòng nêu trong instruction.md) — vá có mục tiêu 2
chỗ trên đã giải quyết đúng cả 2 nguyên nhân gốc đo được, không phát sinh lỗi khó truy vết, nên
không cần leo thang.

**Phát hiện thêm 2 việc ngoài phạm vi #52, KHÔNG gộp vào fix này** (rule "scope discipline" —
CLAUDE.md), ghi riêng thành TODO.md #56:
1. Mobile (≤768px): nội dung tab (Nước đi/Trò chuyện/Khán giả) co về ~0 chiều cao — xác nhận bằng đo
   `.ui-shell.clientHeight` (chỉ 76px, đúng bằng hàng nút tab) và lấy màu pixel vùng bên dưới (khớp
   màu nền trang, không phải nội dung). **Đã xác nhận lỗi này tồn tại y hệt cả trước và sau fix #52**
   (test lại bằng `git stash`) — không phải regression, là lỗi khác gốc (flex `height:auto` +
   `flex:1` không có "không gian trống" để giãn), cần thiết kế riêng.
2. Nghi vấn `tournament.html` (trang chi tiết giải đấu) cũng dùng `.lobby-layout` mà không render
   sidebar — cùng pattern gây khoảng trắng chết như #52, nhưng **chưa kiểm chứng bằng trình duyệt
   thật** (ngoài phạm vi báo cáo #52, vốn chỉ nói về `tournament-match.html`) nên chỉ ghi nhận nghi
   vấn, không tự sửa.

Không đụng `client/js/board.js`'s `resize()` (ranh giới rõ trong instruction.md) — không cần, lỗi
hoàn toàn ở CSS layout, không phải thuật toán tính kích thước canvas.

Không đổi nội dung/hành vi tab Chat/Khán giả (B50) — chỉ đổi container bao ngoài.

Không gộp vào nhánh/commit của #49 (đã merge, đã xoá nhánh) — nhánh riêng `fix/tournament-match-layout`
theo đúng exception "branch off `dev`" trong CLAUDE.md (code này chỉ tồn tại trên `dev`).

Không thêm Jest unit test — lỗi CSS/layout thuần tuý, không có hạ tầng test tự động cho layout trong
repo này (đúng theo CLAUDE.md's bug-fix-workflow rule, kiểm chứng trình duyệt thật là cách kiểm tra
đúng/duy nhất ở đây, không phải unit test).

## Summary output

`npm test`: 809/809 passing (không đổi — chỉ sửa CSS/HTML, không đụng server code).

Đo Playwright (Chromium) cùng 1 trận đấu thật, trước/sau fix:

| Viewport | `.lobbyLayout` width trước → sau | `.ui-shell` height trước → sau | `.match-canvas` trước → sau |
|---|---|---|---|
| 1440px (desktop) | 1160px → **1400px** | 76px → **927px** | 492px → **774px** |
| 800px (tablet) | 800px → 800px (đã full trước đó ở bề rộng nhỏ hơn max-width) | 76px → **927px** | 408px → **388px** |
| 390px (mobile) | 390px → 390px | 76px → 76px (không đổi — mobile stack 1 cột, xem TODO.md #56 #1) | 358px → 358px (không đổi, đúng như kỳ vọng) |

Desktop/tablet: panel bên phải giờ giãn đầy khớp chiều cao cột bàn cờ (927px ≈ 929px của
`.match-board-wrap`, lệch 2px do padding `.ui-shell`), khoảng trắng chết bên phải trang biến mất
(`lobbyLayout` width khớp đúng viewport thay vì bị cắt còn 1160px cố định). Ảnh chụp trước/sau đính
kèm trong quá trình làm xác nhận trực quan: panel Nước đi giờ hiển thị đầy đủ chiều cao, không còn
mảng xám trống lớn bên dưới/bên phải bàn cờ.

Mobile: không đổi (đúng theo thiết kế `@media (max-width: 768px)` override — mobile không có 2 cột
để đồng bộ chiều cao). Phát hiện thêm lỗi độc lập (nội dung tab co về 76px) đã tách thành TODO.md #56,
không thuộc phạm vi sửa của #52 vì tồn tại y hệt ở cả code trước và sau fix này.
