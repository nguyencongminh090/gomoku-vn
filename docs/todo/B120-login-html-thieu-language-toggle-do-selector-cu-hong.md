# #120 — Login page thiếu Language Toggle (Việt/Anh)

**Trạng thái:** chưa làm

## Nguồn

Báo cáo người dùng — "Login page should have Language Toggle (Vietnamese/English)" (2026-08-14).

## Mô tả

`client/login.html` hiện không có bất kỳ control nào để đổi ngôn ngữ. Người dùng vào thẳng trang
đăng nhập (chưa có session) không có cách nào chuyển Việt ⇄ Anh — khác với các trang đã đăng nhập,
nơi ngôn ngữ nằm trong panel Settings toàn cục (`settings-panel.js`).

## Nguyên nhân gốc (đã xác nhận qua đọc code, chưa sửa)

Đây **không phải tính năng chưa từng được xây** — `client/js/i18n.js:1324-1342` (auto-init trên
`DOMContentLoaded`) đã có sẵn logic dành riêng cho login page:

```js
// Login page has no header/Settings panel yet, so it keeps its own
// standalone switcher. On authenticated pages, language now lives inside
// the global Settings panel (see settings-panel.js) instead of a topnav pill.
const cardLogo = document.querySelector('.card__logo');
if (cardLogo) {
  createLangSwitcher(cardLogo);
}
```

`createLangSwitcher()` (`i18n.js:1304-1322`) tự tạo nút `.lang-switch` (text "EN"/"VI", toggle qua
`setLanguage()`) và gắn vào container truyền vào — cơ chế đã hoàn chỉnh, có sẵn CSS
(`.lang-switch`), có sẵn hàm dùng chung.

**Vấn đề:** `client/login.html` hiện tại (layout `page-split`/`login-shell`/`login-core` — bản
redesign sau này) **không còn phần tử nào mang class `card__logo`** (đã kiểm bằng
`grep -n "card__logo" client/login.html` → không có kết quả). Selector này chắc chắn từng khớp một
bản HTML cũ hơn của trang login (trước redesign hiện tại), rồi redesign đổi cấu trúc DOM mà không
cập nhật `i18n.js`'s mount point — nút ngôn ngữ âm thầm không bao giờ được tạo ra kể từ đó, không
crash, không log lỗi, nên không ai để ý.

Đúng tinh thần "Root-cause diagnosis" (`CLAUDE.md`) — đây là lớp gốc thật sự (selector lệch sau
redesign), không phải một tính năng chưa từng tồn tại.

## Vì sao chưa sửa ngay

Người dùng chọn "File to TODO/instruction" khi được hỏi (2026-08-14).

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp/trung bình — không mất chức năng, chỉ là thiếu 1 control tiện lợi trên đúng 1
  trang (login). Người dùng vẫn đăng nhập được bình thường bằng ngôn ngữ mặc định
  (`localStorage`-persisted `currentLang` từ lần đổi trước đó ở trang khác, nếu có).
- **Hướng sửa dự kiến khi làm:** KHÔNG viết lại `createLangSwitcher()`/logic i18n — chỉ cần (1)
  thêm 1 phần tử mount point mới trong `login.html` (ví dụ trong `.split-right`/`.login-shell`,
  gần `<nav class="tabs">` hoặc góc trên phải panel — cần chọn vị trí phù hợp bố cục hiện tại, xem
  `client/css/login.css` để không phá layout), và (2) sửa `i18n.js:1338`
  `document.querySelector('.card__logo')` trỏ sang selector/class mới đó. Tối thiểu hoá thay đổi —
  đổi đúng 1 selector + 1 phần tử HTML, không viết lại cơ chế switcher.
- Chi tiết cách làm: [docs/instruction/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md](../instruction/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md).

## Trạng thái test

Chưa viết — chưa sửa. Khi sửa: không có Jest cho `client/js/`, verify bằng browser thật (`run` skill)
— mở `login.html` (chưa đăng nhập), xác nhận nút đổi ngôn ngữ hiển thị đúng vị trí, bấm đổi Việt ⇄
Anh cập nhật đúng toàn bộ text trên trang (kể cả 2 tab Đăng nhập/Đăng ký, placeholder, nút Google/
Guest), và giá trị được nhớ khi F5 lại trang.
