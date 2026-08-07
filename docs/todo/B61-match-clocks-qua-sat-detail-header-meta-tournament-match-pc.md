# #61. Trận đấu giải đấu (PC): khối `.match-clocks` nằm quá sát/thiếu khoảng cách với dòng `#match-meta` phía trên

**Nguồn:** review nhanh UI desktop theo yêu cầu người dùng (không kèm bug report gốc), 2026-08-07.

## Hiện trạng quan sát được

- Trên `client/tournament-match.html` (giao diện desktop), dòng metadata dưới tiêu đề trận đấu
  (`#match-meta`: "Trận đấu giải đấu" · "Ván N" · "Đấu tới 3 điểm, cách biệt 2") và khối 2 ô đồng hồ
  người chơi (`.match-clocks`, chứa `#clock-black`/`#clock-white`) có khoảng cách dọc rất mỏng —
  viền trên của ô clock gần như chạm sát vùng hiển thị chữ meta, đặc biệt ở đoạn text dài "Đấu tới 3
  điểm, cách biệt 2".
- Đây thuần là lỗi bố cục/thị giác (layout/visual spacing), không phải lỗi vùng click hay hành vi
  tương tác.
- `.match-page-header` (chứa `#match-meta`) và `.match-clocks` không lồng cha–con mà là 2 khối anh
  em ở 2 cấp DOM khác nhau (`.match-page-header` đứng ngoài; `.match-clocks` nằm trong
  `<main class="room"><section class="board-area-shell">`) — khoảng cách giữa chúng phụ thuộc hoàn
  toàn vào margin/padding cộng dồn của 2 khối độc lập:
  - `.match-page-header` (tournament.css:158-165): chỉ có `padding-top: 12px`, không có
    `margin-bottom`/`padding-bottom`.
  - `.detail-header__meta` (tournament.css:34): chỉ có `margin-top: 8px`, không có margin/padding
    dưới.
  - `.room` (room.css:8-20, tái sử dụng từ room.html): chỉ có `padding-top: 12px` làm khoảng đệm từ
    đỉnh `.room` tới `.match-clocks` bên trong.
  - → Tổng khoảng cách dọc thực tế giữa đáy text meta và viền trên `.match-clock` chỉ đến từ
    `padding-top: 12px` của `.room` — không có margin-bottom nào từ phía `.match-page-header` để
    cộng thêm, nên khoảng đệm mỏng hơn các cụm nội dung khác trên trang.

## Việc cần làm khi triển khai

- Xem `docs/instruction/B61-*.md` để biết phạm vi selector/file cần rà soát và ranh giới đề xuất.
- Kiểm tra thêm ở nhiều độ rộng desktop (1280px, 1440px, 1920px) và trường hợp text meta dài hơn
  (nhiều điều kiện đấu, tên giải đấu dài) trước khi sửa, vì mức độ "sát" có thể thay đổi theo độ dài
  nội dung.

## Trạng thái: đã xong

Xem `docs/fix-log/2026-08-07-todo-61-tournament-match-clocks-meta-spacing.md` để biết chi tiết fix
(`padding-bottom: 12px` trên `.match-page-header`, `client/css/tournament.css`) và cách verify.
