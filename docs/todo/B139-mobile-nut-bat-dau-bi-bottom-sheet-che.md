# #139 — 📵 Trên điện thoại, nút "Bắt đầu" của start-modal bị bottom sheet che hoàn toàn — không vào được trận

**Trạng thái:** ✅ Đã sửa — **ĐÃ LÀM 2026-08-21** (`fix/mobile-start-modal-behind-sheet` off `main`, đã merge `dev`; PR vào `main` chờ người dùng xác nhận).

**Nguồn:** phát hiện tình cờ khi tái hiện #136 bằng Playwright (2026-08-21) — bước thu viewport
xuống 700px làm click vào `#start-modal-btn` timeout với thông báo
*"`<use href="...#ph-regular-trophy">` from `<aside class="panel-right-shell ui-shell">` subtree
intercepts pointer events"*. Đo lại trên profile điện thoại thật thì đúng là lỗi chặn đường.

## Số đo (Playwright, `devices['Pixel 5']` = 393×727, server cô lập)

| Đo | Giá trị |
|---|---|
| `#start-modal-btn` | `x=106, y=378, 182×52` |
| `.start-modal__card` | `top=249, bottom=459` |
| `.panel-right-shell` (bottom sheet) | `top=276, bottom=727`, `z-index: 700` |
| `#start-modal` | `z-index: 50` |
| **Phần thẻ modal bị sheet che** | **183px / 210px = 87%** |
| Phần tử nhận click ở tâm nút "Bắt đầu" | `DIV.players-row` — **nằm trong drawer** |
| **Chạm thật vào nút (`page.click`)** | **THẤT BẠI (timeout)** |

Trạng thái lúc đó: `zen-drawer-collapsed = false` — tức sheet **đang mở**, đúng hành vi thiết kế
trước khi vào trận (ghế ngồi + nút sẵn sàng nằm trong `.panel-players`, xem comment
`client/js/room.js:105-111`).

## Vì sao là blocker

`#start-modal-btn` là **lối duy nhất** để bấm "Bắt đầu" — grep toàn repo cho `confirmStart` chỉ ra 1
nút duy nhất (`client/room.html:98`, cùng shim `room-ui.js:626`). Người chơi trên điện thoại phải tự
đoán ra mẹo "chạm vào icon rail để thu sheet xuống trước" thì mới thấy và bấm được nút. Không có gợi
ý nào trên UI cho bước đó.

## Nguyên nhân

Xung đột `z-index` giữa hai quyết định độc lập, mỗi cái đều hợp lý riêng lẻ:

- `.start-modal { z-index: 50 }` (`client/css/game.css:412-426`) — cố ý thấp và
  `pointer-events: none` để không chặn thao tác (§B36).
- `body.zen-room .panel-right-shell { z-index: 700 }` ở nhánh ≤768px
  (`client/css/room-zen.css:934-952`) — cố ý cao để sheet phủ `.quick-chat-bar` (650) và
  `.float-messages` (550), có comment giải thích rõ.

Không ai tính tới việc start-modal cũng nằm dưới cùng bầu trời đó. Liên quan trực tiếp tới #137
(cùng gốc: vùng phủ/thứ tự lớp của start-modal chưa bao giờ được xét cùng drawer).

## Hướng sửa (chưa chốt)

Nâng `.start-modal` lên trên sheet ở nhánh mobile, **hoặc** ở ≤768px tự thu sheet (thêm
`zen-drawer-collapsed`) khi modal `.visible` rồi trả lại trạng thái cũ khi modal tắt. Phương án 2
đụng vào chính cơ chế class mà #134/#136 đang nhạy cảm ⇒ ưu tiên phương án 1 (thuần CSS, không thêm
nguồn sự thật mới cho `zen-drawer-collapsed`). Xem `docs/instruction/B139-*.md`.

Phải verify lại **bằng chạm thật** (`page.click`, không phải `el.click()` bằng JS) trên ít nhất 2
profile điện thoại + 1 tablet, và kiểm tra không làm hỏng: `.quick-chat-bar`, `.float-messages`, và
sheet vẫn phủ đúng những thứ nó phải phủ.


---

## Bản sửa (đã làm) — 2026-08-21

Thuần CSS, trong nhánh ≤768px của `client/css/room-zen.css`, hai vế đi cùng nhau:

1. `z-index: 750` — trên sheet (700), đảm bảo chạm tới nút kể cả khi màn hình quá thấp để hai thứ
   nằm rời nhau.
2. Neo lớp phủ vào dải trống giữa topnav và sheet: `position: fixed`,
   `inset: var(--zen-topnav-h) 0 auto 0`, `height: max(180px, calc(100dvh - topnav - sheet-h))`
   (+ biến thể `--zen-bar-h` khi sheet đã thu). Khi còn chỗ thì thẻ modal **không đè** sheet, rail
   và ghế ngồi vẫn bấm được — đúng tinh thần §B36.

Chỉ nâng z-index là **chưa đủ**: bản thử đầu (750 + `align-items: flex-start`) chạm được nút nhưng
vẫn đè sheet 79px và che tâm rail. Đã bác phương án tự thêm `zen-drawer-collapsed` khi modal hiện
(đúng ràng buộc trong `docs/instruction/B139-*.md`).

### Verify — chạm thật, không phải `el.click()`

| Viewport | thẻ bị sheet che | rail còn bấm được | chạm thật |
|---|---|---|---|
| Pixel 5 393×727 | **0px** (trước: 183px) | ✅ | ✅ vào trận |
| iPhone 12 390×664 | 9px | ✅ | ✅ |
| short phone 360×560 | 43px | ❌ (chấp nhận: đúng ca `max(180px,…)` + z-index gánh) | ✅ |
| narrow 700×600 | 27px | ✅ | ✅ |
| tablet 820×1180 / desktop 1440×900 | n/a (layout desktop, z vẫn 50/15) | ✅ | ✅ |

Đo lại lần nữa **sau khi merge vào `dev`** (nơi có `.quick-chat-bar` z-650 thay `.btn-focus`): kết
quả không đổi.

### Test

`client/tests/room-zen-start-modal-above-sheet.test.js` — 7 test: thang z-index so với
sheet/quick-chat-bar/float-messages (đọc số thật từ stylesheet, không hardcode), neo dải trống,
§B36 `pointer-events`, desktop không đổi. Kiểm chứng không rỗng: bỏ bản sửa ra → **5/7 fail**.
`npm test` **1150/1150** trên nhánh fix (baseline `main` 1143 + 7).
