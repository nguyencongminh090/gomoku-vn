# B94 — OAuth duplicate-account race: thiếu `UNIQUE(oauth_provider, oauth_id)`

Hướng dẫn thực thi cho TODO.md #94. Đã làm theo yêu cầu trực tiếp của người dùng ("Do #94",
2026-08-09) — xem [docs/todo/B94-oauth-duplicate-account-race-missing-unique-constraint.md](../todo/B94-oauth-duplicate-account-race-missing-unique-constraint.md)
để biết tóm tắt thực thi + kết quả test.

## Cách tiếp cận khi làm

- **Đổi `idx_users_oauth` sang `UNIQUE INDEX`** trong `schema.sql`. `NULL <> NULL` theo SQL chuẩn
  (SQLite tuân theo) nên các dòng password-account (2 cột đều `NULL`) không bị unique index này
  chặn lẫn nhau — không cần điều kiện `WHERE oauth_provider IS NOT NULL` kiểu partial index, dù
  SQLite hỗ trợ partial index nếu muốn tường minh hơn.
- **Migration cho DB đã tồn tại** (theo đúng khuôn mẫu `PRAGMA table_info` + `ALTER TABLE` đã dùng
  cho `tournament_pairings.games`/`tournaments.cancelled_at`/`users.oauth_provider` chính nó):
  - Trước khi `CREATE UNIQUE INDEX`, phải xử lý dữ liệu trùng đã lỡ tồn tại (nếu race này đã từng
    trúng ở production) — `CREATE UNIQUE INDEX` sẽ throw ngay nếu có dòng trùng, làm server không
    boot được. Cần 1 bước dọn dữ liệu (ví dụ: giữ dòng `created_at` sớm nhất theo mỗi cặp
    `(oauth_provider, oauth_id)`, các dòng còn lại — SAU KHI xác nhận với người dùng, vì đây là xoá
    dữ liệu người dùng thật) trước khi tạo index.
  - `DROP INDEX IF EXISTS idx_users_oauth` rồi `CREATE UNIQUE INDEX idx_users_oauth ...` — không
    sửa index cũ tại chỗ, SQLite không có `ALTER INDEX`.
- **Bắt lỗi constraint ở `routes/auth.js`'s `GET /google/callback`**: `db.createUser()` (better-
  sqlite3) sẽ throw đồng bộ khi đụng unique index — bọc riêng lệnh gọi này (không phải để rơi xuống
  `catch` ngoài cùng của route), kiểm tra `err.code === 'SQLITE_CONSTRAINT_UNIQUE'` (hoặc
  `err.message.includes('idx_users_oauth')` nếu bản better-sqlite3 đang dùng không phân biệt được
  loại constraint), rồi gọi lại `db.getUserByOAuthId('google', payload.sub)` để lấy đúng dòng mà
  request kia vừa tạo — tiếp tục luồng `startSession()` bình thường với dòng đó thay vì
  redirect `error=oauth_failed`. Đây là phần SỬA THẬT của race, không phải chỉ chặn ở DB — chặn ở DB
  mà không xử lý lỗi ở code thì request thua cuộc trong race vẫn bị lỗi (dù không mất dữ liệu).
- **Viết test race thật, không mock `../db/database`** — test hiện có
  (`server/tests/auth-google-oauth.test.js`) mock nguyên khối `db`, không thể phát hiện lỗi tầng
  SQLite này. Cần 1 test riêng dùng SQLite thật (in-memory hoặc file tạm, theo khuôn mẫu
  `server/tests/save-game.test.js`'s cách setup DB thật nếu có) gọi `createUser()` 2 lần với cùng
  `(oauthProvider, oauthId)` liên tiếp và xác nhận lần 2 throw đúng loại lỗi constraint — không cần
  mô phỏng race thật (khó test đáng tin cậy), chỉ cần xác nhận unique index THỰC SỰ chặn được.

## Phạm vi KHÔNG làm

- Không đổi cách sinh `username` cho tài khoản OAuth (`generateOAuthUsername`) — không có race ở
  đây vì toàn bộ vòng lặp check-rồi-chọn là đồng bộ (không có `await` bên trong), và `username` đã
  có `UNIQUE NOT NULL` riêng từ trước.
- Không tự động liên kết tài khoản Google với tài khoản username/password cùng email — ngoài phạm
  vi finding này, đã có quyết định riêng ở B91 (xem "Phạm vi KHÔNG làm" của B91).
- Không tự ý dọn dữ liệu trùng đã tồn tại trong `gomoku.db` thật mà không hỏi người dùng trước —
  đây là dữ liệu tài khoản thật, không phải dữ liệu test.

## Lưu ý phụ (không phải bug riêng, đã cân nhắc và chấp nhận từ lúc làm B91)

Trong lúc review, cũng đã xem lại `googleCallbackUrl(req)` (tính `redirect_uri` từ
`req.protocol`/`req.get('host')` của chính request, không phải giá trị cố định) dưới góc độ Host
header injection: nếu 1 request chạm thẳng tới server (không qua Cloudflare Tunnel) với `Host` header
tuỳ ý, hàm này sẽ tính ra 1 `redirect_uri` theo đúng header đó. Đã xác nhận đây KHÔNG phải finding
mới — đã được cân nhắc và chấp nhận có chủ đích lúc làm B91 (xem
[docs/instruction/B91-google-oauth-login.md](B91-google-oauth-login.md) mục "Đa origin"): giá trị
`redirect_uri` cuối cùng có được Google CHẤP NHẬN hay không hoàn toàn do allowlist "Authorized
redirect URIs" phía Google Cloud Console quyết định — 1 `Host` header giả mạo trỏ tới domain chưa
đăng ký sẽ chỉ nhận `redirect_uri_mismatch` từ Google, không tạo được phiên đăng nhập nào. Ghi lại ở
đây để lần review sau không cần điều tra lại từ đầu.

Xem tóm tắt + đánh giá hiệu quả/an toàn: [docs/todo/B94-oauth-duplicate-account-race-missing-unique-constraint.md](../todo/B94-oauth-duplicate-account-race-missing-unique-constraint.md).
