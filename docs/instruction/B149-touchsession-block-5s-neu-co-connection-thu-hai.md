# B149 — Địa lôi WAL-busy 5s, không sửa bây giờ

## Không "sửa cho có"

Đây là số đo biên trên của một kịch bản **không reachable** trong kiến trúc 1-connection hiện tại
(`grep -rn "new Database(" server/` xác nhận đúng 1 chỗ). Đừng thêm `busy_timeout` thấp hơn, retry
logic, hay connection pool "để an toàn" — không có gì đang bị đe doạ để bảo vệ, và mỗi lớp phòng thủ
thêm vào là một chỗ có thể sai mà không ai test được (không dựng nổi kịch bản kích hoạt thật).

## Khi nào quay lại mục này

**Chỉ** khi một thay đổi khác trong tương lai thêm connection thứ hai tới `server/db/gomoku.db`
(worker thread, script phụ chạy song song với server thật, tiến trình migrate). Nếu đọc tới đây vì
lý do đó: đọc lại phần đo trong `docs/todo/B149-*.md` trước, đừng đo lại từ đầu — con số 5000 ms /
100% throw đã có sẵn.

## Đừng đụng

- **`db.pragma('journal_mode = WAL')` / không có `busy_timeout` tường minh trong `database.js`**:
  giữ nguyên. Đổi journal mode hay busy_timeout mà không có lý do reachable là thay đổi hành vi DB
  production dựa trên một kịch bản giả định.
- **Không viết test cho kịch bản này.** Test cho một bug không reachable trong kiến trúc hiện tại là
  test giả — nó pass mãi mãi và không bảo vệ gì cả. Nếu kịch bản trở thành reachable (có connection
  thứ hai thật), việc thêm connection đó tự nó phải kèm test, và đó là lúc viết test cho tình huống
  này.
