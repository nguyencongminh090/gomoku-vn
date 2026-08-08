# Phần B #75. Round Robin Cross Table: sắp xếp hàng/cột theo hạng + highlight Vô địch/Á quân khi giải kết thúc

**Nguồn:** báo cáo người dùng kèm ảnh chụp màn hình Cross Table thật (TODO.md #64), 2026-08-08 —
"Standing tables auto sort? Highlight Champion, runner up,...?"

75. **Cross Table (Round Robin, TODO.md #64) hiện đang liệt kê người chơi theo thứ tự đăng ký
    (`tournament.entries`), không theo hạng — và không có highlight nào cho vị trí Vô địch/Á quân khi
    giải đã kết thúc.**
    - **Đã chốt với người dùng qua `AskUserQuestion` (2026-08-08):**
      1. **Sắp xếp:** hàng VÀ cột đều sắp theo hạng hiện tại (match points, tie-break Buchholz/SB —
         y nguyên `computeStandings()`/`rankStandings()` đã có, không đổi cách tính), luôn cập nhật
         theo thời gian thực khi có kết quả mới (không chỉ sắp 1 lần lúc tải trang) — người dẫn đầu
         luôn ở hàng/cột đầu tiên, giống bảng xếp hạng thật. Không giữ nguyên thứ tự đăng ký.
      2. **Highlight Vô địch/Á quân:** chỉ hiện **sau khi giải đã kết thúc**
         (`tournament.status === 'completed'`) — trong lúc giải đang diễn ra (`active`), thứ hạng còn
         có thể đổi nên KHÔNG highlight "hạng 1 hiện tại" như thể đã là nhà vô địch.
    - **Phạm vi dự kiến khi triển khai:**
      - `client/js/tournament-detail.js#renderCrossTable()` — hiện dựng lưới trực tiếp từ
        `tournament.entries` (thứ tự đăng ký). Cần đổi sang: tính `ranked = computeStandings()`
        (đã có), rồi lấy thứ tự entryId từ `ranked` (đã sort theo rank) thay vì từ
        `tournament.entries` trực tiếp — áp dụng thứ tự này cho CẢ hàng lẫn cột để lưới vẫn đối xứng
        (ô [i,j] và ô [j,i] vẫn đúng vị trí chéo nhau).
      - Highlight: thêm class CSS mới (ví dụ `.cross-table__name-col--champion`,
        `.cross-table__name-col--runner-up`) cho đúng 2 hàng đầu (rank 1 và rank 2) khi
        `tournament.status === 'completed'` — cân nhắc thêm icon (`ph-trophy` — đã dùng ở
        `tournament-match.js#outcomeIconClass` cho kết quả thắng, tái dùng cho nhất quán) cạnh tên
        thay vì chỉ đổi màu nền, để rõ ràng hơn "vì sao hàng này khác màu" cho người mới xem.
      - Đối chiếu edge case: rank 1/2 có thể bị **hoà** (nhiều người cùng rank 1, xem
        `rankStandings()`'s "genuine, unresolved tie" comment) — quyết định hiển thị ra sao khi có
        đồng hạng 1 (ví dụ: đều highlight "Vô địch" nếu đồng hạng 1, không chỉ 1 người) — cần hỏi lại
        người dùng nếu gặp trường hợp này lúc triển khai, chưa chốt trước.
    - **Đánh giá hiệu quả/an toàn (sơ bộ):** hiệu quả cao — UX rõ ràng hơn nhiều, đúng kỳ vọng chuẩn
      của một bảng xếp hạng thật. An toàn cao — thuần thay đổi hiển thị/sắp xếp phía client, không đổi
      `computeStandings()`/tie-break/logic tính rank đã đúng chuẩn (xác nhận ở #63).
    - **Trạng thái:** ✅ ĐÃ XONG (2026-08-08). Đã sửa `renderCrossTable()` trong
      `client/js/tournament-detail.js`: `entries` giờ lấy thứ tự từ `ranked = computeStandings()`
      (áp dụng cho cả hàng lẫn cột, `computeStandings()`/tie-break giữ nguyên 100% — không đổi logic
      tính rank). Highlight Vô địch/Á quân (`is-champion`/`is-runner-up` + icon `ph-trophy`, CSS mới
      trong `client/css/tournament.css` dùng token màu có sẵn `--c-accent-light`/`--c-accent` cho Vô
      địch, `--c-surface-2`/`--c-ink-3` cho Á quân) chỉ hiện khi `tournament.status === 'completed'`.
      Đồng hạng 1 (điểm 5 trong `instruction.md`): tất cả entry có `rank === 1` đều được highlight
      "Vô địch" (không riêng hàng đầu mảng); Á quân là các entry `rank === 2` sau khi loại trừ đồng
      hạng 1 — áp dụng suy luận đề xuất trong instruction vì không gặp trường hợp đồng hạng 1 thật
      lúc verify để hỏi lại người dùng. Thêm nhãn i18n `tdetail.cross_table_champion`/`_runner_up`
      (vi/en). Bump cache-bust `?v=86` → `?v=87` toàn bộ `client/*.html` + `client/js/*.js`.
      **Verify:** dựng giải Round Robin thật (4 tài khoản, 1 tổ chức + 3 người chơi) qua Playwright
      trên server tạm + db tạm (theo quy trình an toàn db trong `CLAUDE.md`) — xác nhận (a) khi giải
      còn `active`, hàng/cột đã sắp theo hạng hiện tại và KHÔNG có highlight; (b) sau khi giải
      `completed`, hàng hạng 1 (`XD`, 3 điểm) có `is-champion` (nền vàng nhạt + icon vàng), hàng hạng
      2 (`XB`, 2 điểm) có `is-runner-up` (nền xám nhạt + icon xám bạc), hạng 3 không có class nào.
      Backend: `npm test` — 39 suites / 931 tests pass (thay đổi thuần client, không có test backend
      mới cần thiết). Db thật đã được khôi phục nguyên vẹn sau verify (208896 bytes, đối chiếu
      trước/sau).
