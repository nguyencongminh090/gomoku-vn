# #134 — Sidebar-tab (icon rail) "thụt vào trong" với hiệu ứng chồng ảnh khi redraw, đặc biệt sau khi kết thúc ván

**Trạng thái:** ✅ Đã sửa — **ĐÃ LÀM 2026-08-21** (`fix/sidebar-drawer-collapsed-stuck` off `main`).

Thêm `matchMedia('(max-width: 768px)').addEventListener('change', ...)` trong `client/js/room.js`
ngay sau `refitBoardAfterDrawer()` — chỉ **gỡ** `zen-drawer-collapsed` khi viewport hết hẹp, không
bao giờ tự thêm; không đổi breakpoint 768px hay cơ chế co giãn CSS hiện có của
`.panel-right-shell`. 4 test mới `client/tests/room-zen-drawer-collapsed-recovery.test.js` (kiểm
chứng không rỗng: bỏ bản sửa ra thì 1/4 fail), `npm test` **1147/1147** (trước: 1143). `?v=135→136`,
verify `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng 1 giá trị. Chi tiết
đầy đủ: [fix-log](../fix-log/2026-08-21-todo-134-sidebar-drawer-stuck-collapsed.md).

## Nguyên nhân gốc — ĐÃ XÁC NHẬN 2026-08-21

Người dùng tái hiện lại, chụp DevTools Inspector: `<body class="zen-room zen-drawer-collapsed">`
trong khi viewport thật là **1920×935** — hoàn toàn không phải mobile (breakpoint 768px). Tức là
`.panel-right-shell` đang bị khoá ở chiều rộng rail (`--zen-rail-w`) — chỉ còn icon rail hiện, toàn
bộ cột người chơi/nội dung tab (slot card, action buttons) biến mất — dù cửa sổ đang rất rộng.

Đối chiếu code xác nhận cơ chế:

- `client/js/room-socket.js:193-196` — trên **mỗi lần `game:init`** (bắn lại ở mỗi ván mới, kể cả
  ván tái đấu sau khi ván trước kết thúc), code check **một lần duy nhất**
  `window.matchMedia('(max-width: 768px)').matches` và **thêm** `zen-drawer-collapsed` vào `body`
  nếu đúng lúc đó viewport ≤768px.
- **Không có bất kỳ chỗ nào trong codebase gỡ class này khi viewport rộng trở lại** — đã grep toàn
  bộ `client/js/*.js` tìm `addEventListener('resize'` / `matchMedia`: chỉ có 3 listener resize khác
  (`history.js:487`, `game-ui.js:126`, `tournament-match.js:346`), cả 3 đều lo việc resize canvas
  bàn cờ, không đụng tới `zen-drawer-collapsed`. Điểm duy nhất khác gỡ được class này là người dùng
  **chủ động bấm lại đúng tab đang active** (`client/js/room.js:125-157`).
- ⇒ Đây là **bẫy một chiều**: nếu viewport tình cờ hẹp ≤768px đúng khoảnh khắc `game:init` chạy
  (DevTools đang docked làm hẹp viewport thật, cửa sổ trình duyệt đang trong lúc resize, zoom
  transient, v.v.) thì drawer sập xuống rail và **không bao giờ tự mở lại**, kể cả khi người dùng
  sau đó mở rộng cửa sổ ra full màn hình — đúng khớp với mô tả gốc "sometimes... nhất là khi chơi
  xong một ván" (ván tái đấu = đúng lúc `game:init` chạy lại) và hiện tượng "thụt vào trong" (chính
  là drawer bị kẹt ở trạng thái collapsed).
- Lỗi console `TypeError: can't access property "rotate" ... content.js:64:6` trong ảnh chụp DevTools
  là của một **extension trình duyệt** (tên file generic `content.js`, không thuộc source của repo),
  không liên quan tới bug này — bỏ qua.

## Bản sửa (đã làm)

Đã chọn hướng `matchMedia(...).addEventListener('change', ...)` (không phải `resize` listener) —
chỉ bắn đúng lúc query đổi trạng thái băng qua breakpoint 768px, không bắn dồn dập mỗi pixel như
`resize`. Điều kiện gỡ chặt (`!e.matches`) để không ghi đè lựa chọn chủ động của người dùng khi bấm
lại tab trong lúc vẫn đang ở mobile — đúng yêu cầu đã đặt ra: giữ nguyên hành vi auto-collapse của
`game:init` (comment giải thích lý do tồn tại tại `client/js/room.js:105-110`, không đổi), chỉ sửa
trường hợp viewport đã rộng lại mà class còn sót. Chi tiết implementation: xem
[fix-log](../fix-log/2026-08-21-todo-134-sidebar-drawer-stuck-collapsed.md).

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** khớp hoàn toàn với nguyên nhân đã xác nhận bằng bằng chứng thật (DevTools + viewport
  đo được), không phải suy đoán.
- **An toàn:** rủi ro thấp — chỉ thêm 1 listener mới trong `room.js`, không đụng breakpoint/CSS
  transition hiện có của `.panel-right-shell` hay logic mobile bottom-sheet đã tinh chỉnh ở #133.
  4 test mới xác nhận không xung đột với hành vi bấm-tab-thủ-công hiện có.

**Nguồn:** báo cáo trực tiếp người dùng kèm ảnh chụp màn hình PC (`room.html`, phòng `##22F`, lúc
modal "Sẵn sàng vào trận?" hiện lên ngay sau khi Noname đầu hàng). Mô tả gốc: "Sometime, Sidebar-tab
thụt vào trong vào khi render có hiệu ứng chồng ảnh, nhất là khi chơi xong một ván."

## Vấn đề

`room.html` luôn chạy skin `zen-room` (`<body class="zen-room">`). Trong skin này, `.sidebar-tabs`
(4 nút Trò chuyện/Bảng điểm/Khán giả/Cài đặt) được `room-zen.css` vẽ lại thành một "icon rail" dọc
cố định bám mép phải, nằm trong cùng `.panel-right-shell` với cột người chơi/nội dung tab
(`grid-template-columns: 1fr var(--zen-rail-w)`, `client/css/room-zen.css:441-450`). Khi
`zen-drawer-collapsed` dính trên `body`, `.panel-right-shell` khoá ở `--zen-rail-w` — toàn bộ cột
người chơi/nội dung tab biến mất, chỉ còn icon rail — đúng như ảnh chụp DevTools của người dùng ở
viewport 1920×935. Xem "Nguyên nhân gốc — ĐÃ XÁC NHẬN" ở trên để biết cơ chế đầy đủ.

## Test

`client/js/` không có hạ tầng test tự động sẵn có cho khu vực này — đã thêm mới
`client/tests/room-zen-drawer-collapsed-recovery.test.js` (jsdom, 4 test theo decision table class
có/không × viewport hẹp/rộng). Kiểm chứng test không rỗng: bỏ bản sửa ra (`git stash` chỉ
`client/js/room.js`) thì đúng 1/4 test fail (case kẹt-rồi-gỡ), 3 case còn lại vẫn pass. `npm test`
**1147/1147** (trước: 1143 trên `main`).
