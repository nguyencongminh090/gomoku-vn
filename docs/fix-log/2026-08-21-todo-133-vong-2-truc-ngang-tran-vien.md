# Fix log entry — 2026-08-21 18:12

## Prompt

Sau vòng 1 của TODO.md #133, người dùng xem trên **điện thoại thật** (`play3cr.dpdns.org`, ảnh chụp
+ DevTools) và xác nhận: màu đường kẻ đã đạt, nhưng **"vẫn còn khoảng trống ngoài: 476 vs 500,
padding: 24px, 12px at each size"** — `.board-area-shell` 500px trong khi `#game-canvas` chỉ 476px.

## Action

Vòng 1 chỉ chạm trục **dọc** (`viewportBudget`), nên trục ngang không đổi. Truy đúng 24px về 2 nguồn:

1. `client/css/room-zen.css`, block `@media (max-width: 768px)`: `.board-area-shell` có
   `padding: 10px 8px calc(var(--zen-bar-h) + 10px)` **và** override
   `.zen-drawer-collapsed .board-area-shell { padding-right: 8px }` (trạng thái mặc định) → 16px.
   Đổi cả hai về `0` trên trục ngang, giữ nguyên padding trên (10px) và phần dự trữ cho bottom bar.
2. `client/js/board.js`'s `maxVw`: `Math.min(shellWidth - 8, window.innerWidth - 8)` → 8px nữa.
   16 + 8 = 24, khớp **chính xác** số người dùng đo.

Tách nhánh `maxVw` cho mobile: zen dùng `Math.min(shellWidth, window.innerWidth) - 2`, non-zen
**giữ nguyên** `- 8`.

## Decision

**Không bỏ `- 8` cho mọi skin.** Bình luận tại chỗ nói rõ nó chống overshoot của mẹo full-bleed
`width: calc(100% + 32px); margin-left: -16px` trong `room.css` mobile — mẹo đó có thật và vẫn đang
áp cho skin non-zen. Nhưng `room-zen.css` mobile **huỷ đúng mẹo đó** (`width: 100%; margin-left: 0`,
có comment giải thích), nên với zen `- 8` không bảo vệ gì cả, chỉ mất trắng 8px. Clamp `Math.min`
vẫn giữ làm hàng rào thật.

**Trừ 2px thay vì 0** trên nhánh zen: `.board-canvas-wrap` có `border: 1px solid var(--line)` mỗi
bên. Nếu để canvas đúng bằng viewport thì wrap rộng hơn viewport 2px và viền phải bị `overflow-x:
hidden` của `main.css` cắt mất. 2px này chính là `canvasWrapBorder` mà trục dọc đã trừ sẵn — nay
đối xứng cả hai trục.

## Summary output

Xác minh Playwright trên instance **cô lập** (copy repo mới + DB tạm + cổng 3111 + `CORS_ORIGIN`
riêng; server/DB thật của người dùng không bị đụng), guest login → tạo phòng thật → `room.html`, đo
`getBoundingClientRect()` + `document.documentElement.scrollWidth`:

| Viewport | canvas | wrap (ngoài) | wrap left→right | shell | tràn ngang | console error |
|---|---|---|---|---|---|---|
| 390×844 | 388 | 390 | 0 → 390 | 390 | không | 0 |
| 360×800 | 358 | 360 | 0 → 360 | 360 | không | 0 |
| 375×520 (height-bound) | 311.4 | 313.4 | 30.8 → 344.2 | 375 | không | 0 |

- 390×844: canvas **366 → 388 (+22px)**, wrap phủ đúng `0 → 390` = **sát hai mép**, đúng yêu cầu
  "tràn viền" như desktop. Quy chiếu về case người dùng đo: shell 500 → canvas nay **498** thay vì 476.
- 375×520 không đổi (311.4) — đúng, vì ở viewport đó **chiều cao** mới là ràng buộc, không phải
  chiều ngang; vòng 1 đã xử lý trục đó.
- `document.documentElement.scrollWidth === window.innerWidth` ở cả 3 → không sinh cuộn ngang.

`npm test` 1143/1143. `?v=124 → 125` (đụng cả `board.js` lẫn `room-zen.css`), verify bằng
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra đúng 1 giá trị.

Người dùng đã **xác nhận màu grid line 0.4 đạt** trên máy thật — phần "chưa phải giá trị người dùng
tự chốt" ở entry trước nay đã chốt.

[chi tiết TODO](../todo/B133-mobile-grid-line-nhat-va-ban-co-nho.md) ·
[entry vòng 1](2026-08-21-todo-133-mobile-grid-line-board-size.md)
