# #149 — Nếu `gomoku.db` từng có connection thứ hai, `touchSession()` sẽ block **5 giây/lần** rồi ném lỗi

**Trạng thái:** chưa làm. **Không cấp bách** — kịch bản kích hoạt hiện **không tồn tại** trong kiến
trúc hiện tại. Ghi lại làm địa lôi cho tương lai, theo rule "call those out separately" của
`CLAUDE.md` khi xử lý #146.

**Nguồn:** phát hiện khi đo bench cho #146 (2026-08-22) — `server/scripts/bench-session-lookup.js`,
phần "touchSession() with a concurrent writer holding the WAL write lock".

## Số đo

`db.pragma('busy_timeout')` mặc định của better-sqlite3 là **5000 ms**. Khi một connection thứ hai
mở cùng file `gomoku.db` và giữ khoá ghi (`BEGIN IMMEDIATE`, chưa commit), 20 lệnh `touch.run()` liên
tiếp trên connection chính: **cả 20 lệnh đều block đúng ~5006–5007 ms rồi ném `SQLITE_BUSY`**. Tổng
100 124 ms cho 20 lệnh — tức nếu điều này xảy ra thật ở handshake, mỗi kết nối phải chờ 5 giây rồi
vẫn thất bại.

## Vì sao đây KHÔNG phải bug cần sửa hôm nay

Grep xác nhận: `server/db/database.js:25` là **connection SQLite duy nhất** trong toàn bộ code
production (`grep -rn "new Database(" server/` chỉ ra đúng 1 chỗ ngoài `tests/`/`scripts/`). Comment
đầu file `database.js` nói thẳng: *"Uses better-sqlite3 (synchronous API) — intentional for
simplicity... All writes to DB happen ONLY when a game ends"*. Không có worker thread, không có
process thứ hai nào mở file này. Kịch bản "một connection khác giữ khoá ghi" **không reachable**
trong kiến trúc hiện tại — đây là số đo biên trên (worst-case bound), không phải triệu chứng.

`touchSession()` đã có `try/catch` + `logger.warn` bao ngoài (xem `SessionManager.js`), nên nếu kịch
bản này từng xảy ra thật, nó **không** làm crash server — nhưng nó **chặn event loop 5 giây/lần**,
tức chặn *mọi* kết nối khác đang chờ xử lý trong 5 giây đó, không riêng gì kết nối gây ra nó.

## Khi nào mục này trở nên đáng làm

Chỉ khi có ai đó thêm **một connection thứ hai** tới `gomoku.db` — ví dụ một worker thread tách
riêng, một tiến trình phụ, hoặc một script chạy song song với server thật mà quên là nó dùng chung
file DB. Nếu điều đó xảy ra, việc cần làm là hạ `busy_timeout` xuống một giá trị nhỏ (vài trăm ms)
kèm retry có kiểm soát, hoặc loại bỏ hẳn nhu cầu có 2 connection — **không** phải sửa `touchSession`
riêng lẻ, vì đây là thuộc tính của kiến trúc 1-connection, không phải của một lệnh SQL cụ thể.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả nếu sửa bây giờ:** 0 — không có gì để sửa, kịch bản không reachable.
- **An toàn nếu bỏ qua:** an toàn, miễn không có PR nào trong tương lai âm thầm mở connection thứ
  hai tới `gomoku.db`. Đây chính là lý do mục này tồn tại — để người đọc tương lai (người hoặc model)
  kiểm tra lại đúng chỗ này trước khi làm vậy.
