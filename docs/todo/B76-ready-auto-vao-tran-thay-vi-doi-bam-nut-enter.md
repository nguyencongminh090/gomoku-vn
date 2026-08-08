# #76 — Sẵn sàng (Ready) nên tự động vào trận, không đợi bấm "Vào trận"

**Trạng thái:** ✅ ĐÃ XONG

Đã sửa `client/js/tournament-detail.js`: thêm `checkAutoEnterMatch()`, gọi
sau cả `tournament:detail` (load lần đầu/F5 giữa ván) lẫn
`tournament:pairings_patch` (cập nhật real-time) — tự động `goToMatch()` khi
pairing của chính người chơi (`isMinePairing()`) chuyển sang `InProgress`,
không đụng luồng khán giả. Xác minh bằng Playwright thật (2 guest, throwaway
DB, server thay thế cổng 3001) — Player A "Sẵn sàng" một mình không bị điều
hướng, cả 2 "Sẵn sàng" xong thì cả 2 tự vào `tournament-match.html` không cần
bấm "Vào trận". `npm test` 931/931. Chi tiết đầy đủ:
[docs/fix-log/2026-08-08-todo-76-tournament-ready-auto-enter.md](../fix-log/2026-08-08-todo-76-tournament-ready-auto-enter.md).

## Báo cáo gốc (người dùng, 2026-08-08)

> Tournament -> Pair -> Sẵn sàng -> Vào trận. Tôi thấy logic ở đây chưa tốt.
> Cải thiện: Khi 2 bên nhấn Sẵn sàng -> Tự động vào trận.
> Hiện tại: Nhấn sẵn sàng -> nhấn vào trận, người vào trận trước, người kia
> chưa vào nhưng đã đếm thời gian -> sai time.
> Vì vậy: Sẵn sàng -> Vào trận.

## Xác nhận qua code (codegraph, 2026-08-08)

Đúng như báo cáo mô tả — đã đọc trực tiếp, không suy diễn:

- `TournamentManager.markPairingReady()` (`server/managers/tournament/TournamentManager.js:488-513`):
  khi cả 2 bên gọi `tournament:ready` (`result.bothReady === true`), server
  chuyển pairing sang `InProgress` **và gọi `result.timer.start()` ngay lập
  tức** (dòng 505) — đồng hồ bắt đầu chạy tại thời điểm cả 2 cùng "Sẵn sàng",
  không phải tại thời điểm người chơi thực sự vào phòng trận đấu.
- `renderPairingCard()` (`client/js/tournament-detail.js:421-424`): khi
  `pairing.state === 'InProgress'`, client chỉ hiện nút `data-action="enter"`
  (`t('tdetail.btn_enter_match')`) — người chơi phải tự bấm.
- `handlePairingAction()` (`client/js/tournament-detail.js:513`): bấm nút đó
  mới gọi `goToMatch(pairingId)` → `window.location.href = 'tournament-match.html?...'`.

→ Khoảng thời gian giữa lúc server start timer (cả 2 vừa "Sẵn sàng") và lúc
từng người thực sự bấm "Vào trận" bị tính vào đồng hồ của họ — và 2 người
thường không bấm cùng lúc, nên một bên bị trừ giờ oan trước khi ván đấu thực
sự bắt đầu hiển thị trên màn hình. Đây là bug thật, không phải cảm nhận sai.

## Hướng giải pháp (đề xuất, cần xác nhận qua `instruction.md` §B76 trước khi code)

Khi pairing chuyển sang `InProgress` (tức `bothReady` — sự kiện
`tournament:pairing_changed` hoặc tương đương báo state mới) và người xem
trang là 1 trong 2 người chơi của pairing đó, tự động gọi `goToMatch()` thay
vì chờ bấm nút — loại bỏ bước thao tác thừa gây lệch thời gian vào trận giữa
2 bên.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** cao — giải quyết đúng nguyên nhân gốc (khoảng trễ thao tác
  thủ công giữa lúc timer server-side start và lúc client vào trận), không
  chỉ là patch bề mặt.
- **An toàn:** cần cẩn thận không phá vỡ trường hợp **khán giả** (spectator)
  xem `InProgress` — nút hiện tại cho khán giả là `btn_watch_match` cùng
  `data-action="enter"` (dòng 423) nhưng khán giả **không nên** bị tự động
  điều hướng ngoài ý muốn khi đang xem trang giải đấu; chỉ tự-điều-hướng cho
  2 người chơi thực sự của pairing (`isMine`), như bug report mô tả.
- Cũng cần soát: pairing đã ở `InProgress` từ trước khi trang được load lần
  đầu (vd. reload/F5 giữa ván) — tự-điều-hướng lúc đó là **đúng mong muốn**
  (người chơi quay lại `tournament-detail.html` giữa ván nên được đưa thẳng
  vào lại trận), khác với việc chỉ điều hướng đúng 1 lần tại thời điểm
  chuyển trạng thái.

## Trạng thái unit test

Chưa viết — chưa implement. Theo rule "Bug-fix workflow" trong `CLAUDE.md`,
phần điều hướng nằm ở `client/js/tournament-detail.js` (client-side, hiện
không có test infra `npm test` bao phủ) — sẽ ghi rõ trong summary khi làm là
không có test tự động, xác minh bằng browser thật (2 người chơi đồng thời)
thay vì Jest.
