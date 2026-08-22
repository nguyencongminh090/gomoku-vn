# B146 — Đẩy `touchSession()` ra khỏi đường tới hạn của handshake

## Đo trước, đừng tin #81

**#81 đã đóng** với kết luận "session-lookup không phải bottleneck, p50/p99 đơn vị-chục µs". Bench
đó (`bench-session-lookup.js`) đo **đường đọc**. Mục này nói về **lệnh ghi**. Trước khi sửa, mở rộng
bench đó để đo `db.touchSession(...)` riêng, gồm cả trường hợp WAL đang bận (đồng thời có lệnh ghi
khác) — không chỉ đo lúc DB rỗi.

Nếu đo ra thật sự là µs kể cả khi tranh chấp, thì **đóng mục này như một tradeoff đã đo**, đúng cách
#81 đã làm — đừng sửa cho có. Ghi số đo vào `docs/todo/B146-*.md`.

## Chọn hướng: mặc định là hướng 1

- **Hướng 1 — gọi sau `next()` / `setImmediate`.** Giữ nguyên ngữ nghĩa `last_seen`, thay đổi tối
  thiểu. Đây là mặc định.
- **Hướng 2 — chỉ ghi khi `last_seen` cũ hơn N phút.** Chỉ chọn nếu bench chứng minh **tần suất** ghi
  mới là vấn đề, không phải độ trễ một lệnh. Hướng này **đổi ngữ nghĩa của cột** ⇒ phải kiểm ai đang
  đọc `last_seen` trước khi đổi (grep, đừng đoán), và phải hỏi người dùng vì nó ảnh hưởng dữ liệu
  quan sát được, không chỉ hiệu năng.

Đừng gộp cả hai. Đừng "tiện tay" làm hướng 2 khi đang làm hướng 1 — đúng cái mà rule "Base the fix
strictly on what was provided" trong `CLAUDE.md` cấm.

## Bẫy: `setImmediate` không được nuốt lỗi đi chỗ khác

`touchSession()` hiện đã có `try/catch` + `logger.warn` bên trong với lý do rõ ràng ("một lệnh ghi
bookkeeping hỏng không được làm vỡ một phiên hợp lệ"). Khi chuyển nó ra ngoài đường tới hạn, **giữ
nguyên lớp bảo vệ đó** — một exception ném ra từ trong callback `setImmediate` **không** bị
`try/catch` ở call site bắt, và sẽ rơi thẳng xuống `process.on('uncaughtException')` ở
`server/index.js`. Tức là bỏ `try/catch` đi thì lỗi vẫn "không làm vỡ gì" nhưng theo cách tệ hơn
nhiều.

## Đừng đụng

- **Thứ tự kiểm tra trong `verifySocketToken`**: `isAllowedOrigin` → cookie → (nếu cookie chết thì
  **KHÔNG** rơi xuống legacy JWT). Cái nhánh "không fall through" đó là chống hồi sinh session đã bị
  thu hồi, có comment giải thích tại chỗ. Chỉ di chuyển **một** lệnh ghi bookkeeping, không sắp xếp
  lại logic auth.
- **`getValidSession()`**: giữ nguyên trên đường tới hạn. Nó **phải** chạy trước `next()` — đó là
  kiểm tra xác thực thật, không phải bookkeeping.
- **Không** đổi `verifyToken` (bản Express) trong cùng lần sửa — nó đang mount trên 0 route và có
  cảnh báo CSRF riêng ở đầu file. Ngoài phạm vi.

## Test (bắt buộc — `server/tests/` có hạ tầng thật)

Tối thiểu:

- Handshake hợp lệ ⇒ `next()` được gọi **trước** khi `db.touchSession` được gọi (chứng minh đúng
  cái tính chất mục này cần, không chỉ "vẫn chạy").
- `db.touchSession` **vẫn** được gọi (đừng vô tình xoá hẳn bookkeeping — đó sẽ là "sửa" bằng cách
  bỏ tính năng).
- `db.touchSession` ném lỗi ⇒ kết nối **vẫn** thành công, không có `uncaughtException`.
- Cookie chết / không cookie / origin sai ⇒ hành vi không đổi so với trước (guard hồi quy cho phần
  auth mà mục này đi ngang qua).

Kiểm chứng test không rỗng: bỏ bản sửa ra thì test thứ nhất phải fail.
