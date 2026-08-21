# #137 — `#start-modal` phủ trọn chiều rộng viewport: đè lên drawer và thẻ modal lệch tâm bàn cờ

**Trạng thái:** ⏳ Chưa làm.

**Nguồn:** đọc code khi điều tra reopen #134 (2026-08-21), khớp với ảnh chụp full-screen 1920×1080
của người dùng.

## Vấn đề

`#start-modal` là con của `.board-area-shell` (`position: relative`, `client/css/room.css:54-56`) và
được đặt `position: absolute; inset: 0; z-index: 50` (`client/css/game.css:412-426`).

Trong skin zen, `.board-area-shell` **chiếm trọn chiều rộng viewport** — chỗ dành cho drawer chỉ là
`padding-right: calc(var(--zen-drawer-w) + var(--zen-board-gutter))`
(`client/css/room-zen.css:282-292`), không phải một cột grid (zen đặt `.room { display: block }`).
`inset: 0` phân giải theo **padding box**, nên lớp phủ modal trải kín cả dải drawer. Hai hệ quả:

1. **Đè lên sidebar:** `z-index: 50` của `.start-modal` cao hơn `z-index: 15` của
   `.panel-right-shell` (`client/css/room-zen.css:425`). `.board-area-shell` có `position:relative`
   nhưng `z-index:auto` nên **không** tạo stacking context riêng — hai giá trị này so trực tiếp
   trong root stacking context. Hiện lớp phủ trong suốt và có `pointer-events: none` (chỉ
   `.start-modal__card` là `auto`) nên chưa gây hại đo được, nhưng "sidebar nằm dưới modal" là đúng
   theo nghĩa đen của thứ tự xếp lớp và là một quả mìn hẹn giờ: bất kỳ ai thêm nền/backdrop cho
   `.start-modal` sau này sẽ che luôn drawer.
2. **Thẻ modal lệch tâm:** `justify-content: center` căn thẻ theo tâm của vùng phủ = **tâm
   viewport**, không phải tâm bàn cờ. Trên ảnh 1920px: bàn cờ tâm ≈791px, thẻ modal tâm ≈960px —
   lệch ~170px về phía sidebar (đúng bằng nửa `--zen-drawer-w`).

## Hướng sửa (đề xuất, chưa chốt)

Cho `.start-modal` bám đúng vùng bàn cờ thay vì cả shell — ví dụ đổi `inset: 0` thành cách neo tôn
trọng padding (`inset: 0 calc(var(--zen-drawer-w) + var(--zen-board-gutter)) 0 0` trong zen), hoặc
chuyển anchor sang `#board-area`. **Cảnh báo:** comment ở `client/css/room.css:54-56` và
`client/room.html:89` ghi rõ modal cố ý **không** là con của `#board-area` vì `GameUI.initBoard()`
ghi đè `innerHTML` của `#board-area` trọn gói ở lần render đầu — đổi anchor sẽ xoá mất modal. Đọc
`docs/instruction/B137-*.md` trước khi làm.

Cần đo trước/sau bằng Playwright: tâm thẻ modal so với tâm canvas, ở cả trạng thái drawer mở và
drawer collapsed, desktop + mobile.

## Liên quan

- `docs/todo/B136-drawer-thut-vao-khi-modal-hien-len.md` — cùng lần điều tra, khác nguyên nhân.
- `instruction.md` §B36 — lý do `.start-modal` tách khỏi `.game-overlay` (không chặn thao tác).

---

## Kết quả tái hiện — 2026-08-21 (Playwright, Chromium 1440×900, server cô lập)

**Đã xác nhận bằng số đo, đúng như dự đoán từ đọc code:**

| Đo | Giá trị |
|---|---|
| `#start-modal` (lớp phủ) | `x=0, w=1440` — **trọn chiều rộng viewport** |
| `.panel-right-shell` | `x=1100, w=340` |
| **Chồng lấn lớp phủ × drawer** | **340px = 100% chiều rộng drawer** |
| `z-index` | `.start-modal` **50** vs `.panel-right-shell` **15** |
| Tâm `.start-modal__card` | `x=720` (= tâm viewport) |
| Tâm `#game-canvas` | `x=550` |
| **Lệch tâm** | **170px** = đúng nửa `--zen-drawer-w` (340/2) |

Hit-test giữa vùng drawer trả về `DIV.slot-card` ⇒ `pointer-events: none` đang làm đúng việc, drawer
vẫn bấm được. Tác hại hiện tại thuần thị giác (thẻ modal lệch khỏi tâm bàn cờ 170px) + rủi ro tương
lai (ai thêm backdrop cho `.start-modal` sẽ che luôn drawer). Ở trạng thái drawer collapsed, lệch
tâm giảm còn 28px (tâm thẻ 720 vs tâm canvas 692) — cùng một nguyên nhân, đúng bằng nửa rail.
