# #120 — Login page thiếu Language Toggle (Việt/Anh)

**Trạng thái:** ✅ Đã sửa.

## Nguồn

Báo cáo người dùng — "Login page should have Language Toggle (Vietnamese/English)" (2026-08-14).

## Mô tả

`client/login.html` không có bất kỳ control nào để đổi ngôn ngữ. Người dùng vào thẳng trang đăng
nhập (chưa có session) không có cách nào chuyển Việt ⇄ Anh — khác với các trang đã đăng nhập, nơi
ngôn ngữ nằm trong panel Settings toàn cục (`settings-panel.js`).

## Nguyên nhân gốc

Đây không phải tính năng chưa từng được xây — `client/js/i18n.js`'s auto-init (chạy trên
`DOMContentLoaded`) đã có sẵn logic mount `createLangSwitcher()` dành riêng cho login page, nhưng
nhắm vào `document.querySelector('.card__logo')` — một class thuộc bản layout login cũ. Bản redesign
hiện tại của `login.html` (`page-split`/`login-shell`/`login-core`) không còn phần tử nào mang class
đó, nên switcher âm thầm không bao giờ được tạo kể từ redesign đó, không crash, không log lỗi.

## Sửa đã áp dụng (2026-08-14, `fix/login-language-toggle` off `main`)

- `client/login.html` — thêm mount point mới `<div class="login-lang-switch-row"></div>` ngay trong
  `<main class="split-right">`, phía trên `.login-shell`.
- `client/css/login.css` — CSS mới cho `.login-lang-switch-row` (`width:100%; max-width:440px;
  display:flex; justify-content:flex-end; margin-bottom:12px;`) — căn phải, cùng chiều rộng tối đa
  với `.login-shell` nên nút thẳng hàng với mép phải của khối form. Không đổi bố cục `page-split` 2
  cột hay bất kỳ CSS khác.
- `client/js/i18n.js` — đổi `document.querySelector('.card__logo')` thành
  `document.querySelector('.login-lang-switch-row')`. Không đổi `createLangSwitcher()`,
  `setLanguage()`, `getLanguage()` — chỉ đổi chuỗi selector mount point.
- `?v=` bump 122→123 (đụng `client/css/login.css` và `client/js/i18n.js`).

**Không đụng** `.card__logo .lang-switch` (CSS cũ trong `main.css`) — để nguyên vì không còn HTML
nào tham chiếu tới, dead CSS vô hại, ngoài phạm vi fix này.

## Đánh giá hiệu quả / an toàn

**Rủi ro thấp:** chỉ thêm 1 phần tử mount point + CSS định vị, đổi đúng 1 dòng selector trong
`i18n.js`. Không viết lại cơ chế switcher đã hoạt động tốt ở nơi khác (từng dùng trước redesign).

**Xác minh bằng browser thật** (Playwright, `chromium`, phục vụ `client/` qua static server cục bộ
— không đụng `server/index.js` hay database thật):
- Desktop (1440×900): nút hiện đúng góc trên-phải khối login, căn thẳng mép phải `.login-shell`.
- Bấm nút: đổi đúng nhãn nút (EN↔VI), đổi đúng text tab ("Đăng nhập"→"Login"), label field
  ("Tên đăng nhập"→"Username"), nút guest ("Chơi như khách"→"Play as guest"). Bấm lần 2 quay lại
  đúng trạng thái ban đầu (round-trip xác nhận).
- Mobile (390×844): nút vẫn hiển thị, không có tràn ngang (`scrollWidth <= clientWidth`).

## Trạng thái unit test

`client/tests/login-lang-switch-mount.test.js` (mới, jsdom) — 4 test case:
- Mount đúng `.lang-switch` bên trong `.login-lang-switch-row` khi có mặt.
- Selector `.card__logo` cũ không còn mount gì (regression check cho chính lỗi đã sửa).
- Không throw khi không có mount point nào (trang đã đăng nhập).
- Bấm nút đổi đúng ngôn ngữ + tự cập nhật nhãn nút.

`npm test`: 1143/1143 pass (bao gồm 4 test mới).

Xem thêm: [docs/instruction/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md](../instruction/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md).
