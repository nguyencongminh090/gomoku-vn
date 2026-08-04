# Phần B #48. Triển khai tính năng Tournament (Tables & Tournaments) từ mockup

**Nguồn:** yêu cầu người dùng — thảo luận + blueprint UI cho tính năng Tournament (2026-08-04)

48. **Triển khai đầy đủ tính năng Tournament** — hiện mới có (1) tài liệu thảo
    luận ở `features/tournament/` (user stories, sơ đồ tuần tự/trạng thái,
    câu hỏi mở) và (2) mockup front-end tĩnh
    `client/tables-tournaments-mockup.html` trên nhánh
    `feature/tables-tournaments-mockup` (branch off `dev`) — **chưa có bất kỳ
    logic server/socket/DB thật nào**, chưa nối vào `index.html`/`lobby.js`
    thật. Đọc kỹ `instruction.md` §B48 trước khi làm — có nhiều quyết định
    kiến trúc chưa chốt.
    - **Điều kiện tiên quyết — chưa làm được nếu chưa xong:** toàn bộ câu hỏi
      mở trong `features/tournament/planning.md` (định nghĩa "punishment",
      nghĩa chính xác của "overtime by date", ai duyệt đổi lịch, rule theo
      từng thể thức hay dùng chung, xử lý double no-show, giới hạn
      concurrency, quan hệ với `TimerManager`, vị trí trong site nav,
      tiebreak, thuật toán ghép cặp) **phải được người dùng trả lời trước**.
    - **Phạm vi dự kiến khi triển khai:** thiết kế data model (tournament,
      round, pairing, rule set), socket handler mới **tách biệt hoàn toàn**
      khỏi `GameHandler`/`RoomHandler` (ràng buộc kiến trúc đã ghi trong
      `features/tournament/user_story.md`), nối UI mockup vào
      `client/index.html` + `client/js/lobby.js` thật (tab switcher Bàn
      chơi/Giải đấu), CRUD tournament cho Organizer, luồng lịch thi đấu
      tự-thoả-thuận + báo server (state machine đã vẽ ở
      `features/tournament/diagram/state-diagram-match-lifecycle.md`).
    - **Đánh giá hiệu quả/an toàn:** hiệu quả cao (tính năng lớn, người dùng
      chủ động đề xuất) nhưng **rủi ro cao nếu làm trước khi câu hỏi mở được
      chốt** — dễ phải làm lại data model/API. Không đánh giá được mức độ an
      toàn cụ thể cho tới khi có thiết kế server thật (ví dụ: cần rate-limit
      tạo tournament? cần kiểm tra quyền Organizer thế nào?) — để ngỏ, bổ
      sung khi có thiết kế.
    - **Trạng thái:** ⏳ CHƯA LÀM — mới ở giai đoạn discussion + mockup tĩnh.
    - **Test:** chưa có gì để test (chưa có logic thật). Khi triển khai server
      thật, áp dụng nguyên rule "Bug-fix workflow"/"Writing comprehensive test
      cases" trong `CLAUDE.md` — viết Jest test cho mọi state transition mới
      trong `server/tests/`, giữ lại vĩnh viễn, không xoá sau khi xác nhận
      pass.

---
