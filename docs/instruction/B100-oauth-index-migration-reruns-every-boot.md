# B100 — Migration `idx_users_oauth` chạy lại toàn bộ dò-trùng + rebuild mỗi lần khởi động

Hướng dẫn thực thi cho TODO.md #100 (chưa làm — chỉ ghi lại khi phát hiện qua `/code-review`).

## Cách tiếp cận khi làm

- **Thêm guard `PRAGMA index_list('users')` trước khối dò-trùng** ở `server/db/database.js:89-104` —
  kiểm tra `idx_users_oauth` đã tồn tại VÀ cột `unique` trong kết quả `PRAGMA` là `1` chưa; chỉ chạy
  `GROUP BY ... HAVING COUNT(*) > 1` + `DROP INDEX`/`CREATE UNIQUE INDEX` khi thiếu điều kiện đó, theo
  đúng khuôn mẫu `if (!userColumns.includes(...))` ở khối ngay phía trên.
- **Giữ nguyên hành vi self-healing đã có** (tự nâng cấp lên UNIQUE ở lần boot kế tiếp sau khi người
  dùng dọn dữ liệu trùng) — guard mới chỉ bỏ qua khi ĐÃ Ở trạng thái đích (`unique = 1`), không được
  bỏ qua khi index còn là thường hoặc chưa tồn tại.
- **Cập nhật test `server/tests/oauth-unique-constraint.test.js`** (đã có từ #94) thêm case: DB đã có
  index `UNIQUE` sẵn từ trước, khởi động lại KHÔNG chạy `GROUP BY` (có thể spy/mock `db.prepare` để
  đếm số lần gọi, hoặc đơn giản hơn: xác nhận không có side-effect nào khác ngoài `PRAGMA` — tuỳ cách
  đo khả thi nhất khi thực sự làm).

## Phạm vi KHÔNG làm

- Không đổi logic dò-trùng/migration khi index CHƯA đạt trạng thái đích — chỉ thêm early-exit khi đã
  đạt.
- Không đổi hành vi "không tự xoá dữ liệu trùng thật" đã quyết định ở #94.

Xem báo cáo gốc: [docs/todo/B100-oauth-index-migration-reruns-every-boot.md](../todo/B100-oauth-index-migration-reruns-every-boot.md), và fix gốc tạo ra migration này: [docs/instruction/B94-oauth-duplicate-account-race-missing-unique-constraint.md](B94-oauth-duplicate-account-race-missing-unique-constraint.md).
