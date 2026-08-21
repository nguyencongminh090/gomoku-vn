# #138 — Drawer "đóng" chỉ là cắt xén: nội dung vẫn nằm trong tab-order và accessibility tree

**Trạng thái:** ⏳ Chưa làm.

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
