# Fix log entry — 2026-08-27 05:23

## Prompt

Người dùng: "Scope: Room, Game playing, Undo, Swap2. At Phase Opening of Swap2, user request Undo,
on accept, mechanics work well but the display of popup is always appear." Sau khi đọc code + ghi
`TODO.md #156` / `instruction.md §B156`, người dùng yêu cầu "DO #156" — làm luôn.

## Action

Xác nhận bằng CodeGraph + đọc code hiện tại: `game:undo_accept` handler
(`server/socket/handlers/GameHandler.js`), nhánh `result.mode === 'opening'`, chỉ emit
`game:swap2_state` từ `buildSwap2State()` — hàm này không bao giờ gắn `undoCancelled`. Client
(`client/js/room-socket.js` `game:swap2_state` handler) chỉ xoá `undoOfferPending` (biến điều khiển
popup) khi thấy đúng cờ đó, hoặc qua `game:undo_applied` (chỉ nhánh `play`), hoặc `game:undo_declined`
— không đường nào khớp accept ở pha opening.

Sửa 1 chỗ: sau `buildSwap2State(engine, null, result.nextColor)` ở nhánh opening, gắn
`swap2State.undoCancelled = true` trước khi emit — tái dùng đúng cờ client đã đọc sẵn, không sửa
hàm `buildSwap2State()` dùng chung (các lời gọi khác — move handler, swap2_choice handler — vẫn tự
gắn cờ này theo `hadOwnUndoOffer` của riêng chúng, không đụng tới).

Kiểm tra: đây là code chỉ tồn tại trên `dev` (`git show main:server/socket/handlers/GameHandler.js`
không có `undo_accept`/`buildSwap2State` liên quan Undo — tính năng Undo #128 chưa merge vào `main`)
⇒ theo ngoại lệ trong `git-workflow` skill, branch `fix/*` off `dev`, merge lại `dev` (không phải
`main`).

## Decision

- Base: `dev` (không phải `main`) — code + tracking entry #156 chỉ tồn tại trên `dev`.
- Không sửa `buildSwap2State()` dùng chung, chỉ set field trên object trả về tại 1 call site.
- Không đụng nhánh `play` (đã đúng, đã emit `game:undo_applied`) hay `declineUndo` (đã đúng).
- 2 test mới trong `server/tests/GameHandler.test.js` (mock `engine.acceptUndo`, không cần dựng lại
  `GameEngine` thật): (1) accept undo pha opening → `game:swap2_state` mang `undoCancelled: true`;
  (2) accept undo pha play không đổi hành vi (vẫn `game:undo_applied`, không emit `swap2_state`).
- Không đụng file nào trong `client/js/`/`client/css/` ⇒ **không cần** bump `?v=N`.

## Summary output

`npm test`: **1358/1358** xanh (bỏ fix ra thì test mới (1) fail — đã kiểm chứng bằng cách tạm revert
dòng `swap2State.undoCancelled = true` và chạy lại, `undoCancelled` khi đó là `undefined`, đúng như
mô tả bug gốc). `fix/swap2-opening-undo-popup-not-cleared` off `dev`.
