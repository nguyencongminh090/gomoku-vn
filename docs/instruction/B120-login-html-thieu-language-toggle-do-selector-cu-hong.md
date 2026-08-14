# B120 — Login page thiếu Language Toggle

Hướng dẫn thực thi cho TODO.md #120 (chưa làm — chỉ ghi lại khi phát hiện, người dùng chọn file
trước thay vì fix ngay, 2026-08-14).

## Cách tiếp cận khi làm

- **Không viết lại cơ chế i18n switcher** — `createLangSwitcher(container)` (`i18n.js:1304-1322`)
  và `setLanguage()`/`getLanguage()` đã hoàn chỉnh và đang chạy tốt ở nơi khác (auto-init cũ từng
  gọi đúng hàm này, chỉ selector mount point bị lệch). Chỉ cần:
  1. Thêm 1 phần tử HTML mới trong `client/login.html` làm mount point (class mới, ví dụ
     `.login-lang-switch` hay tương tự — đặt tên không trùng `card__logo` cũ để tránh nhầm lẫn với
     lịch sử). Vị trí đề xuất: trong `.login-shell`/`.login-core`, gần `<nav class="tabs">`
     (dòng 78) hoặc góc trên-phải panel — xem `client/css/login.css` trước để chọn vị trí không phá
     bố cục `page-split` hiện tại (2 cột: `.split-left` brand, `.split-right` form).
  2. Sửa `client/js/i18n.js:1338` — đổi `document.querySelector('.card__logo')` sang selector mới
     đó (giữ nguyên logic if/createLangSwitcher, chỉ đổi chuỗi selector).
  3. Style `.lang-switch` (CSS đã có sẵn ở nơi khác — tìm trong `client/css/`) — kiểm tra có cần
     thêm CSS riêng cho vị trí mới trong `login.css` không (padding/margin phù hợp container mới).
- **Kiểm tra `card__logo` có còn dùng ở trang nào khác không** trước khi sửa selector — nếu comment
  "Login page has no header/Settings panel yet" (dòng 1335-1337) chỉ áp dụng cho login, việc đổi
  selector chỉ ảnh hưởng logic của khối `if (cardLogo)` này, không đụng nơi khác. Nhưng vẫn nên
  `grep -rn "card__logo" client/` toàn bộ trước khi sửa để chắc chắn không có HTML khác đang chờ
  cùng selector.
- **Test toggle thực sự đổi hết text trên trang** — cả 2 tab (Đăng nhập/Đăng ký), mọi label/
  placeholder có `data-i18n`/`data-i18n-placeholder`, nút Google/Guest, footer — dùng browser thật
  (theo `run` skill), không chỉ nhìn nút xuất hiện.
- **Sau khi sửa `client/css/` hoặc `client/js/`, bump `?v=N`** theo đúng rule "Cache-busting version
  bump" trong `CLAUDE.md` — hiện tại đang là `?v=123` (xem `login.html` dòng 9-17), verify bằng:
  ```
  grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
  ```

## Phạm vi KHÔNG làm

- Không đổi hành vi `createLangSwitcher()`/`setLanguage()`/`getLanguage()` trong `i18n.js` — chỉ
  đổi 1 dòng selector mount point.
- Không thêm switcher ngôn ngữ vào các trang đã có Settings panel (`index.html`, `room.html`, …) —
  những trang đó đã có ngôn ngữ trong `settings-panel.js`, đúng như comment hiện tại đã giải thích;
  báo cáo chỉ nói riêng về `login.html`.
- Không đổi layout tổng thể `page-split`/`login-shell` — chỉ chèn thêm 1 phần tử nhỏ, không tái
  cấu trúc trang.

## Viết test

Không có Jest cho `client/js/`. Verify bằng browser thật khi sửa:
1. Mở `login.html` (chưa đăng nhập) → nút đổi ngôn ngữ hiển thị đúng vị trí, không đè lên control
   khác, không phá layout 2 cột trên desktop lẫn mobile.
2. Bấm đổi Việt → Anh → toàn bộ text (2 tab, field label/placeholder, nút Google/Guest, footer)
   cập nhật đúng ngay lập tức, không cần reload.
3. Reload trang → ngôn ngữ vừa chọn được giữ nguyên (đọc từ `localStorage`, cùng cơ chế
   `currentLang` đã có).

Xem thêm: [docs/todo/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md](../todo/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md).
