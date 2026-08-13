# #113 — Slot Status (trạng thái hiện diện người chơi trong slot)

**Trạng thái:** ✅ ĐÃ XONG (2026-08-13, cả phần presence gốc lẫn bổ sung)

## Yêu cầu

Slot card trong phòng chỉ hiển thị 2 trạng thái sẵn có (xanh lá = sẵn sàng, xám
= chưa sẵn sàng), không phân biệt được người chơi có thực sự đang ở trang hay
không. Yêu cầu người dùng: mỗi slot hiển thị Tên + 1 trong 4 trạng thái màu:

- **Xanh lá** — sẵn sàng (đã có)
- **Xám** — chưa sẵn sàng (đã có)
- **Đỏ** — "leave site": tab vẫn mở nhưng người dùng không ở trang đó (đổi
  tab/thu nhỏ) — làm rõ qua hỏi lại: dùng Page Visibility API (`document.hidden`)
- **Cam** — "disconnected": mất kết nối/đóng site thật sự — server-authoritative,
  ăn theo grace-period 3 kịch bản có sẵn (`startEmptyRoomGrace`,
  `startSpectatorGrace`, `startDisconnectGrace`)

## Triển khai

Nhánh `feature/room-slot-presence-status` (branch off `dev`, vì cần đụng
`server/` — không đi qua `ui/*` do quy tắc backend-locked ở đó), merge vào
`dev` bằng merge commit `74dcbd5` (commit gốc `d0f3d78`).

- **Server** — `presence: 'active'|'away'|'disconnected'` thêm vào user entry
  trong room (`server/managers/RoomManager.js`): `setPresence()` mới (client
  chỉ được set `active`/`away`, không được ghi đè `disconnected` — guard chống
  race với sự kiện client trễ trong lúc đang grace); `serializeRoom()` gửi kèm
  field này qua `room:updated` như bình thường (không cần sửa gì ở
  `_diffRoomUsers` vì diff theo `JSON.stringify` toàn field, tự động bắt thay
  đổi). `DisconnectHandler.js`: cả 3 hàm start-grace set `presence='disconnected'`
  + `broadcastRoomUpdate`; `cancelDisconnectGrace` set lại `'active'` ở cả 2
  nhánh return (resume game, và "người khác vẫn đang away"). `SocketHandler.js`:
  nhánh reconnect thường (`existingRoom`) cũng phải tự reset presence — đây là
  đường cancel cho `cancelEmptyRoomGrace`/`cancelSpectatorGrace` (2 hàm đó vốn
  chỉ nhận `userId`, không có `io`/`room` để tự broadcast). `RoomHandler.js`:
  event `room:presence` mới nhận báo cáo từ client.
- **Client** — `room-socket.js`: lắng nghe `visibilitychange`, emit
  `room:presence` (chỉ khi đang trong phòng); báo presence ban đầu nếu join
  lúc tab đã ẩn sẵn. `room-ui.js`: gộp logic chọn dot/label vào
  `playerStatusInfo()`/`renderStatusDot()` dùng chung cho `renderSlot` (slot
  card) và `renderPlayersStrip` (mobile), thứ tự ưu tiên
  disconnected > away > ready > not-ready. CSS: 2 modifier mới
  `.ready-dot--away` (`var(--c-error)`, đỏ) / `.ready-dot--disconnected`
  (`var(--c-warning)`, cam) trong `client/css/room.css`. i18n: `room.status_away`
  / `room.status_disconnected` (vi + en).
- Cache-bust `?v=` 105 → 106 trên `dev`.

## Test & xác minh

- 7 unit test mới cho `RoomManager.setPresence` (default active khi tạo/join,
  away↔active, giá trị rác fallback về active, `NOT_IN_ROOM`, và case chống
  race — `disconnected` không bị ghi đè bởi sự kiện client).
- Cập nhật 2 test cũ vỡ do đổi call-site: inventory `broadcastRoomUpdate` 15→21
  site (6 site mới, liệt kê trong comment test), 1 fixture
  `SocketHandler.test.js` thiếu `.users` trên mock room.
- `npm test`: **1131/1131 pass**.
- Xác minh trực tiếp bằng Playwright, 2 trình duyệt thật qua server cục bộ
  (không đụng DB thật — worktree + DB riêng, theo đúng quy tắc db-safety của
  repo): ẩn tab → chấm đỏ "Đang rời trang" hiện ở tab kia trong vài trăm ms;
  đóng tab (context) → chấm cam "Mất kết nối"; quay lại tab → về xanh/xám bình
  thường.

## Vị trí hiện tại

- Có trên `dev`/`origin/dev`.
- **Chưa** có trên `main`.
- **Chưa** có trên `ui/zen-minimal` (nhánh UI đang làm dở) — sẽ tự có mặt khi
  nhánh đó merge vào `dev`, vì đây thuần là thay đổi `server/` + class CSS
  mới, không đụng markup/CSS mà `ui/zen-minimal` đang restyle.

## Sự cố phụ trong lúc làm (đã xử lý, không phải phần việc chính)

Lúc dọn dẹp server xác minh, `pkill -f "node server/index.js"` (pattern quá
rộng) lỡ giết luôn 1 server cổng 3000 không phải do agent khởi động — đã khởi
động lại ngay (dữ liệu DB nguyên vẹn, chỉ mất state phiên/room đang mở trong
bộ nhớ). Cũng lỡ `rm` trúng 1 file backup DB có track trong git
(`server/db/gomoku.db.bak-pre-migration-20260801171535`) do dùng glob
`gomoku.db*` — đã `git checkout` khôi phục ngay, xác nhận đúng kích thước gốc.
Không có thiệt hại lâu dài, nhưng ghi lại làm bài học: không dùng `pkill -f`
theo pattern rộng, không dùng `rm` với glob gần file có track git mà chưa
`git status` kiểm trước.

## Bổ sung 2026-08-13 (yêu cầu người dùng) — ĐÃ LÀM

1. **Không dùng chữ** (vd "Chưa sẵn sàng", "Sẵn sàng", "Đang rời trang", "Mất
   kết nối") ở slot — chỉ dùng ký hiệu (circle hoặc bar) tô màu theo trạng
   thái. Mục đích: tối ưu không gian hiển thị, giảm nhiễu thị giác.
2. **Không ghi "Chủ phòng" ở slot** — bỏ role badge khỏi slot card.

**Triển khai:** `client/js/room-ui.js` — `renderStatusDot()` (dùng chung cho
slot card + mobile players-strip) bỏ hẳn `<span class="ready-text">`, chỉ còn
1 `<span class="ready-dot ...">` — nhãn cũ ("Sẵn sàng"/"Chưa sẵn sàng"/"Đang
rời trang"/"Mất kết nối") chuyển sang `title` + `aria-label` (`role="img"`)
trên chính dot thay vì xoá hẳn, để giữ đường thoát cho hover/screen reader.
`renderSlot()` bỏ hẳn biến `roleBadge`/dòng render "Chủ phòng" — **chỉ ở slot
card**, không đụng badge "CP" tương tự ở `renderUsersList()` (danh sách người
xem, khác class dùng chung `.slot-card__role--host` nhưng là UI khác, ngoài
phạm vi yêu cầu). CSS (`client/css/room.css`): xoá hẳn `.ready-text`/4 biến
thể màu (không còn nơi nào dùng), tăng `.ready-dot` từ 7px → 9px vì giờ là
tín hiệu trạng thái DUY NHẤT, cần dễ nhìn hơn. Cache-bust `?v=` 106 → 107.

**Test & xác minh:** không có test infra cho `client/js/` (đúng hiện trạng
repo, không viết test throwaway); `npm test` 1131/1131 (không đổi, thay đổi
thuần client). Xác minh trực tiếp bằng Playwright qua server cục bộ riêng
(worktree + DB + `.env`/`CORS_ORIGIN` riêng, dọn dẹp bằng kill theo PID cụ thể
— không lặp lại lỗi `pkill -f` trước đó): tạo phòng, ngồi vào slot với vai trò
host, đọc HTML thực tế của `#slot-1-content` — xác nhận không còn
`slot-card__role`/"Chủ phòng" trong markup, không còn `<span class="ready-text`,
chỉ 1 `<span class="ready-dot ...">` với `title`/`aria-label` = "Chưa sẵn
sàng" đúng nhãn.

