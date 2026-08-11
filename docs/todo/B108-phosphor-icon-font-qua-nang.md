# #108 — Font icon Phosphor quá nặng: 2 weight × (CSS 1530 icon + woff2 ~150 KB) cho 45 icon thực dùng, kèm `font-display: block`

**Trạng thái:** ⏳ (a) + (c) ✅ ĐÃ XONG (2026-08-12, nhánh `fix/phosphor-bold-font-display`) · (b)
cố ý CHƯA LÀM, khuyến nghị đóng

- **(a)** Bỏ link `bold/style.css` ở `client/index.html` và `client/login.html` — **chỉ 2 trang,
  không phải 3**: bảng bên dưới ghi `tournament.html` dùng 0 icon bold là **sai**, vì nó nạp
  `tournament-detail.js:342` vốn sinh `<i class="ph-bold ph-hourglass-medium">` từ JS. Tiết kiệm
  235 813 B/trang trên 2 trang đó.
- **(c)** `font-display: block` → `swap` ở cả `regular/` và `bold/`.
- **(b)** không làm: `client/js/tournament-match.js:721,760` ghép tên icon động
  (`` `ph-bold ${iconClass}` ``), nên tập icon thực dùng không suy ra được từ grep tĩnh — đúng chế
  độ hỏng im lặng mà instruction cảnh báo. Theo "không chắc 100% thì không làm", đề nghị đóng (b).
- Bump `?v=103` → `?v=104`. Xác minh từng icon trên 6 trang × 2 viewport bằng Chromium thật:
  không phần tử `.ph-*` nào rơi về font fallback hay mất glyph. Chi tiết:
  [docs/fix-log/2026-08-12-todo-108-phosphor-bold-font-display.md](../fix-log/2026-08-12-todo-108-phosphor-bold-font-display.md).

Ba vấn đề chồng lên nhau ở cùng một chỗ (font icon Phosphor), nên gộp làm một mục — sửa riêng lẻ
từng cái là lãng phí vì đều cần đụng cùng bộ file `client/vendor/phosphor/`.

## (a) Weight `bold` nạp ở MỌI trang nhưng gần như không dùng

Cả 4 trang đều có đủ 2 `<link>`:

```html
<link rel="stylesheet" href="vendor/phosphor/regular/style.css?v=103" />
<link rel="stylesheet" href="vendor/phosphor/bold/style.css?v=103" />
```

Nhưng đếm thực tế số chỗ dùng class `ph-bold`:

| Trang | Số lần dùng `ph-bold` | Nạp `bold/style.css`? |
|---|---|---|
| `index.html` (sảnh) | **0** | có (85 761 B + font 150 052 B) |
| `login.html` | **0** | có |
| `tournament.html` | **0** | có |
| `room.html` | 2 | có |

Tức **3/4 trang tải 85 KB CSS + 150 KB font hoàn toàn không dùng đến một icon nào**. Riêng
`room.html` dùng đúng 2 icon bold.

## (b) 45/1530 icon được dùng — 97% CSS và glyph là thừa

```
$ grep -rhoE '\bph-[a-z0-9-]+' client/*.html client/js/*.js | sort -u | wc -l
45
$ grep -oE '\.ph-[a-z0-9-]+:before' client/vendor/phosphor/regular/style.css | wc -l
1530
```

Bộ font đầy đủ (1530 icon) đang được ship để dùng 45 cái. Cả phần CSS (`.ph-xxx:before { content:
"\eNNN" }` × 1530) lẫn phần glyph trong `.woff2` đều gánh 1485 icon không bao giờ hiển thị.

## (c) `font-display: block` chặn hiển thị icon tới 3 giây

```css
/* client/vendor/phosphor/regular/style.css */
font-display: block;
```

`block` = trình duyệt **giấu hoàn toàn** phần tử dùng font đó trong "block period" (~3s theo spec)
để chờ font tải xong. Kết hợp với việc font 150 KB đứng sau một chuỗi request đã bị chậm sẵn (xem
#106), người dùng thấy đúng hiện tượng "trang tải xong nhưng các nút vẫn trống trơn một lúc" — một
phần cảm giác "lag" mà đo TTFB thuần không thể hiện ra.

So sánh: `client/vendor/fonts/manrope/style.css` dùng `font-display: swap` (3 chỗ) — đúng lựa chọn
cho font chữ. Phosphor thì không.

## Tổng kết lãng phí (trang sảnh, chưa nén)

| Mục | Đang tải | Cần thiết (ước tính) |
|---|---|---|
| `regular/style.css` | 78 081 B | ~3 KB (45 icon) |
| `bold/style.css` | 85 761 B | **0 B** (không dùng icon bold nào) |
| `Phosphor.woff2` | 147 380 B | ~8-15 KB (subset 45 glyph) |
| `Phosphor-Bold.woff2` | 150 052 B | **0 B** |
| **Tổng** | **461 274 B** | **~11-18 KB** |

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **(a) và (c) an toàn cao, làm được ngay:** bỏ `<link>` bold ở 3 trang không dùng (giữ ở
  `room.html`), và đổi `font-display: block` → `swap`. Cả hai đều là sửa vài dòng, không cần công cụ
  mới.
- **(b) rủi ro cao hơn, cần cân nhắc:** subset font phải chạy công cụ ngoài (`fonttools`/`glyphhanger`)
  và **rất dễ hỏng âm thầm** — nếu bỏ sót một icon chỉ được sinh động từ JS (template string, tên
  class ghép chuỗi) thì icon đó biến mất mà không có lỗi nào trong console. Con số 45 ở trên đến từ
  grep tĩnh, **chưa xác minh là đã bắt hết mọi cách sinh class trong `client/js/`**. Xem instruction
  để biết cách kiểm chứng trước khi subset.
- **Thứ tự đề xuất:** làm (a) + (c) trước (lợi ~236 KB ở 3/4 trang, gần như không rủi ro), đánh giá
  lại xem có còn đáng làm (b) không.
- **Nhớ bump `?v=N`** — đụng `client/vendor/` và các `<link>` trong `client/*.html`, xem quy tắc
  cache-busting trong CLAUDE.md.

Chi tiết: [docs/instruction/B108-phosphor-icon-font-qua-nang.md](../instruction/B108-phosphor-icon-font-qua-nang.md).
