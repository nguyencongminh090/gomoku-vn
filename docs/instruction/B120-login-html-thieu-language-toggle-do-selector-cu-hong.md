# B120 — Login page thiếu Language Toggle

Hướng dẫn thực thi cho TODO.md #120 (đã làm — `fix/login-language-toggle` off `main`, 2026-08-14).

## Cách đã làm

- Không viết lại cơ chế i18n switcher — `createLangSwitcher(container)`, `setLanguage()`,
  `getLanguage()` (`i18n.js`) giữ nguyên. Chỉ:
  1. `client/login.html` — thêm `<div class="login-lang-switch-row"></div>` trong
     `<main class="split-right">`, ngay trước `.login-shell`.
  2. `client/css/login.css` — CSS định vị cho `.login-lang-switch-row` (full-width hàng, căn phải,
     `max-width: 440px` khớp `.login-shell` để nút thẳng hàng mép phải khối form; trên mobile
     `.split-right { align-items: stretch }` sẵn có nên hàng vẫn full-width, `justify-content:
     flex-end` vẫn giữ nút bên phải).
  3. `client/js/i18n.js:1340` — đổi `document.querySelector('.card__logo')` thành
     `document.querySelector('.login-lang-switch-row')`.
- Đã `grep -rn "card__logo" client/` trước khi đổi — xác nhận không có HTML nào khác đang chờ
  selector đó (chỉ còn 1 rule CSS chết trong `main.css`, để nguyên, ngoài phạm vi).
- `?v=N` bump 122→123 (đụng `client/css/login.css`, `client/js/i18n.js`), verify bằng grep theo
  `CLAUDE.md`.

## Phạm vi KHÔNG làm (giữ đúng như đã lên kế hoạch)

- Không đổi layout tổng thể `page-split`/`login-shell` — chỉ chèn thêm 1 phần tử nhỏ.
- Không thêm switcher ngôn ngữ vào các trang đã có Settings panel (`index.html`, `room.html`, …).
- Không đụng `.card__logo .lang-switch` (CSS chết trong `main.css`) — không còn HTML nào tham chiếu,
  vô hại, để nguyên.

## Test đã viết

`client/tests/login-lang-switch-mount.test.js` (mới, jsdom — theo khuôn mẫu
`i18n-wall-second-move-error.test.js`, dispatch `DOMContentLoaded` thủ công vì jsdom's document đã
qua sự kiện đó trước khi test `require` module):
1. Mount đúng `.lang-switch` bên trong `.login-lang-switch-row`.
2. Selector `.card__logo` cũ không còn mount gì (regression check).
3. Không throw khi thiếu cả 2 mount point.
4. Bấm nút đổi đúng label + ngôn ngữ.

`npm test`: 1143/1143 pass.

**Xác minh browser thật** (bắt buộc theo rule "Feature completion checklist" trong `CLAUDE.md`, vì
đây là thay đổi UI thuần client): Playwright + Chromium, phục vụ `client/` qua
`python3 -m http.server` cục bộ (KHÔNG chạy `server/index.js`/đụng database thật — trang login
không cần server backend để kiểm tra chính switcher này). Xác nhận: nút hiện đúng vị trí desktop +
mobile (390×844, không tràn ngang), bấm đổi đúng toàn bộ text trên trang (tab, label, nút Google/
Guest), round-trip về đúng trạng thái ban đầu khi bấm lần 2.

Xem thêm: [docs/todo/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md](../todo/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md).
