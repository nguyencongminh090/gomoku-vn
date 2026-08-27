# B122 — Bỏ `profanity-classifier-model.js` khỏi `room.html`

Hướng dẫn thực thi cho TODO.md #122 (chưa làm).

## Cách tiếp cận khi làm

- Chỉ xoá đúng 1 dòng `<script src="js/profanity-classifier-model.js?v=125"></script>` ở
  `client/room.html:202`. **Không** xoá/sửa file `client/js/profanity-classifier-model.js` (giữ lại
  phòng khi bật lại classifier sau này) và **không** sửa `client/js/profanity-filter.js`.
- Bump `?v=` trong `client/room.html` theo quy tắc cache-busting — kiểm tra bằng:
  ```
  grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
  ```
  phải ra đúng 1 giá trị `?v=N` duy nhất sau khi sửa.
- Xác minh thủ công (không có Jest cho client HTML): mở `room.html` thật (hoặc qua `run` skill),
  DevTools → Network, xác nhận **không còn** request `profanity-classifier-model.js`; gõ vài chuỗi
  thử trong khung chat (lấy lại đúng 54 chuỗi review đã dùng nếu có, hoặc tối thiểu vài chuỗi có
  dấu/không dấu/leet) xác nhận lọc bậy vẫn hoạt động đúng như trước.

## Phạm vi KHÔNG làm

- Không bật lại classifier hay đổi pipeline lọc trong `profanity-filter.js`.
- Không đụng các trang khác — chỉ `room.html` nạp script này (đã grep xác nhận, các trang khác
  không có thẻ này).
- Nếu tương lai cần bật lại classifier: nạp lười qua `import()` lúc mở khung chat, không quay lại
  `<script>` đồng bộ — ghi chú này để lại cho việc sau, không phải phạm vi #122.

Xem thêm: [docs/todo/B122-bo-profanity-classifier-model-khoi-room-html.md](../todo/B122-bo-profanity-classifier-model-khoi-room-html.md).
