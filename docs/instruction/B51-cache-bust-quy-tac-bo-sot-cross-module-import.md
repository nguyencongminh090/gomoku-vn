## B51. Quy tắc cache-bust bỏ sót cross-module import (TODO.md #51)

**Bài học chính — đừng chỉ note "nhớ làm X" khi lỗi đã lặp lại.** Đây là lần
thứ 2 cùng một lỗi xảy ra (`?v=61` rồi `?v=63`) dù quy tắc đã tồn tại từ trước.
Lý do quy tắc cũ không đủ: nó liệt kê một danh sách file cụ thể ("*-entry.js")
thay vì mô tả *bất biến cần giữ đúng* ("mọi `?v=N` trong `client/` phải bằng
nhau"), và lệnh kiểm tra đi kèm cũng chỉ soi đúng tập file đó — nên khi có một
cross-import mới xuất hiện ngoài danh sách, cả quy tắc lẫn công cụ kiểm tra
đều mù trước nó cùng lúc.

**Cách làm đúng khi sửa lớp lỗi "quy tắc bị bỏ sót" như thế này:**
- Đừng chỉ vá đúng chỗ hỏng cụ thể (sửa `tournaments.js`) — sửa luôn *định
  nghĩa phạm vi* trong CLAUDE.md để không phụ thuộc liệt kê tên file thủ công.
- Đưa ra được một lệnh kiểm tra tự chạy, có thể verify "đã làm đúng chưa" mà
  không cần đọc từng file — ở đây là assert `grep` output chỉ có 1 giá trị.
  Không có lệnh này thì mỗi lần bump sau vẫn có thể lặp lại y hệt.

**Không cần sửa gì khác ngoài phạm vi này** — không đổi cơ chế cache-busting
(vẫn dùng query string `?v=N`, không chuyển sang content-hash hay build step
mới) vì đó là thay đổi kiến trúc lớn hơn nhiều so với những gì báo cáo yêu
cầu; chỉ mở rộng *phạm vi áp dụng* của quy tắc đã có.

**Về audit nhánh:** khi user yêu cầu "fix đồng loạt trên các nhánh", việc đầu
tiên là xác định nhánh nào còn *sống* (chưa merge vào đâu, còn tiếp tục phát
triển riêng) trước khi sửa lặp lại trên từng nhánh — dùng
`git merge-base --is-ancestor <branch> <target>` để phân biệt "nhánh đã merge,
là lịch sử tĩnh" (không cần đụng vào) với "nhánh độc lập đang sống" (cần sửa
riêng, vì merge sau này sẽ mang lỗi cũ trở lại). Trong đợt này, mọi
`feature/*` branch đều đã là ancestor của `dev` — nên chỉ cần sửa đúng 1 chỗ.
