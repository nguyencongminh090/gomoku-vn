# #50. Cho phép một cặp đấu (pairing) chơi nhiều ván (game series) thay vì chỉ một ván

**Nguồn:** yêu cầu người dùng, 2026-08-06. Đã thảo luận đầy đủ qua
`features/tournament-match-series/` (user_story.md + planning.md) trước khi ghi vào đây, theo quy
tắc "features/<slug>/" trong `CLAUDE.md`.

## Yêu cầu

Hiện tại một cặp đấu (`pairing`) trong giải đấu chỉ chơi đúng 1 ván
(`PairingLifecycle.createPairing`/`markPairingReady` → một `GameEngine` duy nhất, một `result`
duy nhất). Người dùng muốn tổ chức có thể cấu hình mỗi cặp đấu chơi **nhiều ván** theo 1 trong 2 chế
độ (tổ chức chọn theo từng giải đấu, nhập số thủ công):

1. **Số ván cố định** — chơi đúng N ván (vd 10 ván), ai tổng điểm cao hơn thắng cặp đấu.
2. **Đua tới điểm mục tiêu kèm cách biệt (race-to-margin)** — chơi tới khi một bên đạt điểm mục tiêu
   **và** cách biệt đủ lớn (vd mục tiêu 12, cách biệt 2: 13-11 thắng, 13-12 chưa đủ → chơi tiếp,
   không giới hạn số ván, dù điểm cuối có vượt xa mục tiêu ban đầu).

Điểm mỗi ván: thắng = 1, hoà = 0.5 mỗi bên, thua = 0 — cộng dồn ngay, không chơi lại ván hoà.

Áp dụng đồng nhất cho cả 3 định dạng giải đấu (Swiss, Round Robin, Double Elimination).

## Các quyết định thiết kế đã chốt (xem chi tiết + lý do ở `features/tournament-match-series/`)

- Đàm phán lịch/deadline: **một lần cho cả chuỗi ván**, không đàm phán lại từng ván.
- Vắng mặt giữa chuỗi: **xử thua cả chuỗi ván còn lại**, không chỉ ván đang chơi.
- Màu quân: **đổi bên mỗi ván**; Swap2 (nếu bật) áp dụng lại **mỗi ván**, không chỉ ván đầu.
- Đồng hồ: **mỗi ván có `TimerManager` mới**, không cộng dồn thời gian giữa các ván.
- Race-to-margin: **không giới hạn trần số ván** — chơi tới khi thoả điều kiện cách biệt.
- UI: **tái dùng giao diện phòng chơi thường (`room.html`) ở mức component/thẩm mỹ** (tab khán
  giả/chat) cho trang trận đấu giải đấu — **không** định tuyến trận đấu giải đấu qua
  `RoomHandler`/`GameHandler` thật, vẫn giữ `TournamentMatchHandler` riêng theo ràng buộc kiến trúc
  đã chốt ở B48.

## Việc cần làm khi triển khai (xem `docs/instruction/B50-*.md` để biết trình tự đề xuất)

- Mở rộng mô hình dữ liệu `pairing` (`PairingLifecycle.js`, `server/db/schema.sql`): `result` đơn
  → `games: [...]` + `seriesScore` suy ra từ đó.
- `TournamentManager`/`PairingLifecycle`: logic đánh giá "chuỗi đã ngã ngũ chưa" cho cả 2 chế độ.
- `TournamentMatchHandler`: chuyển ván kế tiếp trong cùng cặp đấu (GameEngine + TimerManager mới,
  đổi màu, Swap2 lại nếu bật).
- `RuleSet` schema: thêm `seriesMode`, `seriesGameCount`, `seriesTargetScore`, `seriesMargin` (tổ
  chức nhập tay); mặc định `seriesMode: 'single'` để không phá vỡ giải đấu/test hiện có.
- UI: chuyển các component khán giả/chat của `room.html` sang `tournament-match.html`, thêm hiển
  thị điểm số chuỗi ván đang chạy + luồng chuyển ván kế tiếp.
