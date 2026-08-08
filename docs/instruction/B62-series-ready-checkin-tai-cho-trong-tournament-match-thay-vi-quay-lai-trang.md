# B62. Check-in Sẵn sàng giữa các ván trong series nên tái dùng Start Modal ngay trong `tournament-match.html` — TODO.md #62

**Nguồn:** yêu cầu người dùng, 2026-08-08. Ý tưởng, chưa qua vòng `features/<slug>/` discussion vì
phạm vi nhỏ và đã rõ vấn đề gốc qua code — nhưng vẫn cần chốt vài câu hỏi mở (bên dưới) trước khi
code.

## Phạm vi

- `server/managers/tournament/PairingLifecycle.js` (`startNextGame`, dòng 314-322) và
  `TournamentManager.markPairingReady()` (dòng 488-513) — state machine `Ready`↔`InProgress` giữ
  nguyên, **không đổi** ở mục này. Đây là nơi phát ra event `pairing_ready`
  (`TournamentManager.js:509`) mà `TournamentHandler.js:228-230` lắng nghe để gọi
  `TournamentMatchHandler.startMatch()`.
- `client/js/tournament-match.js`:
  - `showSeriesTransition()`/`hideSeriesTransition()` (dòng 625-652) — overlay chuyển ván đã có sẵn,
    hiện chỉ thông báo kết quả + tỉ số, cần bổ sung nút hành động check-in tại đây (hoặc modal riêng
    mở từ đây).
  - Tìm handler socket hiện tại cho sự kiện check-in phía trang giải đấu (search
    `tournament-detail.js` cho `checkin`/`ready`/emit tương ứng `markPairingReady`) — đây là event cần
    tái sử dụng nguyên vẹn, chỉ đổi nơi trigger.
- `client/room.js` (hoặc file chứa Start Modal đã redesign ở B36) — modal cần tái dùng, xem cấu trúc
  DOM/CSS ở đó để biết phần nào tái dùng được nguyên (`#start-modal` markup/CSS) vs. phần nào phải
  viết lại riêng cho ngữ cảnh series (ví dụ Start Modal gốc có thể gắn với luồng bàn cờ mới hoàn toàn
  khác — series là ván tiếp theo trong cùng 1 pairing đã có sẵn nhiều state: tỉ số, đối thủ cố định).

## Hướng tiếp cận đề xuất

- Không tạo luồng check-in song song mới ở server — chỉ thêm 1 lối vào UI mới (nút trong
  `series-transition-overlay` hoặc modal riêng mở ra từ đó) gọi cùng socket event mà
  `tournament-detail.js` đang dùng để trigger `markPairingReady()`.
- Việc "tái sử dụng Start Modal của Room" nên hiểu là tái sử dụng **UI pattern/CSS** (modal đã
  redesign ở B36: đếm-trượt, bố cục nút) — không nhất thiết tái dùng cùng 1 DOM element/module JS,
  vì ngữ cảnh khác nhau (Room: bắt đầu ván đầu tiên trong 1 phòng thường; series: check-in ván N+1
  trong 1 pairing đã cố định 2 người chơi + tỉ số). Đối chiếu kỹ trước khi quyết định giữa "tái dùng
  y nguyên component" và "component riêng cùng style".
- Sau khi cả 2 người chơi bấm Sẵn sàng ngay tại `tournament-match.html`, server phát `pairing_ready`
  như cũ → `startMatch()` → client nhận `tmatch:init` mới cho ván tiếp theo mà **không cần
  điều hướng trang** (đã ở sẵn `tournament-match.html`).
- Vì đụng cả `server/` (nếu cần event mới) lẫn `client/` UI, áp dụng "Feature completion checklist"
  trong CLAUDE.md: verify cả 2 lớp — Jest cho phần server (nếu có state/event mới), và chạy thật
  bằng trình duyệt (2 người chơi thật hoặc 2 tab) để xác nhận cả hai bên đều check-in được tại chỗ và
  vào đúng ván kế tiếp mà không mất kết nối/state.

## Câu hỏi mở cần chốt trước khi code

- Modal check-in hiển thị đồng thời với `series-transition-overlay` (kết quả ván vừa xong), hay thay
  thế overlay đó sau vài giây? Cần tránh chồng 2 overlay cùng lúc (đúng loại lỗi đã sửa ở B35).
  Có thể ưu tiên phương án chồng nút "Sẵn sàng" vào cùng overlay để tránh thêm layer.
- Đối thủ chưa sẵn sàng (đang xem lại bàn cờ, bị rớt mạng) — hiển thị trạng thái chờ ra sao trong
  overlay mới? Đối chiếu với `readyTimers`/`READY_WINDOW_MS`/`handleReadyWindowTimeout` ở
  `server/socket/state.js` — series có deadline tương tự riêng
  (`pairing.deadline` set trong `startNextGame`) hay dùng chung cơ chế timeout Room? Cần xác nhận
  không đụng lẫn giữa 2 cơ chế deadline khác nhau.
- Có cần nút "rời trận, xem sau" (opt-out quay lại trang giải đấu) hay bắt buộc ở lại? Ảnh hưởng đến
  việc có giữ luôn lối vào Ready ở trang giải đấu như cũ (dự phòng) hay bỏ hẳn.

## Ranh giới

- Không đổi state machine `Ready`/`InProgress` của pairing (`PairingLifecycle.js`) — chỉ đổi nơi UI
  trigger check-in.
- Không đụng luồng ván đầu tiên của pairing (từ `Ready` ban đầu, trước khi có `startMatch()` lần đầu)
  — mục này chỉ nói về check-in **giữa các ván trong cùng 1 series đã bắt đầu**, khi người chơi đã ở
  sẵn trong `tournament-match.html`.
