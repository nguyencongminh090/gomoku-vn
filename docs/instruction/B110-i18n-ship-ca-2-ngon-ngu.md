# B110 — Tách từ điển `en` ra khỏi `i18n.js`

Hướng dẫn thực thi cho TODO.md #110 (chưa làm). **Ưu tiên thấp nhất nhóm #105-#110** — cân nhắc kỹ
xem có đáng làm không trước khi bắt đầu.

## Cân nhắc trước tiên: có đáng làm không

- Lợi ích thật sau nén chỉ ~**8-9 KB**, không phải 36 KB như kích thước file gợi ý — hai từ điển
  song ngữ có cấu trúc gần giống nhau nên gzip/Brotli nén rất tốt (73 KB → 18 KB).
- **Chỉ bắt đầu mục này sau khi #105-#108 xong và đã đo lại.** Nếu lúc đó tải trang đã đủ nhanh, câu
  trả lời đúng là đóng mục này lại chứ không phải làm cho xong.

## Cách tiếp cận (nếu quyết định làm)

- **Phương án ít rủi ro nhất, ưu tiên dùng:** giữ nguyên từ điển `vi` nội tuyến trong `i18n.js` như
  hiện tại (mặc định, đại đa số người dùng), chỉ tách `en` ra file riêng và nạp động **khi người
  dùng thật sự đổi sang tiếng Anh**. Đường tới hạn của trường hợp phổ biến giữ nguyên đồng bộ 100%,
  **không call site `t()` nào phải đổi**.
- **Đừng chuyển `i18n.js` thành module bất đồng bộ.** `t()` hiện gọi được ngay từ top-level của
  module khác; biến nó thành async sẽ gây `undefined`/text chưa dịch rải rác ở rất nhiều nơi
  (`data-i18n` khắp mọi `client/*.html`, `t()` trong hầu hết `client/js/*.js`). Chi phí này lớn hơn
  nhiều so với 8-9 KB thu được.
- Nhớ xử lý trường hợp người dùng đã chọn `en` từ trước (đọc từ `localStorage` lúc khởi động): phải
  nạp từ điển `en` trước khi `applyI18n()` chạy lần đầu, nếu không trang sẽ nháy tiếng Việt rồi mới
  đổi.
- **Bump `?v=N`** — có đụng `client/js/`.

## Phạm vi KHÔNG làm

- Không đổi sang thư viện i18n ngoài (i18next…) — thừa cho 2 ngôn ngữ, và kéo theo dependency lớn
  hơn cả phần tiết kiệm được.
- Không tách nhỏ từ điển theo từng trang (`login.*`, `room.*`…) — phức tạp hơn nhiều, dễ sót key, và
  lợi ích còn nhỏ hơn nữa sau nén.
- Không đụng nội dung bản dịch (thêm/sửa/xoá key) trong cùng mục này — chỉ di chuyển.

## Test

- Không có test tự động cho `client/js/` (nêu rõ thay vì bỏ qua im lặng).
- Xác minh thủ công: đổi ngôn ngữ qua lại vi↔en trên **mọi trang**, tải lại trang khi đang ở `en`
  (kiểm trường hợp `localStorage` ở trên), xác nhận không có key nào hiện ra dạng thô
  (`login.title`) hay text nháy đổi ngôn ngữ sau khi trang đã hiện.
