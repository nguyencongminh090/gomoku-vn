# B144 — Ẩn topnav trên mobile phòng chơi

## Chốt phương án tương tác trước khi viết code

Người dùng đưa ra 2 lựa chọn (vuốt xuống / nút `V`) và **chưa chọn**. Hỏi lại bằng
`AskUserQuestion` trước khi implement, đừng tự chọn hộ.

Dữ kiện để tư vấn khi hỏi:

- **Vuốt xuống đụng pull-to-refresh** của trình duyệt mobile. Muốn dùng thì phải
  `overscroll-behavior-y: contain` và kiểm chứng trên Chrome Android **thật** (Playwright
  `hasTouch` không mô phỏng pull-to-refresh) — không kiểm chứng được thì đừng chọn hướng này.
- **Nút `V` không có affordance ẩn**, không tranh chấp cử chỉ nào, và tự nó là chỗ neo cho
  animation. Đổi lại nó vẫn chiếm vài pixel thường trực — nhưng vài pixel thì rẻ hơn 60px.

## Ràng buộc

- **`--zen-topnav-h` không phải chiều cao trang trí.** 11 chỗ trong `room-zen.css` tính hình học từ
  nó (xem bảng trong `docs/todo/B144-*.md`), và `board.js` `resize()` nhánh zen mobile lấy ngân sách
  từ `shellTop` nên đã gián tiếp cộng chiều cao nav. Ẩn nav mà không xử lý các `calc()` này thì board
  **không** đòi lại được 60px — chỉ đổi 60px chrome thành 60px khoảng trống. Đây đúng là kiểu lỗi mà
  rule "Root-cause diagnosis" trong `CLAUDE.md` cảnh báo: sửa ở tầng nhìn thấy triệu chứng, không
  sửa tầng sinh ra con số.
- **Không được ẩn mất lối thoát.** Nút rời phòng và mã phòng `#TCP` hiện **chỉ tồn tại** trong
  topnav; bottom bar không có. Nếu ẩn nav mặc định thì phải chuyển hai thứ này đi đâu đó luôn hiện
  (bottom bar còn chỗ, và nút cài đặt trong topnav vốn đã **trùng** với `tab-settings` ở bottom bar
  → có thể bỏ bớt bản trùng).
- **`.topnav` dùng chung 5 trang** (`index`, `history`, `room`, `tournament`, `tournament-match`).
  Mọi rule mới phải nằm trong `body.zen-room` + `@media (max-width: 768px)`. Một rule trần trên
  `.topnav` sẽ rò sang sảnh chờ và giải đấu.
- **`client/js/board.js` đang bị khoá** bởi `design-workflow`. Nếu phân tích cho thấy bắt buộc phải
  sửa ngân sách chiều cao trong đó, **dừng và hỏi người dùng**, đừng tự nới khoá.

## Đo (bắt buộc, đừng suy từ CSS)

Lặp lại đúng phương pháp đã dùng ở #143 — dựng git worktree ở `/tmp` với DB rỗng riêng, server ở
port khác, **không đụng server live cổng 3000 và không đụng `server/db/gomoku.db`**:

- Đo `canvas` trước/sau trên **cả hai** viewport: Pixel 5 (393×851, board bị giới hạn bởi **chiều
  rộng** → nhiều khả năng lợi ích = 0) và iPhone SE (375×667, board bị giới hạn bởi **chiều cao** →
  đây mới là chỗ có lợi thật).
- Khẳng định `docScrollY === 0` và khoảng hở dưới `.game-controls` vẫn dương ở cả hai.

## Test

Nối thêm vào `e2e/strip-clock-mobile.spec.ts` hoặc tạo spec cạnh nó. Bất biến tối thiểu: ở viewport
mobile, trạng thái mặc định `.topnav` không chiếm chiều cao; sau khi kích hoạt (nút/cử chỉ) thì hiện;
và **luôn** tồn tại một lối rời phòng bấm được ở cả hai trạng thái. Kiểm chứng hai chiều như #143 đã
làm: spec phải **fail** trên code trước khi sửa, không chỉ pass sau khi sửa.
