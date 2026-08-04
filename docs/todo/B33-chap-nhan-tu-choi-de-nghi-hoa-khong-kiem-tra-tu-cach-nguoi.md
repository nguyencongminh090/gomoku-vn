# Phần B #33. Chấp nhận/từ chối đề nghị hoà không kiểm tra tư cách người chơi

**Nguồn:** security review toàn bộ codebase — recheck (2026-08-03)


33. ~~**Chấp nhận/từ chối đề nghị hoà không kiểm tra tư cách người chơi**~~
    **✅ ĐÃ XONG (2026-08-04)** — thêm đúng kiểm tra
    `const player = this.players.find(p => p.userId === userId); if (!player) return { error: 'Bạn không phải người chơi.' };`
    vào đầu `acceptDraw()` và `declineDraw()` (`server/managers/GameEngine.js`),
    copy nguyên pattern có sẵn từ `resign()`/`offerDraw()` trong cùng file,
    đúng như `instruction.md` §B33. Không đụng tầng handler
    (`GameHandler.js`) — kiểm tra đặt ở `GameEngine` để bảo vệ mọi lối gọi
    tương lai, không chỉ lối gọi qua socket hiện tại.
    Test: +2 case trong `GameEngine.test.js` (describe "Draw offer") — khán
    giả (`userId` không nằm trong `players`) gọi `acceptDraw`/`declineDraw`
    khi có `drawOffer` đang chờ, assert bị từ chối đúng thông báo
    `'Bạn không phải người chơi.'` và trạng thái ván/`drawOffer` không đổi.
    Mutation-check: revert riêng `GameEngine.js` → cả 2 case đỏ đúng dự kiến
    → khôi phục → xanh lại. `npm test`: 361/361 xanh (+2 case). Chi tiết:
    `docs/fix-log.md`.
