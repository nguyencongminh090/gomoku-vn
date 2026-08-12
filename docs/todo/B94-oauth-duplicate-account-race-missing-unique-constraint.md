# #94 — Google OAuth: thiếu `UNIQUE` trên `(oauth_provider, oauth_id)` + race điều kiện tạo tài khoản trùng

**Trạng thái:** ✅ ĐÃ XONG

**Tóm tắt fix (2026-08-09):**
- `server/db/database.js`: `idx_users_oauth` nâng cấp thành `CREATE UNIQUE INDEX`. Trước khi tạo,
  migration tự kiểm tra `(oauth_provider, oauth_id)` trùng đã tồn tại (`GROUP BY ... HAVING COUNT(*)
  > 1`, bỏ qua `NULL`) — nếu có, GIỮ NGUYÊN index thường và `logger.error()` liệt kê cặp trùng để
  người dùng tự dọn (không tự ý xoá dữ liệu tài khoản thật), server vẫn boot bình thường; nếu không
  có trùng, `DROP INDEX IF EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`. Chạy lại mỗi lần khởi động
  nên tự "chữa lành" (self-healing) sau khi người dùng dọn dữ liệu trùng xong.
- `server/routes/auth.js`'s `GET /google/callback`: bọc riêng `db.createUser()` trong `try/catch`;
  bắt `err.code === 'SQLITE_CONSTRAINT_UNIQUE'` (hoặc `'SQLITE_CONSTRAINT'`) rồi gọi lại
  `db.getUserByOAuthId()` để lấy dòng bên thắng cuộc vừa tạo, tiếp tục luồng `startSession()` bình
  thường thay vì rơi xuống `error=oauth_failed`; lỗi khác loại (không phải constraint) hoặc không
  tìm lại được dòng nào thì vẫn `throw` để rơi xuống catch ngoài cùng như cũ.
- `server/db/schema.sql`: cập nhật comment giải thích vì sao index được tạo ở `database.js` (không
  phải ở đây) giờ là `UNIQUE`.
- Test mới, dùng SQLite thật (không mock `../db/database`), theo khuôn mẫu `save-game.test.js`:
  `server/tests/oauth-unique-constraint.test.js` — DB mới tinh: index thực sự là `UNIQUE` ở tầng
  catalog, dòng thứ 2 cùng `(provider, id)` bị `SQLITE_CONSTRAINT_UNIQUE` chặn, oauth_id khác nhau
  không bị ảnh hưởng, 2 tài khoản password (`NULL, NULL`) không đụng nhau; DB đã có sẵn dữ liệu
  trùng: server boot không throw, index vẫn ở dạng thường (upgrade bị bỏ qua), cả 2 dòng trùng vẫn
  còn, `logger.error()` được gọi đúng nội dung, và sau khi dọn trùng thì lần khởi động kế tiếp tự
  nâng cấp lên `UNIQUE` (8 test).
- Test mới trong `server/tests/auth-google-oauth.test.js` (mock `../db/database` như cũ, xác nhận
  hành vi route): thua race (`SQLITE_CONSTRAINT_UNIQUE`) → đọc lại đúng dòng bên thắng, session vẫn
  khởi tạo thành công; thua race nhưng đọc lại không thấy dòng nào → vẫn `oauth_failed`; lỗi không
  phải constraint → vẫn `oauth_failed`, không bị nuốt lỗi âm thầm (3 test).
- **Kết quả:** toàn bộ suite `npm test` — 1015/1015 pass (bao gồm 11 test mới ở trên).
- **Không làm** (đúng "Phạm vi KHÔNG làm" ở dưới): không tự động dọn dữ liệu trùng trong
  `gomoku.db` thật — hiện tại `SELECT`/`GROUP BY` xác nhận DB thật hiện KHÔNG có dòng nào trùng
  `(oauth_provider, oauth_id)` (tính năng Google OAuth #91 còn quá mới, chưa từng bị trúng race),
  nên migration sẽ tự nâng cấp lên `UNIQUE INDEX` ngay ở lần khởi động kế tiếp mà không cần thao
  tác gì thêm.

Phát hiện khi review database design + security cho luồng Google OAuth (#91), theo yêu cầu người
dùng "Review Database Design for OAuth. Review Security with OAuth." (2026-08-09).

## Vấn đề

`schema.sql` chỉ tạo **index thường** trên `(oauth_provider, oauth_id)`, không phải `UNIQUE INDEX`:

```sql
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)  -- database.js:74
```

Không có gì ở tầng DB ngăn 2 dòng `users` cùng mang 1 cặp `(oauth_provider, oauth_id)`. Kết hợp với
`server/routes/auth.js`'s `GET /google/callback` (dòng 491-515), có 1 khoảng hở TOCTOU (check-then-act)
thật sự có thể trúng được trong Node's event loop, không cần đa luồng thật:

```js
let user = db.getUserByOAuthId('google', payload.sub);   // (1) check — sync
if (!user) {
  ...
  const passwordHash = await bcrypt.hash(...);            // (2) YIELD event loop ở đây (~vài trăm ms, cost 12)
  db.createUser({ ..., oauthProvider: 'google', oauthId: payload.sub }); // (3) act — sync, SAU await
  ...
}
```

Giữa bước (1) và (3) có 1 `await bcrypt.hash()` — nhường quyền điều khiển cho event loop. Nếu 2
request `GET /google/callback` cho **cùng 1 tài khoản Google chưa từng đăng nhập** chạm vào đoạn code
này gần như đồng thời (2 tab cùng hoàn tất consent screen, double-click nút "Đăng nhập với Google" mở
2 tab, hoặc bấm lại nhanh vì tưởng lần đầu không phản hồi), cả 2 request đều thấy `getUserByOAuthId`
trả `undefined` ở bước (1) TRƯỚC KHI request nào insert xong — cả 2 cùng đi tiếp, cùng `await
bcrypt.hash()`, rồi cùng gọi `createUser()` thành công (vì không có `UNIQUE` chặn) → **2 dòng `users`
khác `id` nhưng cùng `(oauth_provider='google', oauth_id=<cùng sub>)`**.

## Hậu quả

- `getUserByOAuthId()` (`SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?` — không có
  `ORDER BY`, không `LIMIT 1` rõ ràng dù `better-sqlite3`'s `.get()` chỉ lấy dòng đầu SQLite trả về)
  ở lần đăng nhập Google KẾ TIẾP sẽ trả về 1 trong 2 dòng theo thứ tự SQLite tình cờ chọn — không
  đảm bảo luôn là dòng cũ. Người dùng có thể "biến thành" 1 trong 2 `userId` khác nhau giữa các lần
  đăng nhập, tuỳ lần nào SQLite trả về trước.
- Lịch sử ván đấu (`games.black_player_id`/`white_player_id`, `player_games`) gắn theo `userId` —
  nếu 1 lần đăng nhập "rơi" vào dòng `users` còn lại, lịch sử ván đấu của dòng kia biến mất khỏi góc
  nhìn người dùng dù vẫn còn trong DB (không mất dữ liệu, nhưng trải nghiệm giống mất).
- Đây là lỗi tầng dữ liệu (data integrity), không phải account-takeover — không có đường nào để 1
  người dùng khác chiếm được tài khoản này qua lỗi này; rủi ro là chính chủ tự nhận nhầm định danh
  của chính mình.

Test hiện có (`server/tests/auth-google-oauth.test.js`) mock toàn bộ `../db/database` (bao gồm
`createUser`/`getUserByOAuthId` là `jest.fn()` trần) nên KHÔNG thể phát hiện lỗi này — race và ràng
buộc `UNIQUE` chỉ lộ ra khi chạy với SQLite thật.

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Mức độ:** trung bình — hậu quả (nhầm lẫn định danh) thực sự khó chịu cho người dùng nếu trúng
  phải, nhưng cần 2 request gần-đồng-thời cho CÙNG 1 tài khoản Google MỚI (chưa từng đăng nhập lần
  nào) mới trúng — tài khoản đã tồn tại (`getUserByOAuthId` tìm thấy ngay ở bước (1)) không bị ảnh
  hưởng, vì nhánh `if (!user)` không chạy.
- **Fix dự kiến khi làm:**
  1. Đổi `idx_users_oauth` thành `CREATE UNIQUE INDEX` trong `schema.sql` — chặn ở tầng DB. Cần cân
     nhắc: SQLite coi `NULL` là "khác nhau" trong `UNIQUE INDEX` theo chuẩn SQL, nên các dòng
     password-account (`oauth_provider`/`oauth_id` đều `NULL`) không bị chặn lẫn nhau — đúng ý muốn.
  2. Với DB đã tồn tại dữ liệu (migration cộng thêm trong `database.js`, theo đúng khuôn mẫu
     `PRAGMA table_info` + `ALTER TABLE`/`CREATE INDEX`): `ALTER TABLE` không đổi được index từ
     thường sang unique — cần `DROP INDEX` cũ rồi `CREATE UNIQUE INDEX`, và phải kiểm tra/dọn dữ
     liệu trùng đã lỡ tạo ra TRƯỚC KHI tạo unique index (nếu không sẽ throw ngay lúc migration chạy
     ở DB đã dính bug này).
  3. `server/routes/auth.js`'s `GET /google/callback` cần bắt riêng lỗi `SQLITE_CONSTRAINT` từ
     `createUser()` khi đụng unique index mới — thay vì rơi xuống `catch` ngoài cùng và redirect
     `error=oauth_failed` (làm mất tài khoản vừa Google vừa xác thực xong, dù không mất gì ở DB),
     nên `getUserByOAuthId()` LẠI 1 lần nữa và dùng dòng do request kia vừa tạo — coi như 1 dạng
     "insert, nếu đụng unique thì đọc lại" (giống upsert).

Chi tiết: [docs/instruction/B94-oauth-duplicate-account-race-missing-unique-constraint.md](../instruction/B94-oauth-duplicate-account-race-missing-unique-constraint.md).
