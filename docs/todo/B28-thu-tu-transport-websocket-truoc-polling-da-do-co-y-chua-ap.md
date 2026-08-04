# Phần B #28. Thứ tự transport `websocket` trước `polling` — đã đo, CỐ Ý CHƯA ÁP DỤNG

**Nguồn:** truy nguyên trần kết nối (2026-08-02, xem `docs/stress-test-report.md` §10)


28. ~~**Thứ tự transport `websocket` trước `polling` — đã đo, CỐ Ý CHƯA ÁP DỤNG**~~
    - Đo được: ở 4000 người, backlog 511, `['polling','websocket']` (mặc định
      socket.io, đang ship) = 88.0% / 240 lỗi; `['websocket']` = 100% / 0 lỗi;
      `['websocket','polling']` + `tryAllTransports` = **100% / 0 lỗi mà vẫn
      giữ được fallback polling**.
    - **Chưa áp dụng vì:** riêng bản sửa backlog (mục 27) đã đưa cấu hình mặc
      định về 100% ở 4000 người rồi. Đổi thứ tự transport ảnh hưởng đường kết
      nối của **mọi client thật** (kể cả người sau proxy chặn WebSocket — đúng
      lý do socket.io mặc định polling trước), nên phải là một thay đổi riêng
      có lý lẽ riêng, không gộp vào bản sửa backlog.

    **✅ ĐÃ ĐO LẠI + ÁP DỤNG (2026-08-02, phiên sau)** — đo lại đúng bằng
    `scripts/capacity-test/` như hướng dẫn (không tin số cũ), backlog fix đã
    live:
    - Ở **4000 người** (đúng mốc so sánh cũ): cả 2 thứ tự đều **100%/0 lỗi** —
      xác nhận đúng lý do "chưa áp dụng" ban đầu vẫn đúng **ở mốc đó**: bản sửa
      backlog một mình đã đủ.
    - Nhưng đẩy lên **6000 người** (đúng mức mục #29 đang điều tra) thì thấy
      khác biệt thật: 6 lần chạy xen kẽ (3 mặc định, 3 websocket-trước, xen kẽ
      để loại trừ trôi dạt trạng thái server) → mặc định 74-80%, websocket-
      trước 90-100% — chênh ~15 điểm %, không phải nhiễu.
    - **Quyết định: áp dụng.** Lý do tiền đề "chưa áp dụng" đã thay đổi — tiền
      đề đó chỉ đúng ở mốc 4000, không đúng ở 6000 nơi 2 thứ tự tách biệt rõ và
      mặc định thua. Rủi ro tương thích proxy (client sau proxy chặn WebSocket)
      **vẫn có thật và vẫn chưa đo được** trong phiên này (không có client thật
      sau proxy chặn WebSocket để thử) — nhưng `tryAllTransports` chặn rủi ro
      đó ở mức "mất thêm 1 lần thử transport thất bại trước khi rơi về
      polling", không phải mất kết nối hẳn, nên rủi ro có giới hạn trong khi
      lợi ích đã đo được là thật.
    - **Sửa:** `client/js/socket-client.js` — `io({...})` thêm
      `transports: ['websocket', 'polling']` và `tryAllTransports: true`.
      Bump `?v=35` → `?v=36` (đủ 4 file HTML + 3 file entry JS).
    - **Test:** `client/js/` không có hạ tầng unit test (đúng như mọi fix
      `client/js/` khác trong `docs/fix-log.md`) — viết Playwright mới
      `e2e/websocket-first-transport.spec.ts`, chặn network request +
      lắng nghe event `websocket` của trang, assert kết nối thường mở thẳng
      WebSocket (`transport=websocket` trong URL) mà **không** có request
      `transport=polling` nào trước đó, và banner kết nối không bao giờ hiện
      trạng thái mất kết nối. Mutation-check: revert riêng `socket-client.js`
      → tái hiện đúng 5 request polling trước khi có WebSocket, test đỏ →
      khôi phục, xanh lại. `npm test`: 299/299 xanh (không đổi, đây là thay
      đổi client-only).
    - **Đo lại sau khi sửa:** 4000 người vẫn 100%/0 lỗi (không hồi quy), 6000
      người tăng từ 74-80% (mặc định) lên 90-100% (websocket-trước), 3 lần
      chạy mới. Chi tiết đầy đủ: `docs/fix-log.md`.
