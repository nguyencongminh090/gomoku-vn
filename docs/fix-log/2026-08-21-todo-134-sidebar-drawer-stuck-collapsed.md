# Fix log entry — 2026-08-21 20:44

## Prompt

Người dùng báo cáo (kèm ảnh chụp màn hình PC, `room.html`, modal "Sẵn sàng vào trận?" hiện lên
ngay sau khi đối thủ đầu hàng): "Sometime, Sidebar-tab thụt vào trong vào khi render có hiệu ứng
chồng ảnh, nhất là khi chơi xong một ván." Ban đầu ghi thành TODO.md #134 dạng "chưa xác nhận
nguyên nhân, cần tái hiện trước khi sửa" (báo cáo "sometimes" không kèm bước tái hiện). Người dùng
sau đó tự tái hiện lại và gửi ảnh chụp DevTools Inspector: `<body class="zen-room
zen-drawer-collapsed">` trong khi viewport thật đo được là **1920×935** — xác nhận nguyên nhân gốc.
Được yêu cầu triển khai trực tiếp ("Do #134") sau khi đã xác nhận nguyên nhân.

## Action

Nguyên nhân: `client/js/room-socket.js`'s `game:init` handler check **một lần duy nhất**
`window.matchMedia('(max-width: 768px)').matches` rồi thêm `zen-drawer-collapsed` vào `body` nếu
đúng. Không có chỗ nào trong codebase gỡ class này khi viewport rộng trở lại (grep toàn bộ
`client/js/*.js` xác nhận: chỉ 3 listener `resize` khác, cả 3 đều lo canvas bàn cờ, không đụng
class này) — bẫy một chiều: viewport hẹp ≤768px dù chỉ đúng khoảnh khắc `game:init` chạy (DevTools
docked, cửa sổ đang resize, v.v.) khiến drawer sập xuống rail và không bao giờ tự mở lại dù cửa sổ
sau đó rộng ra bao nhiêu.

`client/js/room.js` — thêm 1 `matchMedia('(max-width: 768px)').addEventListener('change', ...)`
ngay sau định nghĩa `refitBoardAfterDrawer()`: listener **chỉ gỡ** `zen-drawer-collapsed` khi
`!e.matches` (viewport đã thực sự vượt breakpoint) và class đang có mặt; **không bao giờ tự thêm**
class (việc auto-collapse trên mobile vẫn là việc riêng của `room-socket.js`'s `game:init`, không
đổi), và không gỡ khi viewport vẫn còn hẹp. Gọi lại `refitBoardAfterDrawer()` khi gỡ (đúng khớp
"drawer đổi kích thước → board cần fit lại" như tab-click handler hiện có). Không đổi breakpoint
768px, không đổi cơ chế co giãn width/overflow-clip/flex-end hiện có của `.panel-right-shell`
(`room-zen.css:408-455`, cố ý tránh reflow chữ) — đúng theo giới hạn đã ghi trong
`docs/instruction/B134-*.md`.

## Decision

Chọn `matchMedia('change')` thay vì thêm `window.addEventListener('resize', ...)` mới — API
`matchMedia` chỉ bắn đúng lúc query đổi trạng thái (băng qua breakpoint), không bắn dồn dập mỗi
pixel resize như `resize` event, tránh chạy `refitBoardAfterDrawer()` (có `setTimeout` lồng) thừa.
Đặt việc gỡ **có điều kiện chặt** (`!e.matches`) để không vô tình ghi đè lựa chọn tự bấm tab của
người dùng khi vẫn đang ở mobile.

## Summary output

4 test mới trong `client/tests/room-zen-drawer-collapsed-recovery.test.js` (jsdom, stub
`matchMedia`/`SocketClient`/`GvnSession`, tái dùng HTML thật của `room.html`) — decision table đủ 4
tổ hợp (class có/không × viewport hẹp/rộng): kẹt-rồi-gỡ-đúng (kèm xác nhận `boardRenderer.resize()`
được gọi lại), không gỡ sớm khi còn hẹp, không tự thêm class (chỉ gỡ), no-op khi chưa từng collapse.
**Xác minh test không rỗng**: bỏ bản sửa ra (`git stash` chỉ `room.js`) → đúng 1/4 test fail (case
kẹt-rồi-gỡ), 3 case còn lại vẫn pass (đúng vì chúng không phụ thuộc listener mới). `npm test`
**1147/1147** (trước: 1143 trên `main`).

`?v=` 135→136 (đụng `client/js/room.js`), verify `grep -rn "?v=" client/*.html client/js/*.js |
grep -v mockup` ra đúng 1 giá trị (`136`).

`fix/sidebar-drawer-collapsed-stuck` off `main` (bug tồn tại sẵn trên `main`, không phải artifact
riêng của `dev`). `main` đang lệch khá xa so với `dev` về nội dung `TODO.md`/`instruction.md`
(nhiều mục #113-#133 chỉ có trên `dev`) — chèn #134 nối tiếp ngay sau #133 (bản trên `main`, trước
các vòng 2-4 chỉ có trên `dev`) theo đúng vị trí thật trên `main`, không cố gắng đồng bộ các mục
trung gian còn thiếu (nằm ngoài phạm vi việc này).
