# #123 — Thêm `<link rel="preload" as="font">` cho woff2 Phosphor — icon vào muộn trên mạng chậm

**Trạng thái:** chưa làm

**Nguồn:** review vòng 4 (`gomoku-vn-review-2026-08-14.md` mục 13.4/13.9) + xác nhận trực tiếp từ
người dùng trong hội thoại 2026-08-15: *"đôi lúc mạng chậm, những icon này (Settings, history,
create — tức các icon `.ph`) load chậm hơn các element khác"*.

## Vấn đề

`font-display: swap` (đã đổi từ `block` ở B108(c)) khiến icon Phosphor hiện fallback trước rồi mới
"nhảy vào" khi `Phosphor.woff2`/`Phosphor-Bold.woff2` tải xong. Nhưng trình duyệt chỉ *biết* cần
tải font này sau khi đã parse xong `vendor/phosphor/*/style.css` (khai báo `@font-face`) — tức file
font này nằm ở tầng phát hiện muộn hơn so với các asset được khai báo thẳng trong `<head>`. Trên
mạng chậm, 2 file font Phosphor (147-150 KB mỗi weight, không nén được — đã nén sẵn ở dạng woff2)
xếp hàng sau CSS/JS khác nên tới muộn nhất, đúng hiện tượng người dùng quan sát được.

## Đề xuất sửa

Thêm `<link rel="preload" as="font" type="font/woff2" crossorigin>` vào `<head>`, **trước** các
`<link rel="stylesheet">` phosphor, cho đúng file/số lượng weight mỗi trang đang thật sự nạp:

| Trang | Cần preload |
|---|---|
| `room.html`, `tournament.html`, `tournament-match.html`, `history.html` | `Phosphor.woff2` **và** `Phosphor-Bold.woff2` (cả 2 trang này đều nạp `bold/style.css`) |
| `index.html`, `login.html` | chỉ `Phosphor.woff2` (bold đã bỏ theo B108(a), xác nhận bằng grep — 2 trang này không có `<link>` bold) |

Ví dụ cho `room.html`:

```html
<link rel="preload" as="font" type="font/woff2" href="vendor/phosphor/regular/Phosphor.woff2?v=126" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="vendor/phosphor/bold/Phosphor-Bold.woff2?v=126" crossorigin>
```

`crossorigin` bắt buộc theo spec cho preload font kể cả cùng-origin, nếu thiếu trình duyệt sẽ tải
lại lần 2 khi CSSOM yêu cầu (preload bị lãng phí, không lỗi cứng).

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** trình duyệt bắt đầu tải file font ngay khi parse `<head>`, song song với CSS/JS
  khác, thay vì phải đợi phát hiện qua CSSOM — nhắm thẳng vào triệu chứng người dùng vừa xác nhận
  (icon vào muộn hơn phần tử khác trên mạng chậm). Không đo được lợi ích bằng số cụ thể trên mạng
  chậm thật (máy đo review ở LAN tốt) — coi là hợp lý dựa trên cơ chế, không phải đã đo.
- **Rủi ro:** thấp. Nếu `href` preload không khớp file thật đang dùng (sai path/tên file) thì chỉ
  lãng phí băng thông (tải thêm 1 file không cần) hoặc bị cảnh báo console "preload chưa dùng
  trong vài giây" — không làm hỏng trang.
- **Test:** không có Jest cho `<head>` HTML. Xác minh thủ công: DevTools Network, lọc Font, xác
  nhận request font bắt đầu sớm hơn (Priority cao hơn / thời điểm bắt đầu sớm hơn so với trước khi
  sửa), không có warning "preload not used" trong Console sau khi trang tải xong hoàn toàn.
- **Bump `?v=N`** — đụng `client/*.html`, theo quy tắc cache-busting.

Chi tiết thực thi: [docs/instruction/B123-preload-font-phosphor-woff2-giam-do-tre-hien-thi-icon.md](../instruction/B123-preload-font-phosphor-woff2-giam-do-tre-hien-thi-icon.md).
