# Phần B #90. Trang trận đấu giải đấu thỉnh thoảng tự động scroll khi click bàn cờ (đi quân)

**Nguồn:** báo cáo người dùng — "sometime website auto scroll on board click (make move)", báo cáo
trên Tournament Room, chưa rõ Tables Room (`room.html`) có bị hay không (2026-08-09). Người dùng
màn hình 21 inch, đề xuất 2 hướng cân nhắc: scale layout theo chiều cao / thêm focus mode. Yêu cầu
phân tích UI trước khi sửa.

## Phân tích đã xác nhận qua code (CodeGraph + đọc trực tiếp)

**Nghi vấn chính — lệch hành vi `resize()` giữa Tournament Room và Tables Room:**

`client/js/tournament-match.js`'s `updateBoardState()` (dòng 350-374), chạy sau **mỗi nước đi**
(sự kiện `tmatch:moved`), luôn kết thúc bằng:
```js
requestAnimationFrame(() => boardRenderer.resize());
```
Trong khi hàm tương đương ở Tables Room, `client/js/game-ui.js`'s `updateBoardState()` (dòng
161-187), **không hề gọi `resize()`** — trang đó chỉ resize khi có sự kiện `window resize`, lúc
init, hoặc khi `setTurnBarVisible()` đổi hiển thị turn-bar. Đây là lệch hành vi thật, không phải
suy đoán.

`resize()` (`client/js/board.js` dòng 131-218) đo lại DOM đang sống (`.board-area-shell.clientHeight`,
`offsetHeight` của turn-bar/game-controls) rồi ghi `canvas.width`/`height`/`style.width`/`height` —
1 thay đổi ảnh hưởng layout, chạy trong `requestAnimationFrame` tức là **sau** khi trình duyệt đã
vẽ xong frame từ cú click, mỗi nước đi.

Đã `grep` toàn bộ `client/css/*.css` + `client/js/*.js`: không nơi nào đặt `overflow-anchor: none`
— nghĩa là "scroll anchoring" mặc định của trình duyệt đang bật trên toàn site. Đây là cơ chế
trình duyệt tự bù `scrollTop` khi 1 phần tử gần/ngoài viewport đổi kích thước ngoài ý muốn người
dùng — đúng hình dạng của việc resize canvas bị trễ 1 frame (rAF) sau mỗi click. Tính chất bất
định/heuristic của cơ chế này khớp với từ "sometimes" trong báo cáo hơn là 1 nguyên nhân xác định.

**Vì sao có khả năng chỉ lộ rõ ở Tournament Room:**
1. Resize-mỗi-click chỉ tồn tại ở trang này (đã nêu trên).
2. Trang cao hơn: `tournament-match.html` có thêm `.match-page-header` (tiêu đề trận + đồng hồ,
   `client/css/tournament.css` dòng 210-218) nằm TRÊN grid `.room` tái dùng từ room.css —
   `room.html` không có phần này. Trên màn 21 inch, tổng chiều cao nội dung dễ vượt viewport hơn →
   xuất hiện thanh scroll dọc → có "vật" để scroll-anchoring bù. Nếu Tables Room không vượt
   viewport, cùng 1 cơ chế trình duyệt sẽ không có gì để kích hoạt — không có nghĩa là an toàn,
   chỉ là chưa gặp điều kiện kích hoạt.

Cộng dồn trong cùng 1 lần cập nhật (trước khi rAF resize chạy): `renderGameControls()` (dựng lại
`innerHTML` của `#game-controls`, nút Resign/Draw/Time có thể hiện/ẩn/đổi trạng thái),
`renderScorePanel()`, `renderHeader()` — đều đổi chiều cao DOM ở cùng tick với việc canvas đổi
kích thước.

**Đã loại trừ:**
- `moveListEl.scrollTop = moveListEl.scrollHeight` (dòng 513) và 2 chỗ tương tự cho chat — đều
  giới hạn trong phần tử có `max-height: 320px; overflow-y: auto` (`tournament.css` dòng 252), nên
  không thể rò ra scroll cấp trang.
- Không có `window.scrollTo`, không có `.focus()`/`scrollIntoView()` nào nằm trên đường đi của
  click bàn cờ.

## Về 2 hướng người dùng đề xuất

- **Focus mode:** đã có sẵn cho Tables Room (`.room--focus`, `client/js/room.js`) nhưng CHỦ Ý chưa
  được nối vào `tournament-match.html` — đã có ghi nhận từ trước ở
  [docs/todo/B71-chat-input-focus-mode-khong-hien-do-display-none-to-tien.md](B71-chat-input-focus-mode-khong-hien-do-display-none-to-tien.md)
  ("focus-mode không tồn tại ở trang này"). Là việc port tính năng có sẵn, tách biệt khỏi bug này.
- **Scale layout theo chiều cao:** về cơ bản đây đã là việc `resize()` đang cố làm. Theo quy tắc
  "root-cause diagnosis" của repo (CLAUDE.md), sửa layout/scale chỉ giảm tần suất trang cần thanh
  scroll — không chạm vào cơ chế thật (reflow-mỗi-click + scroll anchoring) — tức là che triệu
  chứng, không phải sửa gốc.

## Hướng sửa đề xuất (chưa thực hiện — chỉ phân tích theo yêu cầu)

Bỏ lời gọi `resize()` vô điều kiện trong `updateBoardState()` của `tournament-match.js`, khớp với
hành vi `game-ui.js` — chỉ resize khi init/`window resize`/đổi hiển thị turn-bar, không phải mỗi
lần đồng bộ state sau nước đi. Xem hướng dẫn thực thi chi tiết + bẫy cần tránh:
[docs/instruction/B90-tournament-match-tu-dong-scroll-khi-click-ban-co.md](../instruction/B90-tournament-match-tu-dong-scroll-khi-click-ban-co.md).

## Trạng thái

✅ ĐÃ XONG.

- **Client:** `client/js/tournament-match.js`'s `updateBoardState()` bỏ hẳn
  `requestAnimationFrame(() => boardRenderer.resize())` — giữ nguyên `setState()` (vẫn redraw mỗi
  nước đi) và `renderTimers()`. 2 lời gọi `resize()` hợp lệ khác (`initBoard()` lúc tạo board lần
  đầu, và listener `window resize`) giữ nguyên không đổi.
- **Cache-bust:** `?v=95` → `?v=96` trên toàn bộ `client/*.html` + `client/js/*.js` (đã verify chỉ
  còn đúng 1 version qua grep).
- **Test:** `client/tests/tournament-match-board-resize.test.js` (3 case, jsdom + fixture HTML thật,
  cùng khuôn mẫu test #88) — assert `boardRenderer.resize()` chỉ gọi đúng 1 lần (từ `initBoard()`)
  bất kể sau đó có bao nhiêu `tmatch:moved`. Đã xác nhận test FAIL trên code cũ (2 lần gọi resize
  chỉ riêng từ `tmatch:init`, vì handler đó gọi cả `initBoard()` lẫn `updateBoardState()`) trước khi
  áp fix, rồi PASS sau khi sửa. `npm test`: 42 suite / 980 test pass, không regression.
- **Chưa verify trực tiếp trên trình duyệt thật** — scroll anchoring là hành vi trình duyệt không
  thể assert qua Jest/jsdom (không có layout/paint thật); bước verify bằng tay (thu nhỏ cửa sổ cho
  trang cần thanh scroll, chơi vài nước, theo dõi `window.scrollY`) theo hướng dẫn ở
  `docs/instruction/B90-*.md` vẫn là bước riêng, chưa thực hiện trong lần sửa này.
- Chi tiết đầy đủ: [docs/fix-log/2026-08-09-todo-90-tournament-match-resize-scroll-jump.md](../fix-log/2026-08-09-todo-90-tournament-match-resize-scroll-jump.md).
