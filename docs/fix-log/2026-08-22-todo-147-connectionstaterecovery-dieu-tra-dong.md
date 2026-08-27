# Fix log entry — 2026-08-22 21:27

## Prompt

Người dùng: "Do #147" (sau #145 đã merge và #146 đã đóng).

## Action

`docs/instruction/B147-*.md` mở đầu bằng "Dừng và hỏi người dùng trước khi viết code" và liệt kê 3
vùng nguy hiểm, trong đó vùng số 1 là một **câu hỏi thực nghiệm** phải trả lời bằng cách đọc
`node_modules` thật, "KHÔNG suy từ tài liệu". Nên thứ tự làm là: điều tra trước (việc không cần hỏi),
rồi mới đưa checkpoint cho người dùng với số liệu thật trong tay — thay vì hỏi khi chưa có gì.

Đọc `node_modules/socket.io/dist/{index,namespace,socket}.js` và
`node_modules/socket.io-client/build/cjs/socket.js` (socket.io 4.8.3). Bốn phát hiện:

1. **`skipMiddlewares` mặc định là `true`** (`index.js:106-111`), và `namespace.js:214-219` khi
   `skipMiddlewares && socket.recovered` thì gọi thẳng `_doConnect()`, **bỏ qua `this.run()`** — tức
   bỏ qua toàn bộ `io.use()`. `socket.js:96-107` cho thấy socket phục hồi chỉ khôi phục
   `id`/`pid`/`rooms`/`data`/`missedPackets` — **không** có `socket.user`/`socket.sessionId` (thuộc
   tính riêng do `verifySocketToken` gán). ⇒ bật "trần" thì `io.on('connection')` gọi
   `user.displayName` trên `undefined` = **TypeError trên mọi kết nối phục hồi**, cộng thêm session
   đã thu hồi sống lại (phá #68). Không phải suy đoán — hệ quả trực tiếp của 3 đoạn code.

2. **`auth.reconnect` CÓ sống sót** qua đường phục hồi — `socket.io-client/socket.js:443-444` dùng
   `Object.assign({pid, offset}, data)` với `data` là `auth` của user, và `socket.js:121`
   `buildHandshake(auth)` chạy ở cả hai nhánh. ⇒ với `skipMiddlewares: false`, logic `isOwnReconnect`
   chống "đăng nhập ở thiết bị khác" giả vẫn đúng. Đây là câu trả lời cho câu hỏi mà instruction bắt
   phải trả lời trước — và câu trả lời là **an toàn**, tức mục này *làm được*.

3. **Nhưng lợi ích gần như bằng 0.** `SocketHandler.js` nhánh `existingRoom` đã re-gửi **toàn bộ**
   state mỗi lần reconnect: `serializeRoom()` + `gameState.serialize()` + `timer.getTimers()` +
   `timerSync`, cộng 3 `cancel*Grace` và Viewer-reconnect-không-giới-hạn (#115). Đối chiếu 3 thứ
   socket.io thêm vào: tự join lại room (app đã có), replay gói tin bị lỡ (**thừa** — `room:joined`
   đè lên sau), giữ nguyên `socket.id` (không cần — `sessions` khoá theo `userId`). Thứ tự còn bất
   lợi: `missedPackets` bắn trong constructor, tức **trước** `room:joined`, nên với event không
   idempotent (`game:ended`, `room:destroyed`) là phát lại một modal đã cũ.

4. **Lợi ích thật duy nhất: chat bị lỡ.** `ChatHandler.js` không lưu lịch sử (grep xác nhận), và
   `serializeRoom()` không trả về chat ⇒ tin nhắn gửi lúc ai đó rớt mạng là mất hẳn với người đó.

Đưa 3 phương án cho người dùng qua `AskUserQuestion` kèm bảng đối chiếu.

## Decision

Người dùng chốt **đóng #147, không làm**. Lý do: dùng một cơ chế chạm vào auth middleware, single-
device eviction và 3 grace period để giải quyết một vấn đề nằm gọn trong `ChatHandler` là không cân
xứng.

Tách khoảng trống chat thành **#150** (mục mới, chưa làm) — theo rule "stack, don't perform directly"
của `CLAUDE.md`: đây là việc *mới* phát hiện, không nằm trong phạm vi "Do #147", nên được **ghi lại**
chứ không thực hiện. `docs/todo/B150-*.md` + `docs/instruction/B150-*.md` ghi rõ 2 điều: phải hỏi
người dùng xem có đáng làm không (không ai báo cáo triệu chứng này), và ràng buộc quyền riêng tư —
`room:joined` phục vụ cả người quay lại lẫn người vào lần đầu, nhét buffer vô điều kiện là cho người
lạ đọc chat trước khi họ vào phòng.

**Tự đính chính trong `docs/todo/B147-*.md`:** dòng "mỗi lần rớt transport … **mất hẳn event xảy ra
trong lúc rớt**" mà chính tôi viết lúc tạo mục #147 là **quá rộng** — chỉ chat mất; room, game và
timer đều được `room:joined` dựng lại đầy đủ. Tôi viết dòng đó khi chưa đọc kỹ nhánh `existingRoom`.
Giữ nguyên văn bản gốc (không sửa lịch sử), đính chính ở phần điều tra bên dưới nó.

## Summary output

Không có thay đổi code nào — cả `server/` lẫn `client/`. `git diff --stat` chỉ liệt kê `TODO.md`,
`instruction.md`, `docs/`. Không chạy lại `npm test` vì không có file runtime nào bị đổi (lần chạy
gần nhất, ở lượt #146: 1245/1245).

`docs/todo/B147-*.md` cập nhật ✅ Đã đóng + thêm mục "Điều tra 2026-08-22" (~90 dòng bằng chứng, có
trích code và số dòng cụ thể để người đọc sau kiểm chứng lại được mà không phải đọc lại `node_modules`).
`TODO.md` #147 → ✅, thêm dòng index #150. `instruction.md` thêm dòng B150.

Commit thẳng trên `dev` — tracking-doc-only, không cần nhánh `fix/*` (`git-workflow`: "Doc-only
changes … can go straight to `main`", và mục #147 chỉ tồn tại trên `dev`).
