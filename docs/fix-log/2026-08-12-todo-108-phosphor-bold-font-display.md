# Fix log entry — 2026-08-12 06:12

## Prompt

> Do #107 (trivial) → #106 (the actual fix) → #108a/c → measure again

Tức chỉ **giai đoạn 1** của #108 — (a) bỏ weight `bold` ở trang không dùng và (c) `font-display` —
không làm (b) subset font.

## Action

- Bỏ `<link ... vendor/phosphor/bold/style.css ...>` khỏi `client/index.html` và
  `client/login.html`.
- `font-display: block` → `swap` trong `client/vendor/phosphor/regular/style.css` **và**
  `bold/style.css`.
- Bump `?v=103` → `?v=104` trên toàn bộ `client/*.html` + `client/js/*.js` (có đụng
  `client/vendor/`). Lệnh kiểm tra trong CLAUDE.md ra đúng một giá trị; hai file `*-mockup.html`
  vẫn ghim `?v=61` như thiết kế.

## Decision

- **`client/tournament.html` GIỮ link bold, khác với bảng trong file TODO** (bảng đó ghi
  `tournament.html` dùng 0 icon bold). Grep tĩnh trên HTML đúng, nhưng đúng cái bẫy mà instruction
  cảnh báo — `tournament.html` nạp `tournament-detail-entry.js` → `tournament-detail.js`, và
  `client/js/tournament-detail.js:342` sinh `<i class="ph-bold ph-hourglass-medium">` từ JS. Bỏ link
  ở đó sẽ làm icon action-banner mất im lặng.
- Vì vậy phần (a) chỉ áp dụng cho **2** trang chứ không phải 3: `index.html`, `login.html`.
  `login.html` thậm chí không có phần tử `.ph-*` nào (đo được: `total: 0`).
- `client/history.html` và `client/tournament-match.html` cũng giữ link bold — đều dùng `ph-bold`
  thật (history 9 icon, tournament-match qua `` `ph-bold ${iconClass}` ``).
- **Không làm (b) — và khuyến nghị đóng (b) thay vì làm.** Bằng chứng mới thu được trong lúc kiểm:
  `client/js/tournament-match.js:721,760` ghép tên icon động (`` `match-result-card__icon ph-bold
  ${iconClass}` ``), tức tập icon thực dùng **không** suy ra được từ grep tĩnh — đúng chế độ hỏng
  im lặng mà instruction mô tả. Theo chính instruction ("không chắc 100% thì không làm"), giá trị
  đúng ở đây là không subset.
- Không có unit test tự động (thuần client, repo chưa có runner cho `client/js/`).

## Summary output

Xác minh bằng Chromium thật, **cả desktop (1280×900) lẫn mobile (390×844)**, trên 6 trang, kiểm
từng phần tử `.ph-*`: font `:before` phải resolve về họ Phosphor và có `content`, cộng ảnh chụp
toàn trang.

```
desktop /index.html   icons=7  bold=0 boldSheet=false fonts=[Phosphor:loaded]                    bad=0
desktop /login.html   icons=0  bold=0 boldSheet=false fonts=[Phosphor:unloaded]                  bad=0
desktop /room.html    icons=5  bold=2 boldSheet=true  fonts=[Phosphor:loaded,Phosphor-Bold:loaded] bad=0
desktop /history.html icons=10 bold=9 boldSheet=true  fonts=[Phosphor:loaded,Phosphor-Bold:loaded] bad=0
desktop /tournament.html?id=…  icons=8 bold=0 boldSheet=true                                     bad=0
(mobile: số liệu trùng khớp từng dòng)
errors: none
```

`bad=0` ở mọi trang/mọi viewport = không icon nào rơi về font fallback hay mất glyph. Ảnh chụp lưu
ở scratchpad của phiên; đã xem lại bằng mắt ảnh `desktop_index_panels.png` (mở sẵn panel Cài đặt) —
bánh răng, cúp, lưới, đồng hồ lịch sử, dấu cộng, dấu X đều hiển thị đúng.

Tiết kiệm ở 2 trang bỏ được bold (chưa nén): `bold/style.css` 85 761 B + `Phosphor-Bold.woff2`
150 052 B = **235 813 B/trang**. `font-display: swap` bỏ hẳn "block period" ~3s giấu icon.

`npm test`: 51 suite / 1087 test xanh (không đụng `server/`, chạy để chắc chắn).
