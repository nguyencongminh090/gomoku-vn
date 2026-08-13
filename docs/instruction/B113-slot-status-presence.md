## B113. (Chưa xong — bổ sung 2026-08-13) Slot Status — 4 trạng thái hiện diện người chơi

Yêu cầu người dùng qua chat, làm rõ bằng hỏi lại (không phải báo cáo/audit có
sẵn): slot hiển thị Tên + trạng thái màu — xanh lá (sẵn sàng, đã có), xám
(chưa sẵn sàng, đã có), đỏ ("leave site" = tab mở nhưng không ở trang, dùng
Page Visibility API), cam ("disconnected" = mất kết nối thật, server-side).

**Branch:** đây là thay đổi `server/` (thêm field `presence` vào room user,
event socket mới, sửa `DisconnectHandler.js`/`SocketHandler.js`) nên **không**
được làm trên nhánh `ui/*` đang mở (`ui/room-zen-drawer`/`ui/zen-minimal`) —
backend-locked ở đó theo quy tắc riêng. Phải mở `feature/room-slot-presence-status`
branch off `dev` (dùng `git worktree add` để không đụng working tree
`ui/zen-minimal` đang có nhiều file uncommitted), làm xong merge `--no-ff` vào
`dev`, xoá worktree + branch sau khi merge.

**"Disconnected" phải server-authoritative, không tin sự kiện client mù
quáng** — nếu chỉ dựa vào client tự báo "tôi mất kết nối" (vô nghĩa, client
mất kết nối thì không gửi được gì) hay để một `room:presence` trễ/rớt-do-race
ghi đè lên trạng thái mà `DisconnectHandler.js` vừa set trong lúc đang chạy
grace period, dot sẽ nhấp nháy sai. Cách đúng: `RoomManager.setPresence()` chỉ
nhận `active`/`away` từ client và **no-op nếu `user.presence === 'disconnected'`
đang đứng** — chỉ có `DisconnectHandler.js`/`SocketHandler.js` (nơi thực sự
biết socket còn sống hay không) được phép set/clear `disconnected`.

**Đừng quên broadcast ở TẤT CẢ các điểm set/clear presence** — bài học từ khi
sửa: có tới 3 hàm start-grace khác nhau (`startEmptyRoomGrace`,
`startSpectatorGrace`, `startDisconnectGrace`) và 3 đường reconnect khác nhau
(`cancelDisconnectGrace` — 2 nhánh return riêng, cộng đường reconnect thường
qua `SocketHandler.js` cho 2 hàm cancel kia vốn không nhận `io`/`room`). Thiếu
1 trong 6 điểm này thì dot bị kẹt sai trạng thái ở phía những người dùng khác
trong phòng cho tới lần `room:updated` kế tiếp (có thể rất lâu). Có test
inventory (`RoomManager.test.js`, đếm số lần gọi `broadcastRoomUpdate(io`)
để bắt đúng loại thiếu-sót này — khi thêm site mới phải cập nhật cả số đếm
kỳ vọng lẫn comment giải thích tại sao tăng.

**Kiểm bằng Playwright 2 trình duyệt thật, không chỉ unit test** — 4 trạng
thái này chỉ có ý nghĩa khi 1 người dùng thấy trạng thái CỦA NGƯỜI KHÁC đúng
theo thời gian thực; unit test cho `RoomManager.setPresence()` xác nhận state
transition đúng ở tầng dữ liệu nhưng không chứng minh được việc dot thực sự
đổi màu trên UI khi tab bị ẩn hay socket rớt. Theo đúng "Feature completion
checklist" của repo — chạy 2 context Playwright thật, verify DOM class đổi
đúng, không chỉ đọc code.

**Pitfall khi set up server xác minh cục bộ** (đã gặp, ghi lại để không lặp
lại): `CORS_ORIGIN` trong `.env` set theo domain production nên socket.io
handshake từ `localhost` bị `Auth` middleware chặn ("bad origin") — không có
lỗi rõ ràng ở client ngoài overlay "Đang vào phòng..." treo mãi; phải override
`CORS_ORIGIN=http://localhost:<port>` khi chạy server xác minh cục bộ. Dọn dẹp
server xác minh phải kill theo PID cụ thể (`ss -ltnp | grep :<port>` rồi
`kill <pid>`), **tuyệt đối không `pkill -f "node server/index.js"`** — pattern
này khớp mọi server cùng lệnh khởi động, kể cả server thật của người dùng đang
chạy trên port khác không do agent khởi động (đã xảy ra, xem
[[B113-slot-status-presence]] phần "Sự cố phụ" trong `docs/todo/`). Tương tự,
dọn `server/db/gomoku.db*` bằng `rm` glob rủi ro trúng file backup có track
git nằm cùng thư mục (`gomoku.db.bak-pre-migration-*`) — liệt kê từng file cụ
thể thay vì dùng glob, hoặc `git status` trước khi `rm`.

## Bổ sung 2026-08-13: bỏ chữ, bỏ badge chủ phòng

Sau khi phần presence xong, người dùng yêu cầu 2 việc thuần UI (client-only,
**không cần** đụng `server/` lần này, nên có thể làm ngay trên nhánh
`feature/*` mới off `dev` mà không cần lo backend-lock):

1. **Bỏ text trạng thái, chỉ giữ ký hiệu màu** — mục đích nêu rõ là tối ưu
   không gian + giảm nhiễu, không phải yêu cầu a11y. Vẫn phải giữ đường thoát
   cho accessibility (không im lặng bỏ hẳn thông tin): chuyển label hiện có
   sang `title`/`aria-label` trên chính dot thay vì xoá hẳn — người dùng chỉ
   nói "không dùng chữ" (ý là không hiển thị chữ trên UI), không nói "không
   cần mô tả trạng thái cho screen reader/hover".
2. **Bỏ badge "Chủ phòng" khỏi slot** — chỉ ở `renderSlot()`/slot card. Không
   tự ý mở rộng sang danh sách người dùng chung (`renderUsersList`) hay nơi
   khác — yêu cầu chỉ nói "ở slot".

Nguồn: yêu cầu người dùng qua chat (làm rõ 2 lượt hỏi), 2026-08-13 — TODO.md
#113 — [chi tiết](docs/todo/B113-slot-status-presence.md)
