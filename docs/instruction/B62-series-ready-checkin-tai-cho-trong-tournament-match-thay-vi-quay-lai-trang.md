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

## Câu hỏi mở — đã chốt với người dùng, 2026-08-08

- **Bố cục overlay:** gộp chung 1 overlay — không tạo overlay/modal riêng nối tiếp. Bảng tỉ số ván đã
  hiển thị sẵn ở nơi khác trong `tournament-match.html` (score table kiểu Room), nên overlay chuyển
  ván chỉ cần thêm nút "Sẵn sàng" tái dùng logic/UI của Start Modal (Room, B36) — không hiển thị lại
  kết quả ván vừa xong trong overlay này vì đã trùng với score table.
- **Deadline chờ đối thủ:** dùng lại nguyên cơ chế Room hiện có
  (`readyTimers`/`READY_WINDOW_MS`/`handleReadyWindowTimeout` ở `server/socket/state.js`) — không tạo
  cơ chế deadline riêng cho series, không dùng `pairing.deadline` như một cơ chế timeout song song.
- **Không có nút "rời trận, xem sau" giữa series.** Người chơi bị khoá ở lại `tournament-match.html`
  trong suốt series — kể cả lúc đang chơi (theo hành vi hiện tại) lẫn lúc chờ check-in "Sẵn sàng"
  giữa 2 ván. Nút rời trận chỉ **release** (bật lại) sau khi toàn bộ series đã hoàn thành (đủ ván
  thắng theo `seriesMode`/best-of, hoặc series kết thúc) — lúc đó người chơi có thể chọn ở lại xem ván
  cuối hoặc tự thoát về trang giải đấu. Không giữ lối vào Ready dự phòng ở trang giải đấu cho các ván
  giữa series — chỉ còn 1 lối check-in duy nhất, ngay tại `tournament-match.html`.

## Ranh giới

- Không đổi state machine `Ready`/`InProgress` của pairing (`PairingLifecycle.js`) — chỉ đổi nơi UI
  trigger check-in.
- Không đụng luồng ván đầu tiên của pairing (từ `Ready` ban đầu, trước khi có `startMatch()` lần đầu)
  — mục này chỉ nói về check-in **giữa các ván trong cùng 1 series đã bắt đầu**, khi người chơi đã ở
  sẵn trong `tournament-match.html`.
