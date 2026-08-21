# Fix log entry — 2026-08-22 01:02

## Prompt

"do #138" — mục `TODO.md` #138 đã tái hiện sẵn bằng Playwright hôm 2026-08-21, kèm
`docs/instruction/B138-*.md` chốt ràng buộc cứng (không đụng rail, mobile cùng cách xử lý, `inert`
phải móc vào cả 3 nơi đổi class).

## Action

### Nguyên nhân

Thu gọn drawer là một thao tác **thuần thị giác**: `.panel-right-shell` co xuống bề rộng rail còn
`.panel-right` bên trong giữ nguyên bề rộng, nên `overflow:hidden` cắt nội dung ở phía inline-start
và `justify-content:flex-end` để lại rail. Đó là chủ ý (tránh reflow chữ mỗi lần drawer chạy) và
comment trong `room-zen.css` đã giải thích — nhưng không có gì loại nội dung bị cắt khỏi **tab-order**
và **accessibility tree**. Đo lại bằng Playwright (đi Tab thật từ `#btn-leave`): focus dừng ở
`INPUT#chat-input` rồi `BUTTON#btn-send` khi cả hai đang vô hình, ở **cả** desktop (bị cắt ngang) lẫn
mobile (sheet `translateY` xuống dưới màn hình).

### Bản sửa

`inert` là thuộc tính DOM, không đặt được bằng CSS. Thay vì rải lời gọi ở cả 3 nơi đổi class — đúng
loại "nguồn sự thật thứ tư lệch pha" mà §B138 cảnh báo và là thứ #134/#136 đã trả giá — gom lại
thành **một người ghi duy nhất** trong `client/js/room.js`:

```js
function syncDrawerInert() { /* .panel-players + mọi .tab-content ← inert */ }
function setDrawerCollapsed(collapsed) {
  document.body.classList.toggle('zen-drawer-collapsed', collapsed);
  syncDrawerInert();
}
window.RoomDrawer = { setCollapsed: setDrawerCollapsed, syncInert: syncDrawerInert };
```

Cả 3 nơi đi qua hàm này: handler breakpoint (#134), handler click tab (#136), và `room-socket.js`
(tự thu gọn trên mobile khi `game:init`). Class và `inert` không thể lệch pha vì cùng một hàm ghi cả
hai.

Điều kiện áp dụng là **cả** `zen-room` **và** `zen-drawer-collapsed`: ngoài zen skin, class này
không có CSS tương ứng nên nội dung vẫn hiện — làm nó `inert` ở đó sẽ giấu thứ người dùng đang nhìn
thấy. Không gate theo media query, nên mobile được xử lý y hệt. Nếu focus đang nằm trong vùng sắp
thành `inert`, nó được trả về nút rail của **đúng tab đang mở** trước khi thuộc tính rơi xuống —
không để rơi về `<body>` và bỏ người dùng bàn phím không còn chỗ đứng.

### Đo (Playwright, instance cô lập: copy repo, DB tạm, cổng 3111/3112, `MAX_ROOMS_PER_IP=20`)

| Viewport | Điểm dừng Tab vô hình — trước | sau |
|---|---|---|
| desktop 1440×900 | 2 (`INPUT#chat-input`, `BUTTON#btn-send`) | **0** |
| mobile 393×727 | 2 (`INPUT#chat-input`, `BUTTON#btn-send`) | **0** |

Rail vẫn Tab tới được ở cả hai; trên mobile `#quick-chat-input`/`#quick-chat-send` vẫn trong
tab-order (chúng cố ý nằm ngoài `.panel-right-shell`). Mở lại drawer: `inert` được gỡ, gõ + gửi chat
thật thành công, 0 console error.

## Decision

Gom việc ghi class thành một hàm thay vì gọi `syncDrawerInert()` sau mỗi lần đổi class rải rác:
§B138 cho phép cả hai, nhưng nó cũng nói "làm #136 trước sẽ khiến #138 rẻ đi" — #136 đã gom **việc
đổi tab**, chưa gom **việc đổi class drawer** (vẫn 3 nơi). Một hàm mutator biến 3 nơi đó thành 1 chỗ
duy nhất, đúng tinh thần bản sửa #136, mà không cần thêm `MutationObserver`.

Chỉ dùng `inert`, không thêm `aria-hidden` + `tabindex="-1"` fallback: `inert` đã bao hàm cả hai
ngữ nghĩa (khỏi tab-order và khỏi accessibility tree) và dự án vốn đã dùng ES modules, `inset`,
`dvh` — cùng mức hỗ trợ trình duyệt.

Không đụng `overflow:hidden` / `justify-content:flex-end` / bề rộng `.panel-right` — §B138 ghi rõ cơ
chế hình ảnh là chủ ý, #138 chỉ bổ sung nửa ngữ nghĩa.

## Summary output

14 test jsdom mới `client/tests/room-drawer-inert.test.js`: bảng quyết định (`zen-room` × class →
phần tử nào `inert`, gồm 2 hàng non-zen), phủ đủ 5 cột nội dung, rail **không bao giờ** `inert` qua
3 lần đổi trạng thái, cả 3 nơi ghi class giữ đúng nhịp (nơi thứ 3 kiểm bằng cách đọc source
`room-socket.js`, vì test hành vi của nó cần socket thật), và 3 test trao trả focus. Bỏ bản sửa ra:
**14/14 fail**.

§B36 (`start-modal-non-blocking`) kiểm lại **trực tiếp trên trình duyệt** ở cả desktop lẫn mobile:
lúc `#start-modal` hiện thì drawer đang **mở** ⇒ không có gì `inert`, ghế đứng dậy và chat đều chạy.
Không dùng spec `e2e/start-modal-non-blocking.spec.ts` làm bằng chứng vì spec đó **đang flaky sẵn**
(fail cả trên `HEAD` chưa có bản sửa này, trên server mới tinh): nó chờ `waitForURL(/room\.html/)`
rồi đọc ngay `searchParams.get('id')`, nhưng `?id=` chỉ được gắn vào URL một nhịp sau — khi thua
cuộc đua thì người chơi B vào `/room.html` không id và bị đá về lobby. Đã ghi thành `TODO.md` #141
thay vì sửa kèm ở đây (ngoài phạm vi #138).

`e2e/start-modal-board-centering.spec.ts` (#137) vẫn 4/4 pass. `npm test` **1227/1227**.
`?v=` 142→143.

**Lưu ý harness e2e** (nhắc lại từ entry #137): chạy nhiều spec tạo phòng liên tiếp từ cùng một IP
đụng `authLimiter` (20 req/15 phút/IP) và `MAX_ROOMS_PER_IP` — fail kiểu "guest auth should succeed"
hoặc `#room-id-nav` không thấy là **giới hạn môi trường**, khởi động lại server trước khi kết luận.
