# Fix log entry — 2026-08-21 22:46

## Prompt

"Do #139" — sau khi tái hiện reopen #134 bằng Playwright, người dùng chốt sửa mục blocker mới phát
hiện: trên điện thoại, nút "Bắt đầu" của start-modal bị bottom sheet che, không vào được trận.

## Action

Lỗi tìm ra tình cờ: ở bước thu viewport xuống 700px trong script tái hiện #136, Playwright báo
`<use href="...#ph-regular-trophy"> from <aside class="panel-right-shell"> subtree intercepts
pointer events` khi click `#start-modal-btn`. Đo lại trên `devices['Pixel 5']` (393×727):

- thẻ modal bị sheet che **183/210px = 87%**;
- `elementFromPoint` tại tâm nút trả về `DIV.players-row` — **bên trong drawer**;
- `page.click('#start-modal-btn')` (chạm thật) **timeout**;
- `zen-drawer-collapsed = false` — sheet đang **mở**, đúng thiết kế trước khi vào trận.

Nguyên nhân: xung đột thang z-index giữa hai quyết định đúng riêng lẻ. `.start-modal` mang
`z-index: 50` (`game.css:412-426`) — cố ý thấp + `pointer-events: none` để không chặn drawer trên
desktop (§B36); còn nhánh ≤768px cho `.panel-right-shell` `z-index: 700` (`room-zen.css`) để sheet
phủ `.btn-focus` (600) và `.float-messages` (550). Chưa ai xét hai thứ đó chung một bầu trời.
Nghiêm trọng vì `#start-modal-btn` là **lối duy nhất** để bấm Bắt đầu — grep `confirmStart` toàn
repo chỉ ra đúng một nút (`client/room.html:98` + shim `room-ui.js:626`).

Sửa trong nhánh ≤768px của `client/css/room-zen.css`, hai vế đi cùng nhau:

1. `z-index: 750` — trên sheet, đảm bảo chạm luôn tới nút kể cả trên màn hình quá thấp để hai thứ
   nằm rời nhau.
2. Neo lại lớp phủ vào **dải trống giữa topnav và sheet** (`position: fixed`,
   `inset: var(--zen-topnav-h) 0 auto 0`, `height: max(180px, calc(100dvh - topnav - sheet-h))`,
   kèm biến thể `--zen-bar-h` khi sheet đã thu) — nhờ vậy khi còn chỗ thì thẻ modal **không đè**
   sheet chút nào, rail và ghế ngồi vẫn thấy và bấm được, đúng tinh thần §B36.

Giữ nguyên `pointer-events: none` trên lớp phủ (chỉ thẻ card bắt click) — có test khoá lại điều này.

## Decision

**Không** chọn phương án "modal hiện thì tự thêm `zen-drawer-collapsed`" (đã ghi rõ là cấm trong
`docs/instruction/B139-*.md`): nó tạo nguồn sự thật thứ tư cho đúng cái class đang là tâm điểm của
#134/#136, và sẽ nuốt mất lựa chọn thủ công của người dùng khi modal tắt. Thuần CSS, không thêm JS.

Chỉ nâng z-index thôi là chưa đủ: đo lần đầu (750 + `align-items: flex-start`) tuy chạm được nút
nhưng thẻ modal vẫn đè sheet 79px và che mất tâm rail (`railStillHittable: false`) — nên mới thêm vế
neo dải trống. Trên màn hình rất thấp (360×560) vẫn còn đè 43px và rail bị che: chấp nhận có ý thức,
đó chính là trường hợp `max(180px, …)` và z-index 750 gánh.

## Summary output

Verify bằng **chạm thật** `page.click()` (không dùng `el.click()` qua `evaluate` — nó bỏ qua
hit-testing nên pass giả), server cô lập cổng 3100 với DB riêng, không đụng DB thật:

| Viewport | thẻ bị sheet che | rail còn bấm được | chạm thật vào "Bắt đầu" |
|---|---|---|---|
| Pixel 5 393×727 | **0px** (trước: 183px) | ✅ | ✅ ready=true |
| iPhone 12 390×664 | 9px | ✅ | ✅ ready=true |
| short phone 360×560 | 43px | ❌ (chấp nhận, xem trên) | ✅ ready=true |
| narrow 700×600 | 27px | ✅ | ✅ ready=true |
| tablet 820×1180 | n/a (desktop layout) | ✅ | ✅ ready=true |
| desktop 1440×900 | n/a | ✅ | ✅ ready=true |

Test mới `client/tests/room-zen-start-modal-above-sheet.test.js` (7 test: thang z-index so với
sheet/btn-focus/float-messages, neo dải trống, §B36 pointer-events, desktop không đổi). Kiểm chứng
không rỗng: `git stash` riêng `room-zen.css` → **5/7 fail**. `npm test` **1150/1150**.
`?v=135→136` trên nhánh `fix/mobile-start-modal-behind-sheet` off `main`.

Ghi chú: 1150 = 1143 (baseline `main`) + 7 test mới — tức `main` **không** có 4 test của #134,
khớp với phát hiện ở `TODO.md` #140.
