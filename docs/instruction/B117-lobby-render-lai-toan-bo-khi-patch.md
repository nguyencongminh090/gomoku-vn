# Instruction B117 — Lobby render lại toàn bộ khi patch

**B117.** (Đã làm 2026-08-14) Bug hiệu năng thuần client, không đụng server —
`_diffLobbyRooms`/`broadcastLobbyUpdate` (`server/socket/state.js`) đã đúng, không sửa lại phần
diff/debounce phía server. Sửa `client/js/lobby.js`: thêm `buildRoomRowHtml()` (build 1 hàng, dùng
chung cho full-render và hàng mới qua patch), `updateRoomRowNode()` (cập nhật tại chỗ 1 node đã có
— bullet class/title/tên/meta — không đụng animation), `applyLobbyPatch()` (áp `upserts`/`removed`
từ `lobby:patch` thẳng lên DOM hiện có, khớp qua `data-room-id`, dùng `Map` từ
`roomListEl.children` để tra thay vì `querySelector` lặp — tránh phải escape roomId cho CSS
selector). Giữ nguyên `client.on('lobby:update', ...)` full-render (subscribe/reconnect
snapshot) và `renderRoomList()` cho `langchange`/`uimodechange` — 3 đường này thực sự cần đổi mọi
hàng. Animation `animate-fade-up` chỉ chạy cho hàng mới xuất hiện hoặc full-render (stagger theo
index như cũ), không replay khi chỉ cập nhật nội dung hàng đã có — đây là phần gây tốn kém trước
đây. Fallback về full-render CHỈ khi patch làm danh sách vượt biên rỗng↔không-rỗng (đổi cấu trúc
DOM hẳn), không phải mỗi lần patch. `escapeHtml`/`escapeAttr` giữ nguyên khi build/cập nhật node —
không bỏ qua để tối ưu (tiền lệ chat XSS 3 vòng sửa trong `docs/fix-log.md`). Đổi `client/js/` nên
nhớ bump `?v=N` — đã bump 118→119. Không có Jest cho `client/js/`; xác minh bằng spec Playwright
mới `e2e/lobby-patch-incremental-render.spec.ts` (giữ lại vĩnh viễn trong bộ e2e sẵn có, không
phải script tạm) — `MutationObserver` thật trên Chromium xác nhận chỉ đúng 1 phòng bị đụng DOM khi
1 phòng đổi giữa nhiều phòng khác, `#room-list` không bị thay thế toàn bộ (báo cáo người dùng qua
chat, TODO.md #117) — [chi tiết](../todo/B117-lobby-render-lai-toan-bo-khi-patch.md)
