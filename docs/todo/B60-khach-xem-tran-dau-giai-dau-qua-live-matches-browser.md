# Phần B #60. Khách (visitor) xem trận đấu giải đấu — qua "Live Matches Browser" mới

**Nguồn:** yêu cầu người dùng, 2026-08-07 — "Visitor is able to view tournament game. (Visitor = who
does not enroll & enrolled but not play in pairs)." Đã thảo luận + chốt thiết kế qua
`features/tournament-live-matches-browser/` trước khi ghi vào đây.

60. **Thêm bảng "Trận đang diễn ra" (live matches browser) toàn site cho khách xem giải đấu** — khi
    điều tra, phát hiện **phần lõi của yêu cầu đã hoạt động sẵn, không cần sửa gì**: `tmatch:subscribe`
    (`TournamentMatchHandler.js`) không hề kiểm tra đăng ký/tư cách người chơi — bất kỳ ai (chưa đăng
    ký giải, hoặc đã đăng ký nhưng không nằm trong cặp đang đấu) đều xem được qua nút "Xem trận" đã
    có sẵn trên `tournament.html`. Chi tiết đầy đủ trong
    `features/tournament-live-matches-browser/planning.md#current-state-findings`.
    - **Phạm vi thật sự của mục này (đã chốt với người dùng, 2026-08-07):** không phải "làm khán giả
      xem được" (đã xong), mà là thêm **một bảng liệt kê tất cả trận đang diễn ra trên toàn bộ các
      giải đấu** (không chỉ 1 giải cụ thể), để khách không cần phải đã ở đúng trang chi tiết giải đấu
      mới tìm được trận để xem. Cập nhật real-time khi trận bắt đầu/kết thúc.
    - **Phạm vi dự kiến khi triển khai:**
      - Server: hàm đọc tổng hợp (đề xuất: `TournamentManager.listLiveMatches()` hoặc helper trong
        `tournamentState.js`) duyệt `tournamentState.tournamentGameMap` hiện có (đã là nguồn dữ liệu
        đúng, không cần cấu trúc theo dõi mới), join thêm tên giải đấu + tên 2 người chơi + tiến độ
        ván/series + số khán giả (tái dùng `_getSpectators()` đã có).
      - Server: broadcast tín hiệu "danh sách trận live thay đổi" khi trận bắt đầu
        (`TournamentMatchHandler.startMatch`) hoặc kết thúc (`_endMatch`, và nhánh huỷ giải ở B59 nếu
        B59 làm trước) tới kênh mới cho bảng này.
      - Client: panel mới trong `client/tournaments.html` (sảnh chờ), subscribe kênh trên, mỗi dòng
        bấm vào gọi thẳng `goToMatch(pairingId)` đã có sẵn ở `tournament-detail.js` — **không đổi gì**
        trong `tournament-match.js`/luồng `tmatch:subscribe` hiện tại.
    - **Đánh giá hiệu quả/an toàn:** hiệu quả trung bình-cao (tiện lợi khám phá, không phải tính năng
      bảo mật/chặn lỗi) — vì phần bảo mật/quyền xem đã đúng sẵn, việc này thuần là thêm UI khám phá.
      An toàn: không có rủi ro authorization mới (không mở thêm quyền gì, chỉ tổng hợp dữ liệu đã
      public trong phạm vi từng trận). Cần chú ý giới hạn kích thước danh sách (xem câu hỏi mở) để
      tránh gửi payload lớn khi có hàng trăm trận sống cùng lúc (stress test đã cho thấy hệ thống có
      thể chạy hàng trăm ván đồng thời).
    - **Trạng thái:** ⏳ CHƯA LÀM — mới ở giai đoạn thiết kế (`features/tournament-live-matches-browser/`).
    - **Test:** chưa có gì để test (chưa có logic thật). Khi triển khai, viết Jest test cho hàm tổng
      hợp theo `features/tournament-live-matches-browser/planning.md#sequencing` bước 6 (0 trận live,
      1 trận, nhiều trận ở nhiều giải khác nhau, 1 trận kết thúc giữa danh sách, số khán giả khớp
      `_getSpectators`) — giữ lại vĩnh viễn theo rule "Bug-fix workflow" trong `CLAUDE.md`.

## Tài liệu liên quan

- [features/tournament-live-matches-browser/user_story.md](../../features/tournament-live-matches-browser/user_story.md)
- [features/tournament-live-matches-browser/planning.md](../../features/tournament-live-matches-browser/planning.md)
- [features/tournament-live-matches-browser/diagram/uml_diagram/sequence-browse-live-matches.md](../../features/tournament-live-matches-browser/diagram/uml_diagram/sequence-browse-live-matches.md)
