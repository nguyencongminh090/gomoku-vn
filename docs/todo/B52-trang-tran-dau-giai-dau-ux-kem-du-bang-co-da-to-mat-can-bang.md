# #52. Trang trận đấu giải đấu (`tournament-match.html`) UX kém dù bàn cờ đã to hơn — mất cân bằng bố cục, cả PC lẫn Mobile

**Nguồn:** báo cáo người dùng kèm ảnh chụp màn hình thật (trận `WildMink vs WildBull`, có tường/Wall
rule), 2026-08-07 — sau khi đã xác nhận riêng 2 việc: (1) fix bàn cờ nhỏ TODO.md #49 đã hoạt động
đúng trên `dev` (không phải do cache trình duyệt), (2) tab Trò chuyện của TODO.md #50 hoạt động
đúng (gửi/nhận tin nhắn "hei"/"ssa"/"ddf" thấy được trong ảnh). Người dùng xác nhận rõ: "What have
not fixed is UI... low UX on both PC and Mobile" — đây là báo cáo mới, không phải #49 tái phát.

## Hiện trạng quan sát được từ ảnh chụp

- Bàn cờ đã lớn hơn hẳn so với trước fix #49 (đúng kích thước theo số đo đã ghi trong
  `docs/todo/B49-*.md`), nhưng **tổng thể bố cục trang vẫn trông rời rạc/mất cân bằng**:
  - Khoảng trắng chết rất lớn ở nửa dưới và bên phải trang — bàn cờ + panel bên phải đều không
    chiếm hết không gian sẵn có, để lại vùng nền xám trống không phục vụ mục đích gì.
  - Panel "Trò chuyện"/"Khán giả"/"Nước đi" ở góc trên-phải có kích thước cố định nhỏ
    (~280×220px trong ảnh), không giãn theo chiều cao khả dụng của trang — khung chat message list
    trông chật, trong khi phía dưới nó là khoảng trống lớn không dùng tới.
  - Bàn cờ và panel bên phải không cùng hàng/không có quan hệ căn chỉnh rõ ràng với nhau (bàn cờ
    nằm thấp hơn hẳn panel, lệch trái) — khác hẳn bố cục 2 cột đồng bộ chiều cao của `room.html`.
- Đây là vấn đề **thẩm mỹ/bố cục tổng thể (layout/spacing/proportions)**, không phải cùng loại bug
  với #49 (#49 chỉ là 1 giá trị CSS `max-width`/`align-self` sai khiến canvas bị chặn nhỏ — đã sửa
  đúng phạm vi hẹp đó). Việc số đo canvas đúng theo px không có nghĩa toàn bộ trang đã có UX tốt.
- **Chưa có ảnh chụp Mobile riêng** cho báo cáo này — người dùng nói "cả PC lẫn Mobile" nhưng ảnh
  gửi kèm chỉ là desktop. Cần tự kiểm tra thêm ở mobile trước khi sửa, không giả định mobile cũng
  lỗi y hệt desktop.

## Việc cần làm khi triển khai

- Xem `docs/instruction/B52-*.md` để biết hướng tiếp cận đề xuất và ranh giới không nên đụng —
  đặc biệt: đây là việc **thiết kế lại bố cục**, rộng hơn phạm vi hẹp của #49, nên đừng chỉ vá thêm
  1-2 dòng CSS nhỏ rồi coi là xong như #49 đã làm.
- **Ghi chú người dùng (2026-08-07):** nếu vá gia tăng (riêng #52, hoặc gộp cả #54/#55) tốn chi phí
  trace lỗi quá cao mà UX vẫn thấp, có thể cân nhắc refactor toàn bộ `tournament-match.html` để
  dùng chung UI/layout với `room.html` — xem điều kiện + ranh giới đầy đủ ở `docs/instruction/B52-*.md`.
