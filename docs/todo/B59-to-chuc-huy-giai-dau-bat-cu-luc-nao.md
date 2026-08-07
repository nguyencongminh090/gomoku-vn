# Phần B #59. Organizer huỷ giải đấu (bất cứ lúc nào)

**Nguồn:** yêu cầu người dùng, 2026-08-07 — "Organizer can cancel Tournament (any time)." Đã thảo
luận + chốt thiết kế qua `features/tournament-cancel/` trước khi ghi vào đây (đúng quy trình
discussion-folder trong `CLAUDE.md`).

59. **Thêm khả năng Organizer huỷ giải đấu tại bất kỳ thời điểm nào trước khi hoàn thành** — hiện
    tournament chỉ có 3 trạng thái `draft → active → completed`, không có cách nào để dừng giữa
    chừng. Toàn bộ quyết định thiết kế đã chốt trong `features/tournament-cancel/user_story.md` +
    `planning.md`. Đọc `instruction.md` §B59 trước khi làm — có vài chi tiết triển khai chưa chốt
    (xem "câu hỏi mở không chặn" trong `planning.md`).
    - **Điều kiện tiên quyết:** không có — các quyết định chặn triển khai (live match xử lý ra sao,
      có tính bảng xếp hạng tạm không) đã được người dùng trả lời qua `AskUserQuestion` ngày
      2026-08-07, ghi lại trong `features/tournament-cancel/planning.md`.
    - **Phạm vi dự kiến khi triển khai:**
      - Trạng thái mới `cancelled` (từ `draft` hoặc `active`, không từ `completed`).
      - `TournamentManager.cancelTournament(organizerId, tournamentId, reason)` — kiểm tra
        `ORGANIZER_ONLY` giống `startTournament()`.
      - Buộc kết thúc **mọi** pairing chưa terminal của giải: pairing đang `InProgress` (trận sống)
        bị dừng ngay lập tức (tắt `TimerManager`, đóng phòng socket `tournament-match:<pairingId>`,
        không ghi người thắng); pairing ở các state khác (`Paired`/`Negotiating`/`Reported`/`Ready`)
        chuyển thẳng sang trạng thái terminal, không cần đụng socket.
      - Tính bảng xếp hạng tạm (partial standings) từ các pairing đã `Completed` trước khi huỷ, hiển
        thị rõ đây là xếp hạng tạm.
      - Socket handler mới `tournament:cancel` trong `TournamentHandler.js`, broadcast cho organizer,
        người chơi đang trong trận, và danh sách giải đấu ở lobby.
      - UI: nút "Huỷ giải đấu" (organizer-only, hiện khi `draft`/`active`) ở cả thẻ giải đấu trong
        lobby (`tournaments.js`) và trang chi tiết (`tournament.html`/`tournament-detail.js`), tái
        dùng đúng pattern modal xác nhận nguy hiểm đã có cho "Điều chỉnh/Huỷ cặp đấu". Client
        `tournament-match.js` cần xử lý thông báo huỷ giữa trận, đá người chơi/khán giả về
        `tournament.html`.
    - **Đánh giá hiệu quả/an toàn:** hiệu quả cao (đáp ứng đúng yêu cầu, theo sát pattern
      `ORGANIZER_ONLY` đã có sẵn khắp codebase nên rủi ro thiết kế thấp). An toàn: cần đảm bảo
      idempotent (huỷ 2 lần không lỗi ngầm), và đảm bảo mọi timer/socket room thật sự được dọn —
      nếu sót một pairing `InProgress` sẽ để lại `TimerManager`/`GameEngine` context mồ côi
      (memory leak nhỏ, giống loại lỗi grace-period đã gặp ở B12/B42).
    - **Trạng thái:** ✅ ĐÃ XONG (2026-08-07) — triển khai trên nhánh `feature/tournament-cancel`
      (từ `dev`). Backend: trạng thái `cancelled` mới (`schema.sql` + migration cộng thêm
      `cancelled_at`/`cancel_reason`, additive giống migration `games` trước đó),
      `PairingLifecycle.cancelForTournament` (trạng thái pairing mới `Cancelled`, thêm vào
      `TERMINAL_STATES`), `TournamentManager.cancelTournament()`, helper
      `TournamentMatchHandler.forceCancelMatch()` cho trận đang sống, socket handler
      `tournament:cancel` + broadcast `tournament_cancelled` trong `TournamentHandler.js`. Client:
      nút "Huỷ giải đấu" ở cả thẻ giải đấu trong lobby (`tournaments.js`, xác nhận qua
      `confirm()`) và trang chi tiết (`tournament-detail.js`/`tournament.html`, modal xác nhận nguy
      hiểm có ô lý do tuỳ chọn, tái dùng đúng pattern modal điều chỉnh cặp đấu); `tournament-match.js`
      hiện overlay + redirect khi trận đang chơi bị huỷ giữa chừng. Bump cache-busting lên `?v=74`.
      **Sai lệch so với `instruction.md` B59:** không tách riêng một helper "tính bảng xếp hạng tạm"
      khỏi `_completeTournament` như bản phác thảo ban đầu đề xuất — xác minh lại lúc code thì
      `tournament-detail.js`'s bảng xếp hạng vốn đã được tính hoàn toàn ở client, chỉ dựa vào
      `state`/`result` của từng pairing (không phụ thuộc `tournament.status`), nên các pairing đã
      `Completed` trước khi huỷ tự động vẫn được tính mà không cần thêm logic backend nào — chỉ cần
      thêm nhãn "tạm" ở UI khi `status === 'cancelled'`. Việc này giảm rủi ro/khối lượng thay đổi mà
      vẫn đáp ứng đúng yêu cầu "có tính bảng xếp hạng tạm".
    - **Test:** `server/tests/TournamentManager.test.js` (describe `cancelTournament`, 8 case: huỷ từ
      `draft`, huỷ từ `active` có pairing `InProgress`, huỷ với pairing ở mọi state không-terminal
      cùng lúc, không đụng pairing đã terminal/`Completed`, huỷ bởi người không phải organizer, huỷ 2
      lần, huỷ tournament đã `completed`, `tournamentId` không tồn tại) +
      `server/tests/PairingLifecycle.test.js` (describe `cancelForTournament`, 4 case). `npm test`:
      839/839 pass. **Xác minh trình duyệt thực tế (2026-08-07, sau khi người dùng dừng server dev
      riêng của họ):** theo đúng quy trình an toàn Playwright/e2e trong `CLAUDE.md` — chuyển
      `server/db/gomoku.db` (+ `-wal`/`-shm`) sang `.pre-e2e` trước khi khởi `node server/index.js`,
      chạy kịch bản Playwright 3-context (organizer + 2 người chơi khách) qua toàn bộ luồng: tạo giải
      → 2 người đăng ký → organizer bấm Start → báo giờ/xác nhận/sẵn sàng đưa cặp đấu tới `InProgress`
      → cả hai vào trận sống → organizer huỷ giải từ trang chi tiết **trong khi trận đang diễn ra**.
      Xác nhận: cả hai người chơi nhận overlay "Giải đấu đã bị huỷ bởi người tổ chức." và bị đưa về
      `tournament.html`; badge "Đã huỷ" hiện đúng ở cả lobby và trang chi tiết; banner lý do huỷ hiện
      đúng; bảng xếp hạng có nhãn "Bảng xếp hạng tạm — giải đấu đã bị huỷ trước khi kết thúc"; pairing
      state pill hiện "Đã huỷ"; nút Huỷ biến mất sau khi đã huỷ (không lặp lại được); người không phải
      organizer không thấy nút Huỷ ở thẻ lobby; **0 console error** ở cả 3 trang trong suốt luồng. Sau
      đó dừng server, xoá db tạm, khôi phục `gomoku.db` gốc, xác nhận lại checksum khớp. Xem thêm ghi
      chú sự cố suýt xảy ra ở lần thử đầu (server dev của người dùng đang chiếm cổng 3000) trong tóm
      tắt hội thoại — lần chạy thứ hai này (sau khi người dùng tự dừng server) sạch, không có sự cố.

## Tài liệu liên quan

- [features/tournament-cancel/user_story.md](../../features/tournament-cancel/user_story.md)
- [features/tournament-cancel/planning.md](../../features/tournament-cancel/planning.md)
- [features/tournament-cancel/diagram/state-diagram-tournament-lifecycle.md](../../features/tournament-cancel/diagram/state-diagram-tournament-lifecycle.md)
- [features/tournament-cancel/diagram/uml_diagram/sequence-cancel-tournament.md](../../features/tournament-cancel/diagram/uml_diagram/sequence-cancel-tournament.md)
