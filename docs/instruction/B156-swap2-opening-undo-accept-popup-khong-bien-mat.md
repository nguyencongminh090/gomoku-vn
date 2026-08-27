# B156 — Hướng dẫn thực thi

**Đọc trước:** [docs/todo/B156-*.md](../todo/B156-swap2-opening-undo-accept-popup-khong-bien-mat.md)
đã ghi rõ nguyên nhân (đã xác minh, đọc code hiện tại, không suy đoán): server chấp nhận Undo ở pha
Opening (`GameEngine.acceptUndo` → `mode: 'opening'`) chỉ emit `game:swap2_state`, và
`buildSwap2State()` không bao giờ gắn `undoCancelled` — nên client không có tín hiệu nào để xoá
`undoOfferPending`, popup treo vĩnh viễn dù board/lượt/màu đã rollback đúng.

## Cách sửa được khuyến nghị

Ở [server/socket/handlers/GameHandler.js:442](../../server/socket/handlers/GameHandler.js#L442)
(nhánh `if (result.mode === 'opening')` trong `game:undo_accept` handler), sau khi gọi
`buildSwap2State(engine, null, result.nextColor)`, gắn thêm field đánh dấu vào **object đã trả về**
trước khi emit — ví dụ:

```js
const swap2State = buildSwap2State(engine, null, result.nextColor);
swap2State.undoCancelled = true; // tái dùng field đã có, xem client room-socket.js:355-358
io.to(room.roomId).emit('game:swap2_state', swap2State);
```

**Đừng sửa `buildSwap2State()`** — hàm này còn được gọi ở các chỗ khác trong cùng file (move handler,
swap2_choice handler...) nơi field `undoCancelled` được gắn *sau* lời gọi tuỳ theo `hadOwnUndoOffer`
(xem các dòng 224, 269, 283 hiện có — cùng pattern). Sửa trong hàm dùng chung sẽ ảnh hưởng các đường
gọi khác không liên quan tới Undo.

Phía client, `game:swap2_state` handler ở
[client/js/room-socket.js:355-358](../../client/js/room-socket.js#L355-L358) **đã có sẵn** logic xoá
`undoOfferPending` khi thấy `data.undoCancelled` — không cần sửa gì thêm ở client nếu đi theo hướng
này, chỉ cần bump `?v=N` vì đây vẫn tính là "đụng `client/js/`" theo tinh thần rule (thực ra chỉ
`server/` thay đổi lần này — kiểm tra lại: nếu không sửa file nào trong `client/`, **không cần** bump
`?v=N`; chỉ bump nếu cách làm cuối cùng có đụng tới file client).

## Bẫy cần tránh

- **Đừng lẫn với cơ chế `undoCancelled` gốc.** Cờ này vốn dùng cho tình huống khác: người xin Undo
  tự huỷ offer của chính mình bằng cách đi tiếp một nước mới trong lúc offer đang chờ (xem
  `hadOwnUndoOffer` ở các dòng 104, 216, 250 cùng file). Việc tái dùng field này cho trường hợp
  "offer đã được **accept**" là an toàn về mặt ý nghĩa phía client (cả hai đều dẫn tới cùng một hành
  động: xoá `undoOfferPending` + re-render), nhưng nếu muốn rõ ràng hơn về mặt đặt tên, có thể cân
  nhắc thêm field mới thay vì tái dùng — quyết định khi implement, không bắt buộc phải theo đúng
  named field cũ.
- **Không đụng nhánh `play`** (dòng 443-455 cùng handler) — nhánh đó đã emit `game:undo_applied` và
  đã đúng, xác nhận bằng đọc code, không phải giả định.
- **Không đụng `declineUndo`/`game:undo_declined`** — đã đúng.
- **Kiểm tra lại `colorsAssigned`/`timer.remapForSwap2` ở cùng khối code (dòng 436-440)** không bị
  ảnh hưởng bởi thay đổi — thay đổi chỉ thêm 1 field vào object trả về, không đổi luồng gọi
  `timer.switchTurn`/`timer:sync` phía trên.
- Nếu viết test server-side cho phần emit này: mock `io.to(...).emit` và assert
  `game:swap2_state` payload có `undoCancelled: true` khi `acceptUndo()` trả `mode: 'opening'` —
  không cần dựng lại toàn bộ socket thật, theo cùng cách các test `GameEngine.test.js` hiện có
  test `acceptUndo` (đọc lại các test đó trước khi viết test mới, tránh trùng lặp).
