## #46. `login.js` nút ẩn/hiện mật khẩu — fallback hardcode tiếng Việt vì thiếu khoá i18n

**Nguồn:** phát hiện phụ khi làm #45 (2026-08-04) — không nằm trong danh sách
phát hiện gốc của #45, ghi riêng theo rule "scope discipline".

**Vị trí:** `client/js/login.js` (hàm `togglePassword`), 2 dòng:
```js
btn.setAttribute('aria-label', t('login.hide_password') || 'Ẩn mật khẩu');
...
btn.setAttribute('aria-label', t('login.show_password') || 'Hiện mật khẩu');
```

**Vấn đề:** `login.hide_password`/`login.show_password` **không tồn tại**
trong `TRANSLATIONS.vi`/`TRANSLATIONS.en` (`client/js/i18n.js`). `t(key)` cho
key không tồn tại trả về chính `key` (raw string, truthy) theo cách `t()` hiện
cài — nghĩa là `t('login.hide_password')` trả về `'login.hide_password'`
(truthy), nên nhánh `|| 'Ẩn mật khẩu'` **không bao giờ chạy** và
`aria-label` luôn là chuỗi raw key `"login.hide_password"`/`"login.show_password"`,
không phải tiếng Việt lẫn tiếng Anh — vẫn là một dạng rò rỉ text sai (đọc màn
hình đọc ra key thô), không đúng như comment trong code có vẻ định làm
("fallback tiếng Việt nếu thiếu khoá").

**Đánh giá hiệu quả/an toàn:** không phải bug an toàn, ảnh hưởng UX/a11y nhỏ
(chỉ `aria-label`, không hiển thị visual). Sửa được bằng code, rẻ.

**Trạng thái test:** chưa viết (client-side, không có hạ tầng test).

**Giải pháp đề xuất:** thêm 2 khoá thật `login.hide_password`/
`login.show_password` vào cả `vi`/`en` trong `i18n.js`, bỏ `|| '...'` fallback
hardcode trong `login.js`.
