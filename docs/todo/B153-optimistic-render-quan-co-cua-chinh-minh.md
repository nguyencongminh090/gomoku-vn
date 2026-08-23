# B153 — Client không render lạc quan: người tự đặt quân phải chờ trọn 1 round-trip mới thấy quân mình

**Trạng thái:** Chưa làm — **phụ thuộc #152, không được ship trước #152** (lý do ở mục "Quan hệ phụ
thuộc" bên dưới)

**Severity:** Medium (không hỏng ván, nhưng là nguồn cảm giác "giật lag" trực tiếp nhất khi đánh cờ)
**Platform:** Mọi nền tảng — nặng tỉ lệ thuận với RTT
**Pages affected:** `room.html` (bàn cờ khi đang chơi)
**Reported by:** User (báo cáo người chơi ở Trung Quốc, 2026-08-23) — "Mỗi khi nhấn nước đi: lag;
~0.5s mới xuất hiện."

---

## Symptom

Bấm đặt quân → khoảng **~0.5s** sau quân mới hiện ra trên bàn cờ. Xảy ra với **quân của chính mình**,
không chỉ quân đối thủ.

---

## Nguyên nhân

Đường đi đã trace đầy đủ:

1. `client/js/game-ui.js:97-110` — `onCellClick(x, y)` chỉ gọi
   `global.RoomClient.emit('game:move', { x, y })` (dòng 108). **Không chạm vào
   `st.gameState.board`, không gọi `setState`/`_draw`.** Không vẽ gì cả.
2. Server `server/socket/handlers/GameHandler.js:54-108` validate qua
   `GameEngine.makeMove()` rồi `io.to(room.roomId).emit('game:moved', movePayload)` — **broadcast cho
   cả phòng, kể cả chính người vừa đi**, không phải `socket.emit` riêng.
3. `client/js/room-socket.js:211-245` nhận `game:moved`, gán
   `st.gameState.board[data.y][data.x] = colorVal` (dòng 228) rồi gọi `GameUI.updateBoardState()`
   (dòng 243) → `BoardRenderer.setState()` → `_draw()` (`client/js/board.js:107-127, 447+`).

Nghĩa là **kể cả người tự đặt quân cũng phải trả trọn một round-trip mạng** (client → server →
broadcast → client) mới thấy quân của chính mình.

### Đã loại trừ: không có độ trễ giả nào trong code

Đã kiểm tra kỹ, **không** có `setTimeout`, `requestAnimationFrame` loop, hay CSS transition nào chắn
đường vẽ:
- `BoardRenderer.setState()` (`board.js:107`) gọi thẳng `this._draw()` (`board.js:127`) **đồng bộ**;
  `_draw()` (`board.js:447`) vẽ bằng canvas 2D API ngay lập tức.
- Bàn cờ là `<canvas id="game-canvas">`, **không phải DOM element cho từng quân** ⇒ CSS transition
  per-stone không tồn tại.
- Các `setTimeout` gần khu vực này (`room-socket.js:144, 149, 156`, 1500ms) là redirect sau khi
  phòng đóng/bị kick — **không liên quan**.

⇒ **Toàn bộ ~0.5s đo được là RTT mạng thật.** Code không tạo ra độ trễ, nhưng thiết kế chờ-server
khiến RTT **bị lộ 100% ra UI** thay vì được che đi.

---

## Việc cần làm

Vẽ quân "pending" (bán trong suốt / viền nét đứt — trạng thái thị giác **phân biệt được** với quân đã
xác nhận) ngay khi click, rồi hoà giải:

| Sự kiện | Xử lý |
|---|---|
| ack `{ ok: true }` hoặc `game:moved` về | Chuyển pending → quân xác nhận |
| ack `{ error }` | Gỡ quân pending + hiện lý do từ chối |
| ack timeout (từ #152) | Giữ pending nhưng đổi sang trạng thái cảnh báo + gọi `game:resync` |

Trạng thái pending phải **nhìn khác** quân thường — vừa trung thực với người chơi (chưa chắc chắn),
vừa làm thao tác rollback đỡ giật cục khi server từ chối.

---

## Ranh giới bắt buộc (đọc kỹ trước khi code)

- **Chỉ kiểm tra hợp lệ tối thiểu phía client**: đúng lượt mình + ô trống + trong bàn cờ + không phải
  tường. **Không nhân bản logic `GameEngine` sang client**, đặc biệt **không** nhân bản `_checkWin`.
  Nhân bản luật = mầm mống divergence server/client, và server vẫn luôn là nguồn chân lý.
- **Loại trừ hoàn toàn giai đoạn Swap2 opening.** Ở nhánh Swap2 (`GameHandler.js:714-741`) game được
  khởi tạo với `color: null` cho cả hai người — **màu chưa được gán**, chỉ resolve sau khi hai bên
  chọn xong (`GameEngine.swap2Choice`, `timer.remapForSwap2()`). Client **không biết mình sẽ vẽ quân
  đen hay trắng**, nên không thể render lạc quan. Nhánh này **giữ nguyên hành vi chờ-server**.
- **Phải xác minh luật portal trước khi code**: nếu `rulePortal` làm quân xuất hiện ở vị trí **khác**
  chỗ click, optimistic render sẽ vẽ sai chỗ ⇒ phải tắt optimistic cho chế độ đó. Đọc code hiện tại
  thì `movePayload` dùng lại đúng `x, y` từ request (gợi ý là vị trí không đổi), **nhưng đây là giả
  định chưa kiểm chứng — đừng tin, hãy kiểm.**

---

## ⚠️ Quan hệ phụ thuộc: KHÔNG ship #153 trước #152

Optimistic render mà thiếu ack/timeout (#152) sẽ **biến freeze từ "thấy rõ" thành "âm thầm"**: người
chơi thấy quân mình hiện ra bình thường, tưởng nước đi đã thành công, nhưng server chưa hề nhận được
— họ sẽ ngồi chờ đối thủ đi trong một ván mà lượt vẫn đang thuộc về mình, và không có gì báo sai.
**Tệ hơn hiện trạng.**

Thứ tự bắt buộc: **#152 trước, #153 sau** (hoặc gộp làm một đợt, nhưng không bao giờ #153 một mình).

---

## Ghi chú giá trị

Cải thiện này **không phụ thuộc** vào việc chốt được nguyên nhân mạng phía Trung Quốc — nó có lợi cho
mọi người chơi có RTT cao hoặc kết nối chập chờn (mạng di động, 3G/4G, wifi yếu, người chơi ở xa
server). Đáng làm bất kể kết quả điều tra GFW ra sao.

Đây là cải thiện **cảm nhận** (che RTT khỏi người dùng), **không phải** sửa nguyên nhân mất gói —
nêu rõ để không nhầm lẫn tầng, đúng tinh thần rule "Root-cause diagnosis" trong `CLAUDE.md`.

---

## Liên quan

- **#152** (`docs/todo/B152-game-move-khong-co-ack-timeout-retry-gay-freeze.md`) — điều kiện tiên
  quyết.
- **#82** (`docs/todo/B82-tournament-register-thua-round-trip-tournament-get.md`) — cùng loại vấn đề
  "round-trip thừa cộng dồn cảm giác lag", khu vực giải đấu; đọc để tham khảo cách đã xử lý.
