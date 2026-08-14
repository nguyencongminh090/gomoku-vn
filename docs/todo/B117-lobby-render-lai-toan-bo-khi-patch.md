# B117 — Lobby load (bảng phòng) chậm khi nhiều người chơi: render lại toàn bộ khi patch

**Nguồn:** báo cáo người dùng qua chat — "Lobby load (display table) a bit slow when multi player" (2026-08-14)

**Trạng thái:** ✅ ĐÃ XONG (2026-08-14)

## Mô tả

Server (`server/socket/state.js`) đã tối ưu đúng: debounce 300ms (`broadcastLobbyUpdate`) +
diff thật (`_diffLobbyRooms`), chỉ gửi `{ upserts, removed }` qua sự kiện `lobby:patch`.

Nhưng client (`client/js/lobby.js`) bỏ phí phần diff đó — `lobby:patch` handler gọi thẳng
`renderFromMap()` → `renderRoomList(currentRooms)`, build lại `innerHTML` cho **toàn bộ** danh
sách phòng mỗi lần, dù chỉ 1 phòng đổi: xoá & tạo lại DOM của mọi phòng, chạy lại
`escapeHtml`/`buildRuleSummary`/`buildRoomMeta` cho từng phòng, và replay animation
`animate-fade-up` cho toàn bộ danh sách. Chi phí vì vậy tăng theo tổng số phòng × tần suất sự
kiện — càng nhiều người/phòng đồng thời càng lộ rõ.

## Đã làm (2026-08-14, `fix/lobby-render-full-list-on-patch` off `main`)

- `client/js/lobby.js`: tách `buildRoomRowHtml(room, { animate, delayIndex })` build HTML 1 hàng
  (dùng lại cho cả full-render lẫn hàng mới xuất hiện qua patch); thêm `updateRoomRowNode(node,
  room)` cập nhật tại chỗ bullet class/title + tên + meta line của 1 hàng đã có, không tạo/xoá
  DOM node, không đụng animation; thêm `applyLobbyPatch(patch)` áp `upserts`/`removed` trực tiếp
  lên DOM hiện có (khớp qua `data-room-id`, tra bằng `Map` xây một lần từ `roomListEl.children`
  thay vì `querySelector` lặp lại — tránh phải escape roomId cho CSS selector).
- Chỉ fallback về `renderRoomList()` (full rebuild) khi patch làm danh sách vượt biên
  rỗng↔không-rỗng, vì khi đó cấu trúc DOM đổi hẳn (empty-state markup ⇄ danh sách hàng) — biên
  này xảy ra tối đa 1 lần mỗi lần chuyển trạng thái, không phải mỗi patch.
- `renderRoomList()` giữ nguyên full-rebuild (với animation stagger `i * 0.04s` như cũ) cho 3
  đường gọi còn lại: `lobby:update` (full snapshot lúc subscribe/reconnect), `langchange`,
  `uimodechange` — cả 3 đều thực sự cần đổi text/markup của mọi hàng.
- `?v=` 118→119 (đổi `client/js/lobby.js`).

## Không đụng

- `server/socket/state.js` (`_diffLobbyRooms`/`broadcastLobbyUpdate`) — đã đúng từ trước, không sửa.
- `RoomManager.listRooms()` — không phải điểm nghẽn, không sửa.

## Xác minh

Không có Jest cho `client/js/` (không có hạ tầng test tự động ở đây, theo quy tắc dự án). Viết 1
spec Playwright mới **giữ lại vĩnh viễn** trong bộ e2e sẵn có của repo:
`e2e/lobby-patch-incremental-render.spec.ts` — seed 4 phòng qua flow thật (guest → quick match),
gắn `MutationObserver` thật trên `#room-list` của 1 trình duyệt quan sát, kích hoạt thay đổi ở
đúng 1 phòng (người thứ 2 vào ngồi), rồi assert: chỉ `data-room-id` của phòng đó bị đụng, thao
tác `childList` trên chính `#room-list` không thay hơn 1 node (tức không rebuild toàn bộ), và số
hàng cuối cùng không đổi. Chạy qua `npx playwright test e2e/lobby-patch-incremental-render.spec.ts
--project=chromium` với server thật (DB tạm, dời DB thật theo `playwright-e2e-safety` skill trước
khi chạy, phục hồi sau) — **PASS**, 0 console error. Test giữ lại như regression guard thường trực,
không phải script chạy 1 lần rồi xoá.
