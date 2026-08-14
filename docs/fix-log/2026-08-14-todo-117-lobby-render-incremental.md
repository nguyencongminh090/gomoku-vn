# Fix log entry — 2026-08-14 14:00

## Prompt
Người dùng báo cáo qua chat: "Lobby load (display table) a bit slow when multi player." Yêu cầu
phân tích nguyên nhân gốc rễ, sau đó (ở lượt tiếp theo) yêu cầu ghi vào TODO.md, rồi yêu cầu làm.

## Action
Dùng `codegraph_explore` để lần theo luồng cập nhật lobby từ server tới client:
`server/socket/state.js` (`_diffLobbyRooms`/`broadcastLobbyUpdate`) đã diff + debounce 300ms đúng,
chỉ gửi `{ upserts, removed }` qua `lobby:patch`. Nhưng `client/js/lobby.js`'s `lobby:patch` handler
gọi thẳng `renderFromMap()` → `renderRoomList(currentRooms)`, hàm này build lại `innerHTML` cho
**toàn bộ** danh sách phòng bất kể chỉ 1 phòng đổi — chi phí tăng theo tổng số phòng × tần suất sự
kiện thay vì số phòng thực sự đổi, và replay animation `animate-fade-up` cho mọi hàng mỗi lần.

Sửa: tách `buildRoomRowHtml()` (build 1 hàng), thêm `updateRoomRowNode()` (cập nhật tại chỗ một
node đã có — bullet class/title, tên, meta line, không đụng animation) và `applyLobbyPatch()` (áp
`upserts`/`removed` trực tiếp lên DOM hiện có, khớp qua `data-room-id`; chỉ fallback về full-render
khi vượt biên rỗng↔không-rỗng vì khi đó cấu trúc DOM đổi hẳn). `renderRoomList()` giữ nguyên cho
đường full-snapshot (`lobby:update`) và `langchange`/`uimodechange`.

## Decision
Không đụng phần server (`_diffLobbyRooms`/`broadcastLobbyUpdate`) — đã đúng, chỉ cần client dùng
lại phần diff mà server đã tính sẵn thay vì bỏ phí. Giữ animation entrance cho hàng mới xuất hiện
(1 phòng mới trong 1 patch), bỏ hẳn animation khi chỉ cập nhật nội dung hàng đã có — đúng phần gây
tốn kém trước đây. `?v=` 118→119 (đổi `client/js/lobby.js`).

Viết `e2e/lobby-patch-incremental-render.spec.ts` (Playwright, giữ lại vĩnh viễn trong bộ e2e sẵn
có của repo) thay vì Jest — `client/js/` không có hạ tầng test tự động (theo quy tắc dự án), nhưng
repo đã có bộ e2e Playwright riêng nên spec này là guard hồi quy thật, không phải script chạy 1 lần
rồi xoá. Test seed 4 phòng, gắn `MutationObserver` lên `#room-list`, kích hoạt thay đổi ở đúng 1
phòng (người thứ 2 vào ngồi), rồi assert: chỉ `data-room-id` của phòng đó bị đụng, `#room-list`
không bị thay thế toàn bộ (childList trên chính nó tối đa 1 node thêm/bớt), và số hàng cuối cùng
không đổi.

## Summary output
TODO.md #117: lobby không còn render lại toàn bộ danh sách phòng mỗi khi có `lobby:patch` — chỉ
cập nhật đúng (các) phòng thực sự thay đổi trên DOM hiện có, dùng lại diff `{ upserts, removed }`
server đã tính sẵn thay vì bỏ phí. `client/js/lobby.js` (`buildRoomRowHtml`/`updateRoomRowNode`/
`applyLobbyPatch`), `?v=` 118→119. 1 spec Playwright mới giữ lại (`e2e/
lobby-patch-incremental-render.spec.ts`), xác minh bằng MutationObserver thật trên Chromium thật
(4 phòng seed, 1 phòng đổi → đúng 1 phòng bị đụng DOM, `#room-list` không rebuild toàn bộ, không có
console error) — không chạy được Jest vì `client/js/` không có hạ tầng đó.
