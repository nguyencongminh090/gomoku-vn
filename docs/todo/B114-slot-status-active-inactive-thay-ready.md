# #114 — Slot Status: đổi nguồn Active/Inactive từ `ready` sang `room.state === 'playing'`

**Trạng thái:** ✅ ĐÃ XONG (2026-08-13)

## Bối cảnh — vì sao có mục này

Theo dõi báo cáo người dùng: "User status is not track. On user start game, it
reset to inactive." Điều tra bằng codegraph xác nhận đúng: `playerStatusInfo()`
(`client/js/room-ui.js:111-122`, dựng ở #113) coi `player.ready` là nhánh mặc
định sau `disconnected`/`away`. `GameHandler.js` (`startGame()`, dòng 619 và
664) set `u.ready = false` cho cả 2 người chơi mỗi khi ván đấu bắt đầu — đúng
về mặt "ready" (không còn ý nghĩa "sẵn sàng" khi ván đã chạy), nhưng vì UI dùng
chung field này làm tín hiệu hiển thị, dot tụt về đúng màu/nhãn "chưa sẵn sàng"
ngay khi ván bắt đầu — nhìn như trạng thái "reset về inactive" dù người chơi
đang chơi thật.

## Yêu cầu đã chốt (hỏi lại người dùng qua chat, 2026-08-13)

**Phạm vi: CHỈ áp dụng cho 2 slot người chơi (slot 1/2)** — không phải toàn bộ
người trong phòng (khán giả không có khái niệm "đang chơi").

4 trạng thái, đổi tên + đổi nguồn dữ liệu so với #113:

| Trạng thái | Điều kiện | So với #113 |
|---|---|---|
| **Disconnect** | `presence === 'disconnected'` | Giữ nguyên, không đổi |
| **Leave** | `presence === 'away'` (tab ẩn, Page Visibility API) | Đổi tên nhãn từ "leave site"/away — TRIGGER giữ nguyên y hệt #113, không phải cơ chế mới |
| **Active** | `room.state === 'playing'` (ván đấu đã bắt đầu, đối thủ đủ) | **MỚI** — thay hẳn `player.ready === true` |
| **Inactive (IDLE)** | Còn lại (ván CHƯA bắt đầu — chờ ghế, chờ trong Start modal, ván đã kết thúc) | **MỚI** — thay hẳn `player.ready === false` |

Thứ tự ưu tiên giữ nguyên như #113: `disconnected` > `away`(Leave) >
game-state-derived (Active/Inactive).

**Điểm mấu chốt người dùng nhấn mạnh** (đọc kỹ trước khi code, tránh hiểu lầm
như bản nháp đầu bị bác):
- **Active/Inactive KHÔNG phải activity/idle-timer** (không theo dõi
  click/move/chat cuối cùng, không có ngưỡng giây nào cả) — đây là hiểu lầm
  ban đầu của agent, bị người dùng chỉnh lại. Active nghĩa đơn giản là "ván
  đấu của họ đã bắt đầu" (`game_started: true`), Inactive là ngược lại
  (`game_started: false`). Không thêm cơ chế đo hoạt động nào.
- Field `player.ready` **giữ nguyên, không xoá, không đổi ý nghĩa** — vẫn là
  checkbox "sẵn sàng" trước ván (dùng ở Start modal — xem `renderStartModal()`
  room-ui.js:222). Chỉ **không còn được `playerStatusInfo()` đọc** nữa.

## Việc cần làm (client-only, không đụng server)

- `client/js/room-ui.js` — `playerStatusInfo(player)`: thêm tham số/đọc
  `st.roomData.state` (đã có sẵn trong `S()`), đổi 2 nhánh cuối:
  - `disconnected`/`away` giữ nguyên logic, chỉ đổi nhãn `away` → "Leave"
    (i18n key giữ hay đổi tuỳ rà soát `room.status_away` hiện dùng ở đâu khác).
  - Nhánh `player.ready` → đổi điều kiện thành `st.roomData.state === 'playing'`
    (cần truyền `roomData.state` vào hàm hoặc đọc qua `S()` y như các hàm khác
    trong file đã làm — xem `renderSlot()` đọc `st.roomData.state` trực tiếp).
  - Đổi 2 label còn lại từ "Sẵn sàng"/"Chưa sẵn sàng" sang "Active"/"Inactive"
    (hoặc tiếng Việt tương đương — cần hỏi lại người dùng bản dịch nào, xem
    mục "Câu hỏi mở" bên dưới).
- CSS (`client/css/room.css`): modifier `.ready-dot` hiện có 4 biến thể
  (default/`--ready`/`--away`/`--disconnected`) — đổi màu/tên class cho khớp
  ngữ nghĩa mới nếu cần (vd. `--ready` hiện xanh lá cho "sẵn sàng", có thể giữ
  màu đó cho "Active" vì ý nghĩa tương tự "đang hoạt động tốt"; default xám
  cho "Inactive" cũng hợp lý — cân nhắc giữ nguyên bộ màu, chỉ đổi *điều kiện*
  kích hoạt và *nhãn* hiển thị, xem instruction.md §B114 để không đổi màu học
  lại từ đầu không cần thiết).
- i18n: `room.ready`/`room.not_ready` hiện dùng cho nhãn — kiểm tra 2 key này
  có dùng ở nơi khác không (vd. Start modal) trước khi đổi nghĩa/xoá; nếu có
  dùng chung thì phải thêm key mới riêng cho status dot thay vì sửa key cũ.
- `?v=N` bump bắt buộc theo quy tắc cache-busting của repo (đã ở 107, xem
  #113 bổ sung — tăng lên số kế tiếp khi làm).

## Việc KHÔNG làm (ngoài phạm vi #114)

- Không thêm idle-timer/activity-tracking (đã bị người dùng bác ở vòng hỏi
  lại đầu tiên — xem hội thoại gốc).
- Không mở rộng phạm vi ra ngoài 2 slot người chơi (khán giả không đổi).
- Không đổi field `ready` hay logic Start modal (`renderStartModal`).
- Không đụng `server/` — toàn bộ dữ liệu cần (`presence`, `room.state`) đã có
  sẵn trên client qua `room:joined`/`room:updated`.

## Câu hỏi mở (hỏi lại người dùng trước khi code)

- ~~Nhãn hiển thị tiếng Việt cho Active/Inactive?~~ **ĐÃ CHỐT (2026-08-13):**
  Active = **"Đang chơi"**, Inactive = **"Đang chờ"** (dùng cho `title`/
  `aria-label` trên dot, vì #113 bổ sung đã bỏ chữ hiển thị trực tiếp trên UI).
- ~~Giữ nguyên bảng màu hiện có hay đổi?~~ **ĐÃ CHỐT (2026-08-13):** đổi theo
  quy ước semaphore chuẩn (Slack/Discord/Teams) — sửa lỗi đảo thứ tự mức độ
  nghiêm trọng đang có ở #113:

  | Trạng thái | Màu mới | Token | So với #113 |
  |---|---|---|---|
  | Active (Đang chơi) | 🟢 Xanh lá | `--c-success` | Giữ nguyên (đổi từ `--ready`) |
  | Inactive (Đang chờ) | ⚪ Xám | `--c-border` (mặc định) | Giữ nguyên (đổi từ `--not-ready`) |
  | Leave | 🟡 Cam/vàng | `--c-warning` | **ĐỔI** — #113 đang dùng đỏ (`--c-error`) |
  | Disconnect | 🔴 Đỏ | `--c-error` | **ĐỔI** — #113 đang dùng cam (`--c-warning`) |

  Lý do đổi: mức độ nghiêm trọng phải tăng dần xanh→xám→cam→đỏ; #113 đang
  ngược (Leave nhẹ hơn nhưng lại đỏ, Disconnect nặng hơn nhưng lại cam). Màu
  không phải tín hiệu duy nhất — `title`/`aria-label` trên dot (đã có từ #113
  bổ sung) vẫn giữ nguyên cho người dùng mù màu.

Nguồn: báo cáo người dùng qua chat + 3 vòng hỏi lại làm rõ thiết kế, 2026-08-13
— xem [instruction B114](docs/instruction/B114-slot-status-active-inactive-thay-ready.md)

## Triển khai (ĐÃ LÀM 2026-08-13)

Branch `feature/slot-status-active-inactive` off `dev` (client-only, không
đụng `server/` nên không cần backend-lock check của `ui/*`).

- `client/js/room-ui.js` — `playerStatusInfo()`: nhánh cuối đổi từ
  `player.ready` sang `S().roomData.state === 'playing'`; field `ready`
  không còn được đọc trong hàm này (vẫn nguyên vẹn ở `renderStartModal`/
  `global.RoomClient.emit('room:ready')`).
- `client/css/room.css`: `.ready-dot--ready` → `.ready-dot--active` (giữ màu
  `--c-success`); `.ready-dot--away` đổi từ `--c-error` → `--c-warning`;
  `.ready-dot--disconnected` đổi từ `--c-warning` → `--c-error` (đảo màu theo
  bảng đã chốt ở trên). Nhánh Inactive dùng lại modifier rỗng có sẵn (nền
  `--c-border` xám, không cần class mới).
- i18n (`client/js/i18n.js`, cả `vi`+`en`): xoá `room.ready`/`room.not_ready`
  (xác nhận bằng grep không còn nơi nào khác dùng 2 key này ngoài
  `playerStatusInfo`), thêm `room.status_active` ("Đang chơi"/"Playing") và
  `room.status_waiting` ("Đang chờ"/"Waiting").
- `?v=` 118 → 119, xác minh bằng grep cache-bust của `CLAUDE.md` (đúng 1 giá
  trị duy nhất trên toàn repo).

## Test & xác minh

- 4 unit test mới (`client/tests/room-slot-status-active-inactive.test.js`,
  cùng kiểu `window.eval` + jsdom như
  `client/tests/board-touch-scroll-prevention.test.js`): xác nhận đúng ngay
  kịch bản gốc của bug (`room.state==='playing'` + `ready:false` từ
  `startGame()` reset → vẫn ra Active, không rớt về Inactive), Inactive khi
  `state!=='playing'` dù `ready:true`, và thứ tự ưu tiên away/disconnected
  đè lên Active vẫn đúng. `npm test`: **1135/1135 pass** (1131 cũ + 4 mới).
- Xác minh trực tiếp bằng Playwright 2 trình duyệt thật qua server cục bộ
  (worktree DB riêng theo `playwright-e2e-safety`, `CORS_ORIGIN=http://
  localhost:3901` theo pitfall đã ghi ở #113): tạo phòng thật, 2 guest ngồi
  2 ghế, cả 2 bấm Start — dot chuyển đúng `ready-dot--active`/"Đang chơi"
  (KHÔNG rớt về "chưa sẵn sàng" như bug gốc); trước khi bắt đầu dot đúng
  "Đang chờ" (không modifier); p2 ẩn tab giữa ván → p1 thấy dot p2 chuyển
  `ready-dot--away`/"Đang rời trang" đúng ưu tiên. Đọc `getComputedStyle`
  xác nhận màu thực tế: Active = `rgb(16,185,129)` (xanh lá, `--c-success`),
  Away = `rgb(245,158,11)` (cam/vàng, `--c-warning`) — đúng bảng màu đã chốt.
  Dọn dẹp: kill server theo PID cụ thể, khôi phục `gomoku.db` thật, xác nhận
  `git status server/db/` sạch.
