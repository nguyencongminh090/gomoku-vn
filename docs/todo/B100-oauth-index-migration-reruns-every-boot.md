# #100 — Migration `idx_users_oauth` chạy lại toàn bộ dò-trùng + rebuild mỗi lần khởi động

**Trạng thái:** chưa làm

Phát hiện qua `/code-review` (8 agent song song) trên nhánh `feature/oauth-login` trước khi merge
vào `dev`, theo yêu cầu người dùng "Review OAuth feature safe to merge to dev" (2026-08-10).

## Vấn đề

Các migration khác trong `server/db/database.js` (dòng 39-43, 48-53, 58-61, 66-71) đều tự gate bằng
`if (!columns.includes('x'))` — chỉ chạy `ALTER TABLE` lần đầu tiên mở 1 DB chưa migrate, sau đó chỉ
còn 1 lệnh `PRAGMA` rẻ tiền mỗi lần khởi động. Khối `idx_users_oauth` (dòng 89-104, thêm ở #94) không
theo khuôn mẫu đó: chạy `SELECT ... GROUP BY oauth_provider, oauth_id HAVING COUNT(*) > 1` quét toàn
bảng `users`, rồi luôn `DROP INDEX IF EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` — **mỗi lần server
khởi động, vĩnh viễn**, kể cả khi index đã là `UNIQUE` và không có gì thay đổi từ lần trước.

## Hậu quả

- Không phải bug đúng nghĩa — hành vi "tự dò lại mỗi lần boot" là chủ đích (self-healing, đã ghi trong
  `docs/todo/B94-*.md`: "Chạy lại mỗi lần khởi động nên tự 'chữa lành' sau khi người dùng dọn dữ liệu
  trùng xong"). Vấn đề là chi phí: DB `users` càng lớn, mỗi lần restart càng tốn 1 lượt quét + rebuild
  index không cần thiết khi đã ở trạng thái ổn định.
- Không nhất quán về khuôn mẫu: 1 khối migration khác kiểu so với 4 khối liền kề, dễ bị copy làm mẫu
  cho migration tiếp theo (lan truyền hành vi "chạy mãi mãi" thay vì "chạy 1 lần").

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** thấp — DB hiện tại còn nhỏ, chi phí không đáng kể ở quy mô hiện tại; đáng sửa trước khi
  bảng `users` lớn hơn nhiều.
- **Fix dự kiến khi làm:** kiểm tra `PRAGMA index_list('users')` (hoặc `PRAGMA index_xinfo`) xem
  `idx_users_oauth` đã tồn tại VÀ đã `unique = 1` chưa — chỉ chạy `GROUP BY` dò trùng + drop/recreate
  khi index đang thiếu hoặc chưa phải unique, giống hệt guard `!userColumns.includes(...)` ngay phía
  trên. Giữ nguyên hành vi self-healing (vẫn tự nâng cấp được sau khi người dùng dọn dữ liệu trùng),
  chỉ bỏ phần quét lại vô ích khi đã ở trạng thái đích.

Chi tiết hướng làm: [docs/instruction/B100-oauth-index-migration-reruns-every-boot.md](../instruction/B100-oauth-index-migration-reruns-every-boot.md).
