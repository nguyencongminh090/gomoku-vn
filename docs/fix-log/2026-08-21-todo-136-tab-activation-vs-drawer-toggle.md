# Fix log entry — 2026-08-21 23:47

## Prompt

"do #136" — sau khi #136 được ghi nhận là **không tái hiện được trên code hiện tại** (ảnh chụp của
người dùng là hành vi code trước bản vá #134), người dùng yêu cầu xử lý tiếp mục này.

## Action

Theo đúng `docs/instruction/B136-*.md`: không vá thêm ở lớp triệu chứng, phải có bằng chứng runtime
trước. Đã săn tiếp và tìm ra **đường thứ hai** dẫn tới đúng triệu chứng — lần này tái hiện được:

**Bind trùng handler.** Một `?v=` cũ sót lại trên bất kỳ cross-import nào khiến trình duyệt phân
giải **module instance thứ hai** của `room.js` và chạy lại top-level của nó — đúng cái bẫy mà quy
tắc cache-busting trong `CLAUDE.md` mô tả (đã ship 2 lần dưới dạng socket trùng). Hai bản listener
biến một cú **đổi tab bình thường** thành collapse: bản 1 gỡ class + đánh dấu nút active, bản 2 lúc
này thấy `alreadyActive === true` nên `toggle()` drawer đóng lại — **ở mọi viewport**, không cần
người dùng làm gì sai. Khớp cả 3 dấu hiệu của báo cáo gốc: desktop rộng, "thỉnh thoảng", và không ai
bấm gì bất thường.

Quan sát phụ khi thử nạp `room.js` lần hai trên trình duyệt thật: phiên bị **đá về `login.html`** —
socket trùng, đúng hệ quả `CLAUDE.md` đã ghi. Nói cách khác bẫy này có thật và còn gây hại rộng hơn
phạm vi #136.

**Đường thứ nhất** (`chatBtn.click()` tổng hợp trong `renderUsersList`/`renderScoreTable`) tuy đo
được là **không** collapse ở các kịch bản đã thử, vẫn là cùng một lỗi thiết kế: gửi *sự kiện DOM giả*
để diễn đạt *ý định*, rồi để handler quyết định dựa trên trạng thái DOM chứ không dựa trên ý định của
người gọi.

Bản sửa xử lý **cả hai** ở tầng gốc, không thêm cờ phát hiện:

1. `client/js/room.js`: tách `activateTab(tabId)` — thuần đổi tab, **không bao giờ** chạm
   `zen-drawer-collapsed` — và công bố `window.RoomTabs.activate`. Handler click đọc ý định
   (`alreadyActive`, `collapsedNow`) **trước** khi mutate, rồi mới gọi `activateTab` và quyết định
   drawer.
2. `client/js/room.js`: **binding guard** `document.body.dataset.roomTabsBound` — listener chỉ bind
   một lần cho mỗi document, dù module bị đánh giá bao nhiêu lần.
3. `client/js/room-ui.js`: hai chỗ bounce gọi `activateChatTab()` → `window.RoomTabs.activate`,
   không còn `chatBtn.click()` (giữ fallback click phòng khi thứ tự load đổi).

## Decision

Không đụng: bản vá #134 (`room.js` matchMedia listener), auto-collapse mobile ở
`room-socket.js:193-196`, breakpoint 768px, CSS drawer. Không thêm biến kiểu `isSyntheticClick` —
nó chỉ giấu vấn đề dưới một trạng thái mới, đúng điều `instruction.md` §B136 cấm.

Không mở rộng sang `client/js/tournament-match.js` (cũng có code tab riêng): trang khác, không có
zen drawer, ngoài phạm vi báo cáo — ghi ra đây thay vì lặng lẽ sửa kèm.

## Summary output

Test mới `client/tests/room-tab-activation-drawer.test.js` — **9 test** (jsdom):
activation không đụng drawer ở cả 2 trạng thái, activation tab đang active vô hại, tab id lạ không
crash, 2 cử chỉ thật của người dùng vẫn đúng, refit board chỉ chạy khi drawer đổi, và **2 test nạp
module hai lần** (`jest.resetModules()` + `require` lần nữa). Kiểm chứng không rỗng: bỏ bản sửa ra →
**7/9 fail**, trong đó có đúng test double-load ⇒ cơ chế bind trùng là thật, không phải suy đoán.

Verify trên trình duyệt thật (server cô lập cổng 3100, DB riêng): đổi tab khác → drawer mở
(shell 340px); bấm lại tab đang mở → collapse (56px); bấm lần nữa → mở lại (340px);
`window.RoomTabs.activate('tab-chat')` gọi trực tiếp ở **cả hai** trạng thái drawer → đổi tab đúng,
`collapsed` và shell width **không đổi** (56→56, 340→340); `document.body.dataset.roomTabsBound === "1"`.

`npm test` **1213/1213** (trước: 1204). `?v=140→141`. Nhánh
`fix/tab-activation-vs-drawer-toggle` off `dev` — theo ngoại lệ trong `git-workflow`: mục tracking
#136 chỉ tồn tại trên `dev` (`git show main:TODO.md | grep -c '#136'` → 0).
