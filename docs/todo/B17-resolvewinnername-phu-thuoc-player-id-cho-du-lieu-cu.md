# Phần B #17. `resolveWinnerName` phụ thuộc `*_player_id` cho dữ liệu cũ

**Nguồn:** phát hiện khi làm Phần B #4 (2026-08-02)


17. ~~**`resolveWinnerName` phụ thuộc `*_player_id` cho dữ liệu cũ**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `3664314`, merge `5e7fd79`) — không đợi kiểm được số hàng
    production (DB dev có 0 ván, không đo được), chọn thẳng hướng "đúng" mà
    mục này đã đề xuất sẵn cho trường hợp còn hàng cũ: server tự phân giải.
    Thêm `resolveWinnerSeat()` + `withWinnerName()` trong `database.js`, lặp
    lại đúng chuỗi fallback mà `history.js` từng chạy ở client (seat có sẵn →
    khớp raw id → khớp raw tên → loại trừ theo ghế khách), gắn `winner_name`
    vào mọi row trả về từ cả 2 route. Xoá hẳn `resolveWinnerName()` phía client
    (19 dòng) — 2 nơi gọi nay chỉ đọc `g.winner_name`. Bump `?v=33` → `?v=34`.
    Test: 2 fixture mới mô phỏng đúng hình dạng dữ liệu cũ thật (raw id +
    guest loại trừ) trong `server/tests/games-route.test.js`, 4 case mới;
    `npm test` 284/284 xanh. **Đã kiểm bằng browser thật:** chèn 1 ván thật qua
    đúng `saveGame()`, mở `history.html` trên server thật (port riêng, không
    đụng server :3000 đang chạy), xác nhận cả bảng danh sách lẫn màn xem lại
    hiện đúng tên người thắng; xoá ván test sau khi kiểm xong. Chi tiết:
    `docs/fix-log.md`.
