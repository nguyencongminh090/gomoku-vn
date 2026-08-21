# #136 — (Reopen #134) Drawer zen bị thu vào rail đúng lúc modal hiện lên, ở viewport desktop

**Trạng thái:** ⏳ Chưa làm — đang xác định nguyên nhân gốc.

**Nguồn:** người dùng đính chính mô tả của `TODO.md` #134 (2026-08-21), kèm 6 ảnh chụp
`play3cr.dpdns.org/room.html?id=%23%23ATS` (có ảnh DevTools). Nguyên văn: *"Khi modal (start/...)
hiện lên, sidebar bị đẩy thụt lùi vào trong. Đính chính: trường hợp miêu tả trong #134 là một phần
không phải mô tả tổng quát."*

## Vấn đề

#134 đã sửa **một** đường vào trạng thái kẹt (`game:init` auto-collapse ≤768px không bao giờ tự gỡ)
và bản sửa đó vẫn đúng — nhưng nó **không phải mô tả tổng quát**. Người dùng quan sát thêm: hiện
tượng gắn với **lúc modal hiện lên**, và trong ảnh chụp DevTools `body` mang
`zen-drawer-collapsed` ở viewport ~933px CSS (`section#board-area-shell` đo được `933×773`) — tức
**trên** breakpoint 768px, nên `game:init` (`room-socket.js:193-196`) *không thể* là nơi thêm class
trong tình huống này.

## Bản đồ code — chỉ có 3 nơi đụng vào `zen-drawer-collapsed`

| Nơi | Hành vi |
|---|---|
| `client/js/room-socket.js:193-196` | `game:init` → **thêm** class, chỉ khi `matchMedia('(max-width:768px)')` |
| `client/js/room.js:135-140` | bản vá #134 — chỉ **gỡ** class khi vượt breakpoint lên trên |
| `client/js/room.js:139-172` | click tab: click lại tab **đang active** ⇒ `toggle(...)`; click tab khác ⇒ `remove(...)` |

`renderStartModal()` (`client/js/room-ui.js:227-247`) chỉ add/remove `.visible` trên `#start-modal`
— **không** chạm `body.className` hay `.panel-right-shell`. Nên "modal làm sidebar thụt" không thể
là quan hệ nhân quả trực tiếp; phải qua một trong 3 nơi trên.

## Giả thuyết chính (chưa chứng minh) — click tổng hợp `chatBtn.click()`

`client/js/room-ui.js:488-495` (`renderUsersList`) và `client/js/room-ui.js:544-549`
(`renderScoreTable`) bắn **click tổng hợp** `chatBtn.click()` khi nút tab đang active bị ẩn đi. Click
đó chạy thẳng vào handler tab ở `room.js:139-172`, tức đi qua nhánh
`document.body.classList.toggle('zen-drawer-collapsed', !collapsedNow)` nếu nút chat lúc đó **đã**
active. Đây là con đường **duy nhất** trong codebase có thể collapse drawer ở viewport desktop mà
không cần người dùng bấm gì — và nó chạy trong `updateUI()`, tức đúng khoảnh khắc modal xuất hiện
(ván kết thúc → `state` về `waiting` → bảng điểm/khán giả đổi trạng thái + `renderStartModal()`
cùng một lượt, xem `room-socket.js` `game:ended`).

Điều kiện lý thuyết để nhánh `toggle` (thay vì `remove`) trúng đòi hỏi nút chat đã active sẵn lúc bị
click — đọc code tĩnh **chưa** dựng được trạng thái đó (chỉ 1 nút mang `tab-btn--active` tại một
thời điểm). Phải đo trên trình duyệt thật mới chốt được: hoặc chứng minh có tổ hợp trạng thái dẫn
tới nó, hoặc loại bỏ giả thuyết và tìm tiếp.

## Việc cần làm

1. Tái hiện bằng Playwright (browser binaries có sẵn ở `$PLAYWRIGHT_BROWSERS_PATH`), theo dõi
   `body.className` bằng `MutationObserver` + `console.trace()` để lấy stack trace nơi class được
   thêm.
2. Chỉ sau khi có stack trace thật mới viết fix — **không** vá thêm một lớp nữa ở nơi triệu chứng
   hiện ra (đúng cảnh báo "Root-cause diagnosis" trong `CLAUDE.md`: #134 đã là một vòng vá ở lớp
   triệu chứng).
3. Giữ nguyên bản sửa #134 (nó đúng cho đường vào của nó), giữ nguyên breakpoint 768px và cơ chế
   width/overflow-clip của `.panel-right-shell`.

## Liên quan

- `docs/todo/B134-sidebar-tab-thut-vao-trong-khi-redraw.md` — vòng 1, đã sửa, không bị đảo.
- `docs/todo/B137-start-modal-phu-tron-viewport-de-len-drawer.md` — lỗi layout modal, phát hiện
  trong cùng lần đọc code, độc lập.
- `docs/todo/B138-drawer-dong-chi-la-clip-noi-dung-van-focus-duoc.md` — quan sát thứ 2 của người dùng.

---

## Kết quả tái hiện — 2026-08-21 (Playwright, server cô lập cổng 3100, DB riêng)

**Trạng thái:** ✅ Đã đo — **không tái hiện được trên code hiện tại**; tái hiện 100% trên code
**trước** bản vá #134.

### Đã thử và KHÔNG ra lỗi (code hiện tại, `?v=139`)

Chromium 1440×900 và Firefox 933×773 (đúng viewport trong ảnh DevTools của người dùng), kịch bản
đầy đủ: tạo phòng → khán giả vào → 2 người ngồi ghế → modal hiện → bắt đầu → đi quân → đầu hàng →
modal hiện lại → tái đấu (`game:init` lần 2) → đầu hàng lần 2.

- `.panel-right-shell` giữ nguyên **340px ở toàn bộ 445 frame** lấy mẫu bằng `requestAnimationFrame`
  suốt vòng đời trận đấu; rail đứng yên ở x=1384/1385 (chênh do làm tròn). Không có cả trạng thái
  kẹt lẫn "thụt thoáng qua" trong animation.
- Nghi phạm `chatBtn.click()` **có thật và có bắn** (bắt được `isTrusted=false`, stack
  `renderUsersList → updateUI → room-socket.js:126`) khi khán giả rời phòng lúc người dùng đang ở
  tab Khán giả — nhưng nó rơi vào nhánh `remove` (`wasActive=false`), **không** collapse. Giả thuyết
  chính trong phần trên **bị loại** ở kịch bản này.
- Bản vá #134 hoạt động đúng ở cả 2 engine: thu <768 lúc `game:init` → `collapsed=true` → mở rộng
  lại → `collapsed=false`.

### Thí nghiệm đối chứng — tái hiện đúng ảnh chụp của người dùng

Cùng một script, chỉ khác **duy nhất** đoạn vá #134 trong `client/js/room.js`:

| `room.js` | sau khi mở rộng lại về 933px |
|---|---|
| **bỏ bản vá #134** | `body class="zen-room zen-drawer-collapsed"`, `.panel-right-shell` = **56px**, `#board-area-shell` 933×713 — **khớp ảnh DevTools của người dùng** |
| **có bản vá #134** | `body class="zen-room"`, `.panel-right-shell` = **340px** |

### Kết luận

Trạng thái trong ảnh chụp là hành vi của **code trước bản vá #134**. Production hiện tại đã phục vụ
bản có vá — kiểm chứng trực tiếp: `curl https://play3cr.dpdns.org/js/room.js?v=139 | grep -c
drawerBreakpoint` → `2`. Nhiều khả năng ảnh được chụp trên một phiên trang còn giữ `room.js` cũ
trong cache (đúng vết xe của `TODO.md` #135, và của memory "verify cache before deep debug").

**Việc còn lại:** người dùng hard-refresh (Ctrl+Shift+R) rồi xác nhận. Nếu vẫn tái hiện được sau
hard-refresh thì mở lại mục này kèm bước tái hiện cụ thể — hiện chưa có bằng chứng nào cho một đường
vào khác.

**Lưu ý phát hiện phụ:** nhánh `main` **chưa** có bản vá #134 (`git show main:client/js/room.js |
grep -c drawerBreakpoint` → `0`), dù `docs/todo/B134-*.md` ghi nhánh `fix/*` off `main`. Production
đang chạy nội dung `dev`. Cần đối chiếu lại quy trình merge — xem `TODO.md` #140.
