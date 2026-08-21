# #139 — 📵 Trên điện thoại, nút "Bắt đầu" của start-modal bị bottom sheet che hoàn toàn — không vào được trận

**Trạng thái:** ⏳ Chưa làm — **mức độ: chặn đường (blocker)**.

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
