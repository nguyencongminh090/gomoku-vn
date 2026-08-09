# B60. Khách xem trận đấu giải đấu — Live Matches Browser (TODO.md #60)

Toàn bộ quyết định thiết kế đã chốt qua thảo luận ở
`features/tournament-live-matches-browser/planning.md` — đọc file đó (và `user_story.md`) trước khi
bắt đầu. Tài liệu này chỉ tóm tắt trình tự triển khai + ranh giới.

## Phát hiện quan trọng — đọc trước khi code bất kỳ dòng nào

**Yêu cầu gốc của người dùng ("visitor có thể xem trận giải đấu") đã hoạt động sẵn 100%, không cần
sửa gì** — xem `features/tournament-live-matches-browser/planning.md#current-state-findings`:

- `TournamentMatchHandler.js`'s `tmatch:subscribe` không kiểm tra đăng ký giải/tư cách người chơi,
  chỉ kiểm tra trận có đang sống hay không (`tournamentState.tournamentGameMap.get(pairingId)`).
- `tournament.html` đã có nút "Xem trận" cho bất kỳ ai không phải 1 trong 2 người chơi của pairing
  `InProgress`.
- Client đã render đúng chế độ khán giả (`myColor === null` → ẩn hết nút hành động).

**Đừng đụng vào 3 chỗ trên** — chúng đã đúng theo đúng yêu cầu, không phải là phần việc của mục #60.
Phạm vi thật sự đã chốt với người dùng (2026-08-07) là: **thêm một bảng khám phá trận đang live
xuyên suốt toàn site**, không phải sửa cơ chế xem trận.

## Trình tự triển khai đề xuất

1. **Server — hàm tổng hợp trận live.** Đọc trực tiếp từ `tournamentState.tournamentGameMap` (đã là
   đúng nguồn dữ liệu, không tạo cấu trúc theo dõi song song mới — tránh 2 nguồn sự thật lệch nhau).
   Với mỗi entry, join thêm:
   - Tên giải đấu (`tournamentManager.tournaments.get(tournamentId).name` hoặc tương đương).
   - Tên hiển thị 2 người chơi (qua `entryByUserId`/`userIdByEntry` đối chiếu `tournament.entries`).
   - Thông tin series nếu có (`seriesInfo` — gameIndex, seriesScore — đúng shape đã gửi trong
     `tmatch:init`, xem B50).
   - Số khán giả — **tái dùng `_getSpectators(io, pairingId)`** đã có sẵn
     (`TournamentMatchHandler.js:59-87`), đừng viết lại logic đếm room membership.
   - Đặt hàm này ở đâu (`TournamentManager` hay `tournamentState.js`) — quyết định lúc code dựa trên
     việc cần join tên giải đấu ở tầng nào thuận tiện hơn, không phải quyết định thiết kế chặn.
2. **Server — broadcast khi danh sách thay đổi.** Khi trận bắt đầu (`TournamentMatchHandler`'s hàm
   bắt đầu trận — tìm đúng tên hàm hiện tại trước khi sửa, đừng giả định tên) hoặc kết thúc
   (`_endMatch`, và nhánh huỷ tournament ở B59 nếu B59 đã triển khai), bắn 1 tín hiệu nhẹ tới kênh
   dành cho bảng live-matches. **Verify trước** xem lobby đã có kênh broadcast chung nào tái dùng
   được (theo đúng pattern delta `lobby:update` ở B09) trước khi tạo kênh/room mới — đừng nhân đôi cơ
   chế nếu một cái tương tự đã tồn tại.
3. **Client — panel mới trong `tournaments.html`.** Subscribe kênh trên, render danh sách. Mỗi dòng
   bấm vào gọi thẳng `goToMatch(pairingId)` đã có sẵn (`tournament-detail.js:292-294`) —
   **không đổi gì trong `tournament-match.js`**, luồng `tmatch:subscribe` giữ nguyên 100%.
4. **Giới hạn danh sách** — cần quyết định số lượng hiển thị tối đa (đề xuất: 20, mới nhất trước)
   trước khi ship, để tránh payload lớn khi có hàng trăm trận sống cùng lúc (xem
   `features/tournament-live-matches-browser/planning.md` câu hỏi mở 2) — không chặn thiết kế, nhưng
   đừng bỏ qua khi code, dễ thành vấn đề hiệu năng thật khi tải cao (đối chiếu
   `docs/stress-test-report.md`).

## Ranh giới — đừng đụng

- **Đừng thêm bất kỳ kiểm tra đăng ký/tư cách nào vào `tmatch:subscribe` hay luồng xem trận hiện
  tại.** Cơ chế đó đã đúng theo đúng yêu cầu (ai cũng xem được, không phân biệt đã đăng ký hay chưa)
  — thêm kiểm tra vào đó là đi ngược yêu cầu gốc, không phải "làm chặt hơn cho an toàn".
- **Đừng tạo cấu trúc dữ liệu song song để track trận live** — `tournamentGameMap` đã là nguồn sự
  thật duy nhất cho "trận nào đang sống", chỉ đọc từ đó.
- **Đừng gộp việc này vào B59 (huỷ giải đấu) cùng một nhánh/commit** — hai việc độc lập, dù cùng
  nguồn yêu cầu ban đầu (câu hỏi ngày 2026-08-07). Theo đúng rule "một nhánh, một feature" trong
  `CLAUDE.md`, mỗi việc đi nhánh `feature/<slug>` riêng off `dev`.

## Tài liệu liên quan

- [features/tournament-live-matches-browser/user_story.md](../../features/tournament-live-matches-browser/user_story.md)
- [features/tournament-live-matches-browser/planning.md](../../features/tournament-live-matches-browser/planning.md)
