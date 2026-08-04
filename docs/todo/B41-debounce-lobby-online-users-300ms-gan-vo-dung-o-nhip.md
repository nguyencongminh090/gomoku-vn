# Phần B #41. Debounce `lobby:online_users` (300ms) gần vô dụng ở nhịp reconnect

**Nguồn:** `gomoku-vn-review(1).md` vòng 3, mục 12.5 (kiểm chứng 2026-08-02)


41. **Debounce `lobby:online_users` (300ms) gần vô dụng ở nhịp reconnect
    thật**

    - **Ở đâu:** `server/socket/state.js` — hằng `ONLINE_USERS_DEBOUNCE_MS =
      300`.
    - **Vì sao:** comment tự nêu "reconnect storms" là kịch bản mục tiêu,
      nhưng `client/js/socket-client.js` dùng backoff 1000-5000ms giữa các
      lần reconnect — mỗi lần rơi vào một cửa sổ debounce riêng, không gộp
      được với nhau.
    - **Bằng chứng review đã đo:** burst đồng loạt 39 gói → 1 gói (giảm 97%);
      nhưng rải 150-400ms/lần thì 39 → 28 gói (chỉ giảm ~28%). Đúng kịch bản
      code tự nhận là mục tiêu lại là kịch bản nó giúp ít nhất.
    - **Lưu ý:** debounce này hiện tại được thêm (TODO #29) để giải quyết chi
      phí O(n²) lúc burst 6000 người kết nối đồng thời — một lý do khác,
      không phải để tối ưu nhịp reconnect rải rác. Mục này vẫn còn mở.
    - **Đánh giá hiệu quả/an toàn:** rẻ, an toàn — cùng loại giải pháp đã
      dùng cho `lobby:update`/`room:updated` (nâng cửa sổ debounce, hoặc xa
      hơn là chuyển sang delta `{added, removed}` giống `lobby:patch`).
    - **Test dự kiến:** mở rộng test debounce hiện có trong
      `server/tests/` (nếu có) hoặc file mới, mô phỏng đúng nhịp
      150-400ms/lần thay vì burst đồng loạt, assert số gói giảm đáng kể so
      với baseline không debounce.
    - **Trạng thái:** ✅ ĐÃ XONG (2026-08-04) — xem `docs/fix-log.md` cho
      chi tiết đầy đủ. Đã áp dụng hướng sửa rẻ (khuyến nghị): nâng
      `ONLINE_USERS_DEBOUNCE_MS` từ 300ms lên 1500ms trong
      `server/socket/state.js`. Chưa làm hướng sửa thật (chuyển sang delta
      `{added, removed}`) — không bắt buộc trong lần này theo
      `instruction.md` §41.
    - **Test:** `server/tests/SocketHandler.test.js` — test case mới mô
      phỏng đúng nhịp reconnect 150-400ms/lần (không phải burst đồng loạt),
      assert số gói `lobby:online_users` giảm mạnh so với số sự kiện. 2 test
      case cũ dùng hằng `300` cứng đã đổi sang tham chiếu
      `ONLINE_USERS_DEBOUNCE_MS` export từ `state.js` để không vỡ khi đổi
      hằng số. `npm test`: 401/401 xanh.
