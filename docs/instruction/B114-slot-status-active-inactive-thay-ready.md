## B114. (Chưa làm) Slot Status — Active/Inactive lấy từ `room.state`, không phải `ready`

Nối tiếp [[B113-slot-status-presence]] (4 màu dot: sẵn sàng/chưa sẵn sàng/away/
disconnected). Người dùng báo bug qua chat: bắt đầu ván làm dot "reset về
inactive" — điều tra bằng codegraph xác nhận đúng, vì `startGame()`
(`GameHandler.js:619,664`) set `ready = false` cho cả 2 người chơi (đúng ý
nghĩa "ready" — không còn ý nghĩa khi ván đã chạy), nhưng `playerStatusInfo()`
lại dùng đúng field đó làm tín hiệu hiển thị mặc định, nên rớt về màu/nhãn
"chưa sẵn sàng" ngay khi ván bắt đầu.

**Đã hỏi lại 3 vòng để chốt thiết kế — đọc kỹ, tránh lặp lại hiểu lầm ban đầu
của chính agent trong hội thoại gốc:**

1. Vòng 1: agent đề xuất "Active/Inactive theo idle-timer + activity tracking
   (mouse/click/move trong N giây)" — **bị người dùng bác**: "Are you clear?
   ... IDLE mean not playing: game_started: false". Đừng đề xuất lại hướng
   idle-timer nếu quay lại mục này sau này trừ khi người dùng chủ động đổi ý.
2. Vòng 2: phạm vi **chỉ 2 slot người chơi**, không phải mọi người trong
   phòng — người dùng viết rõ "use for SLOT STATUS, mean who playing only,
   not all user in room".
3. Định nghĩa cuối: Active = `room.state === 'playing'` (ván đã bắt đầu,
   nghĩa là 2 người chơi đủ + game đang chạy), Inactive/IDLE = ngược lại
   (chưa bắt đầu — kể cả đang chờ ghế, đang chờ trong Start modal, hay ván đã
   kết thúc quay lại phòng). Leave/Disconnect giữ nguyên y hệt #113 (trigger
   `presence`).

**Đừng nhầm "Active/Inactive" ở đây với field `ready`** — 2 khái niệm khác
nhau hoàn toàn dù dùng chung 1 dot trước đây (đó chính là bug gốc). `ready`
tiếp tục tồn tại nguyên vẹn cho Start modal (`renderStartModal`,
room-ui.js:222) — không xoá, không đổi nghĩa. Chỉ gỡ nó khỏi
`playerStatusInfo()`.

**Ưu tiên trạng thái giữ nguyên #113**: `disconnected` > `away` (đổi nhãn
thành "Leave") > trạng thái theo `room.state` (Active/Inactive). Không đảo
thứ tự — lý do gốc vẫn đúng: người mất kết nối/rời tab thì "có đang chơi hay
không" không còn ý nghĩa để hiển thị ưu tiên hơn.

**Client-only, không branch backend-lock** — khác #113 (phải mở
`feature/*` off `dev` vì đụng `server/`), mục này chỉ sửa
`client/js/room-ui.js` + CSS + i18n, dữ liệu cần (`presence`, `room.state`)
site client đã có sẵn qua `room:joined`/`room:updated`. Có thể làm trên
`ui/*` đang mở NẾU không đụng markup/class mà `ui/zen-minimal` đang restyle —
kiểm lại trước khi chọn nhánh (xem `git-workflow` skill để xác định đúng
base).

**Nhãn tiếng Việt đã chốt (2026-08-13):** Active = "Đang chơi", Inactive =
"Đang chờ" — dùng cho `title`/`aria-label` trên dot (không hiển thị chữ trực
tiếp, theo bổ sung #113).

**Bảng màu đã chốt (2026-08-13, theo color theory + quy ước semaphore chuẩn
Slack/Discord/Teams):** Active=xanh lá (`--c-success`), Inactive=xám
(`--c-border`, mặc định), Leave=cam/vàng (`--c-warning`), Disconnect=đỏ
(`--c-error`). **Đây là đổi màu so với #113**, không chỉ đổi nhãn/điều kiện —
#113 đang gán `--away` (Leave) = đỏ và `--disconnected` = cam, tức đảo ngược
thứ tự mức độ nghiêm trọng (Leave nhẹ hơn Disconnect nhưng lại đỏ). Khi sửa
CSS (`client/css/room.css:277-286`), phải đổi cả 2 modifier `--away`/
`--disconnected` để dùng đúng token màu mới, không chỉ đổi tên biến — nếu chỉ
rename mà giữ nguyên `var(--c-error)`/`var(--c-warning)` cũ thì màu vẫn sai.
Giữ nguyên cơ chế `title`/`aria-label` cho người dùng mù màu — không được coi
màu là tín hiệu duy nhất.

**Không mở rộng ra ngoài phạm vi đã chốt** — không thêm idle-timer, không áp
dụng cho khán giả, không đụng `ready`/Start modal/`server/`.

Nguồn: báo cáo người dùng qua chat + 3 vòng hỏi lại, 2026-08-13 — TODO.md
#114 — [chi tiết](docs/todo/B114-slot-status-active-inactive-thay-ready.md)
