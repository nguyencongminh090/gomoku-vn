# B70. Style nút bấm không nhất quán (TODO.md #70)

**Nguồn:** yêu cầu người dùng, TODO.md #70.

## Cách tiếp cận

- Xử lý theo đúng thứ tự ưu tiên đã liệt kê trong [docs/todo/B70](../todo/B70-button-style-khong-nhat-quan-toan-client.md)
  (visual impact giảm dần) — không nhảy thẳng vào mục cosmetic (#8) trước khi xử lý màu sắc/token
  sai (#1-#6).
- Đây là dọn dẹp CSS thuần, **không** phải bug logic — không đổi cấu trúc HTML, không đổi class
  name đang được JS reference (`querySelector`, `classList`) trừ khi thật sự cần, để tránh vỡ hành vi
  JS đang phụ thuộc vào class đó.
- Trước khi xoá bất kỳ hex màu hardcode nào, kiểm tra xem đúng là "sai sót" (không có lý do rõ ràng)
  hay là chủ ý (VD `.btn-kick` màu hồng có thể là chủ ý muốn tách biệt hành động "kick" khỏi hành
  động "leave"/"stand" khác — nếu vậy, chuyển sang dùng token nhưng **giữ nguyên tông màu**, không tự
  đổi sang đỏ chuẩn `--c-error` nếu ý đồ ban đầu là màu khác).
- Mục `--c-danger` vs `--c-error`: đọc kỹ 2 nơi khác nhau đang dùng `--c-danger` (organizer-tools,
  tournament.html) — nếu chúng đúng là cùng ý nghĩa "nguy hiểm/huỷ" như `.btn-slot--stand` đang dùng
  `--c-error`, gộp về `--c-error`. Nếu người dùng muốn giữ 1 tông riêng cho "danger" tách khỏi
  "error", thì define `--c-danger`/`--c-danger-bg` thật trong `:root` (cả light lẫn dark) thay vì
  gộp — hỏi lại nếu không rõ ý đồ trước khi chọn hướng.
- Mục 7 (rule `:active` cục bộ bị `!important` toàn cục đè): đây là bug thật (dead code), nhưng sửa
  cách nào (thêm `!important` vào rule cục bộ, hay sửa rule toàn cục để nhận giá trị theo component)
  ảnh hưởng cảm giác "haptic" toàn app — nên demo cả 2 hướng trong browser thật rồi so sánh, đừng chỉ
  sửa theo suy đoán.
- Vì đổi nhiều file `client/css/*.css`, nhớ bump `?v=N` đúng theo quy tắc "Cache-busting version
  bump" trong `CLAUDE.md` (chạy lại grep verify sau khi bump).
- Vì đây là CSS-only + không có test tự động cho `client/`, verify bằng cách chạy `run` skill hoặc
  mở từng trang (login/lobby/room/game/history/tournament) thật trong browser, cả light và dark
  mode, trước khi coi là xong — theo đúng "Feature completion checklist" trong `CLAUDE.md` (verify
  UI thật, không chỉ đọc code).
