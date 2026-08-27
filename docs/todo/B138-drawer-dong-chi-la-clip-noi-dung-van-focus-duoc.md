# #138 — Drawer "đóng" chỉ là cắt xén: nội dung vẫn nằm trong tab-order và accessibility tree

**Trạng thái:** ✅ Đã sửa (2026-08-22).

**Nguồn:** quan sát thứ 2 của người dùng khi reopen #134 (2026-08-21): *"khi collapse (thu gọn)
sidebar vào, dùng developer tool vẫn thấy được khung chat, ..."* — kèm ảnh DevTools highlight
`#tab-chat.tab-content--active` đo `298.683×633`, tràn đè lên bàn cờ.

## Vấn đề — đây là hành vi *thiết kế*, nhưng thiếu một nửa

`client/css/room-zen.css:408-448`:

- `.panel-right-shell`: `position: fixed; right: 0; width: var(--zen-drawer-w); overflow: hidden;
  display: flex; justify-content: flex-end`.
- `.panel-right` bên trong **luôn giữ nguyên** `width: calc(var(--zen-drawer-w) - 1px)`.
- Collapse (`room-zen.css:437-439`) chỉ thu **shell** xuống `--zen-rail-w` (56px). Đứa con vẫn rộng
  339px và bị `overflow: hidden` cắt mất phần **trái**; `justify-content: flex-end` giữ rail (phần
  phải nhất) còn nhìn thấy. Comment trong file nói rõ đây là chủ ý.

⇒ DevTools vẫn thấy khung chat là **đúng theo thiết kế**, không phải bug render. Nhưng cắt xén thuần
CSS không kèm bất kỳ cơ chế nào loại nội dung khỏi tương tác:

- Không `inert`, không `aria-hidden`, không `visibility: hidden` ⇒ ô `#chat-input`, nút Gửi, nút
  `.btn-kick`, các nút trong `.panel-players` **vẫn nhận được focus bằng phím Tab** khi drawer đang
  "đóng" — người dùng bàn phím gõ vào một ô vô hình.
- Trình đọc màn hình vẫn đọc toàn bộ nội dung của drawer đã đóng.
- Find-in-page vẫn khớp nội dung không nhìn thấy.

(Lưu ý: phần tràn nằm ở phía **inline-start** trong LTR nên trình duyệt **không** cuộn tới được —
focus vào phần tử bị cắt sẽ không làm rail trượt đi. Đã kiểm tra, không phải nguồn của hiện tượng
"sidebar thụt" ở #136.)

## Việc cần làm

1. Tái hiện + đo bằng Playwright: `Tab` liên tục từ topnav khi `body.zen-drawer-collapsed`, ghi lại
   `document.activeElement` — xác nhận focus lọt vào vùng bị cắt.
2. Sửa: thêm `inert` (hoặc `aria-hidden` + `tabindex="-1"` fallback) lên cột nội dung khi collapsed.
   **Ràng buộc:** không được đụng vào rail (`.sidebar-tabs`) — nó phải luôn focus được, đó là cách
   duy nhất mở lại drawer. Cẩn thận với mobile (≤768px): ở đó collapse là `transform: translateY()`
   trên sheet (`room-zen.css:934-958`), cùng class nhưng khác cơ chế — nội dung bị đẩy khỏi màn hình
   cũng cần cùng cách xử lý.
3. `inert` cần set bằng JS (thuộc tính, không phải CSS) ⇒ phải móc vào **cả 3** nơi đổi class liệt kê
   trong `docs/todo/B136-*.md`, tránh tạo thêm một nguồn sự thật thứ tư lệch pha.

## Liên quan

- `docs/todo/B136-drawer-thut-vao-khi-modal-hien-len.md` — cùng báo cáo, khác lỗi.
- `docs/todo/B134-sidebar-tab-thut-vao-trong-khi-redraw.md` — mô tả cơ chế collapse gốc.

---

## Kết quả tái hiện — 2026-08-21 (Playwright, Chromium 1440×900, server cô lập)

**Đã xác nhận.** `body.zen-drawer-collapsed`, `.panel-right-shell` co còn `x=1384, w=56`:

| Phần tử | vị trí | nằm trong shell? | `inert` | `aria-hidden` |
|---|---|---|---|---|
| `#chat-input` | x=1121, w=218 | **không** (bị cắt) | ✗ | ✗ |
| `#btn-send` | x=1349, w=21 | **không** (bị cắt) | ✗ | ✗ |
| `.panel-players` | x=1101, w=289 | **không** (bị cắt) | ✗ | ✗ |

Đi bằng phím Tab từ `#btn-leave`, thứ tự focus thực tế:

```
btn-settings → 4× .btn-game → #start-modal-btn → 3× .tab-btn [rail]
→ INPUT#chat-input  [inDrawer CLIPPED-INVISIBLE]      ← focus vào ô vô hình
→ BUTTON#btn-send   [inDrawer CLIPPED-INVISIBLE]      ← rồi nút vô hình
→ BODY → topnav__brand → btn-leave
```

Người dùng bàn phím gõ được vào một ô chat hoàn toàn không nhìn thấy. Rail vẫn focus được (đúng, phải
giữ nguyên). Đã kiểm tra thêm: phần bị cắt nằm ở phía inline-start nên trình duyệt **không** cuộn tới
được ⇒ focus vào đó **không** làm rail xê dịch — loại bỏ khả năng đây là nguồn của #136.

---

## Bản sửa — 2026-08-22

`inert` là thuộc tính DOM nên chỉ đặt được từ JS. Thay vì thêm lời gọi rải rác ở **cả 3** nơi đổi
class (đúng loại "nguồn sự thật thứ tư" mà `docs/instruction/B138-*.md` cảnh báo), gom lại thành
**một người ghi duy nhất** trong `client/js/room.js`:

```js
function syncDrawerInert() { /* .panel-players + mọi .tab-content ← inert */ }
function setDrawerCollapsed(collapsed) {
  document.body.classList.toggle('zen-drawer-collapsed', collapsed);
  syncDrawerInert();
}
window.RoomDrawer = { setCollapsed: setDrawerCollapsed, syncInert: syncDrawerInert };
```

Cả 3 nơi đều đi qua hàm này: handler breakpoint (#134), handler click tab (#136), và
`room-socket.js` (tự thu gọn trên mobile khi `game:init`). Class và `inert` không thể lệch pha vì
chúng được ghi trong cùng một hàm.

**Ràng buộc đã giữ đúng:**

- `.sidebar-tabs` (rail) **không bao giờ** `inert` — có test riêng khẳng định điều này ở cả 3 lần
  đổi trạng thái liên tiếp.
- Chỉ đặt `inert` khi có **cả** `zen-room` **và** `zen-drawer-collapsed`: ngoài zen skin class này
  không có CSS tương ứng nên nội dung vẫn hiện, làm nó `inert` sẽ giấu nội dung người dùng đang thấy.
- Không gate theo media query ⇒ mobile (sheet `translateY` ra ngoài màn hình) được xử lý y hệt.
- Focus đang nằm trong vùng sắp thành `inert` được trả về **nút rail của đúng tab đang mở** trước
  khi thuộc tính rơi xuống, không để rơi về `<body>`.
- Không đụng `overflow:hidden` / `justify-content:flex-end` / chiều rộng `.panel-right` — cơ chế
  hình ảnh giữ nguyên, #138 chỉ bổ sung nửa ngữ nghĩa còn thiếu.

### Đo bằng Playwright (instance cô lập, đi Tab thật từ `#btn-leave`)

| Viewport | Trước | Sau |
|---|---|---|
| desktop 1440×900 | **2 điểm dừng vô hình**: `INPUT#chat-input`, `BUTTON#btn-send` | **0** |
| mobile 393×727 | **2 điểm dừng vô hình**: `INPUT#chat-input`, `BUTTON#btn-send` | **0** |

Rail vẫn đi tới được bằng Tab ở cả hai (bắt buộc — là cách duy nhất mở lại drawer), và trên mobile
`#quick-chat-input`/`#quick-chat-send` vẫn nằm trong tab-order (chúng cố ý nằm ngoài
`.panel-right-shell`). Mở lại drawer: `inert` được gỡ, gõ và gửi chat thật thành công, 0 console
error. §B36 kiểm lại trực tiếp trên bản đã sửa (desktop + mobile): lúc start-modal hiện thì drawer
đang **mở** ⇒ không có gì `inert`, ghế đứng dậy và chat đều hoạt động.

14 test jsdom mới `client/tests/room-drawer-inert.test.js` (bảng quyết định class × phần tử, rail
không bao giờ `inert`, cả 3 nơi ghi class, trao trả focus). `npm test` 1227/1227. `?v=` 142→143 —
[fix-log](../fix-log/2026-08-22-todo-138-drawer-inert-when-collapsed.md)
