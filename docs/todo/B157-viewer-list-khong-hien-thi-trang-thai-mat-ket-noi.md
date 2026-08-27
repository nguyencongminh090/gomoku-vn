# #157 — Danh sách khán giả (`tab-users`) không hiển thị trạng thái mất kết nối, khiến viewer đã rời đi vẫn hiện như đang online

**Trạng thái:** ✅ ĐÃ SỬA (2026-08-27, nhánh `fix/viewer-list-presence-indicator` off `main`)

**Nguồn:** báo cáo người dùng — "Scope: Room, User Connect (Player, Viewer), Online List,
Reconnection. User out of room but tab-user still display them name in room... but the list must be
truthful." (2026-08-27), điều tra bằng CodeGraph + đọc code.

## Đã sửa

`client/js/room-ui.js`'s `renderUsersList()` thêm nhánh đọc `g.presence`, tái dùng thẳng
`renderStatusDot()` (hàm đã có sẵn cho player ngồi ghế, cùng file) khi presence là
`'disconnected'` hoặc `'away'`. Guest ở trạng thái bình thường (`'active'`, hoặc bất kỳ giá trị nào
khác) không hiện chấm nào — giữ đúng nguyên tắc "chấm chỉ xuất hiện khi có gì bất thường cần báo"
mà `renderStatusDot`/comment gốc của nó đã nêu, thay vì bịa thêm nhãn "online" mới.

Vì `.users-list li` dùng `justify-content: space-between` cho đúng 2 cột (tên | nút mời ra), chấm
trạng thái không thể thả thẳng làm con thứ 3 (sẽ phá bố cục) — bọc `user-name` + chấm trong 1
`<span class="user-name-group">` mới (flex, `gap: 5px`), thêm CSS tương ứng trong `room.css`.

Không đụng gì ở `server/` — dữ liệu `presence` đã đúng và đã được broadcast sẵn từ #113/#115.
Không mở lại quyết định #115 (viewer-ma nằm lại `room.users` vô thời hạn) — chỉ sửa phần hiển thị.

**Xác nhận bug có trên cả `main`** (`git show main:client/js/room-ui.js` — cùng logic thiếu, không
phải hành vi riêng của `dev`) nên branch off `main`, theo đúng tiền lệ B92 (đánh số vẫn tính theo
`dev`, nhưng branch theo nơi code thật sự nằm).

4 test mới `client/tests/room-ui-viewer-presence-dot.test.js` (không hiện chấm khi active, hiện
đúng `ready-dot--disconnected`/`ready-dot--away` khi tương ứng, danh sách trộn chỉ đúng 1 người có
chấm) — xác nhận bằng mutation-kill thủ công (`git stash` chỉ `room-ui.js`/`room.css`, chạy lại):
**3/4 fail** đúng như mô tả (test "guest bình thường không có chấm" tiếp tục pass vì đó là hành vi
trước khi sửa cũng vậy). `npm test` **1151/1151** trên `main`. `?v=138→139`.

## Vấn đề (bối cảnh gốc, giữ nguyên để tra cứu)

Khi một viewer/khán giả (`slot === null`) mất kết nối, server set đúng `roomUser.presence =
'disconnected'` và broadcast xuống client (`server/socket/handlers/DisconnectHandler.js:85-91`) —
dữ liệu server hoàn toàn truthful. Nhưng client không đọc field đó khi vẽ danh sách khán giả trước
khi sửa:

```js
html += `
  <li>
    <span class="user-name">${escapeHtml(g.displayName)}${hostBadge}</span>
    ${kickBtn}
  </li>
`;
```

Trong khi đó, danh sách **player ngồi ghế** ở cùng file đã có cơ chế đúng để so sánh:
`renderSlot()` gọi `renderStatusDot(player)`, dựa trên `playerStatusInfo()` đọc `player.presence`
để vẽ chấm trạng thái. Viewer-list chưa từng làm việc tương tự — đây là nguồn gốc trực tiếp của báo
cáo "user out of room but tab-user still display them name in room".

## Hậu quả (đã khắc phục)

Một viewer đã đóng tab/rớt mạng — và theo quyết định đã chốt ở `TODO.md #115`, có thể nằm lại
`room.users` vô thời hạn — hiển thị y hệt một viewer đang thực sự có mặt trong phòng, khiến các
thành viên còn lại hiểu sai về ai thực sự đang online.

## Ngoài phạm vi (không đụng)

Việc viewer-ma nằm lại `room.users` vô thời hạn (`TODO.md #115`) và số đếm `userCount` ở sảnh đếm
luôn viewer-ma (`TODO.md #158`, đang chờ quyết định công thức đếm) — 2 việc khác, không thuộc phạm
vi fix hiển thị này.

Chi tiết hướng làm:
[docs/instruction/B157-viewer-list-khong-hien-thi-trang-thai-mat-ket-noi.md](../instruction/B157-viewer-list-khong-hien-thi-trang-thai-mat-ket-noi.md).
