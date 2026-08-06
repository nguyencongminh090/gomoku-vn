### Nguồn: báo cáo người dùng — "đăng nhập thiết bị khác" đá nhầm dù chỉ mở 1 tab (2026-08-06)

## #51. Quy tắc bump `?v=N` trong CLAUDE.md bỏ sót cross-module import, khiến `tournaments.js` load `lobby.js` 2 lần

**Trạng thái:** ✅ Đã sửa (xem `docs/fix-log/2026-08-06-tournaments-lobby-duplicate-module-import.md`).

**Vấn đề:** Quy tắc "Cache-busting version bump" (CLAUDE.md) chỉ liệt kê: mọi file HTML +
import statement bên trong các file `*-entry.js`. Nhưng `client/js/tournaments.js`
(không phải entry file) tự import trực tiếp `./lobby.js?v=N` để tái dùng instance
`client` (socket connection) đã có — một cross-module import nằm ngoài phạm vi quy
tắc liệt kê. Hệ quả: một đợt bump hợp lệ, đúng quy trình (chạm mọi file HTML + mọi
`*-entry.js`) vẫn để sót `tournaments.js`, để nó kẹt ở `?v=63` trong khi phần còn
lại đã lên `?v=64`. ES module resolve theo full specifier (kể cả query string) nên
`lobby.js?v=63` và `lobby.js?v=64` là 2 module instance riêng biệt trên trình
duyệt — `export const client = new SocketClient()` ở top-level của `lobby.js` chạy
2 lần, mở 2 kết nối socket.io thật cho cùng 1 người dùng chỉ từ 1 tab. Server
đúng logic (nhưng sai bối cảnh) coi đó là "tài khoản vừa đăng nhập máy khác" và
đá 1 trong 2 kết nối.

**Không phải lần đầu:** cùng lỗi y hệt đã xảy ra ở `?v=61` trước đó, được vá ở
đợt bump `?v=61→62`, rồi tái diễn ở `?v=63→64` — chứng minh việc chỉ note "nhớ
bump" trong text không đủ, cần một lệnh kiểm tra thực thi được để xác nhận bump
đã đầy đủ, không dựa vào con người nhớ đúng danh sách file mỗi lần.

**Giải pháp đã áp dụng:**
1. Sửa `?v=63` → `?v=65` trong `client/js/tournaments.js`, đồng thời bump toàn bộ
   site-wide `?v=64→65` theo đúng quy tắc (không sửa lệch một mình file này).
2. Sửa CLAUDE.md — mở rộng phạm vi quy tắc từ "*-entry.js only" thành "mọi file
   `client/js/*.js`", và đổi lệnh kiểm tra ở cuối mục từ
   `grep -rn "?v=" client/*.html client/js/*-entry.js` (chỉ soi entry file — chính
   lệnh này cũng bị chừa lỗ hổng y hệt quy tắc) thành
   `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup`, kèm yêu cầu rõ
   ràng: kết quả phải chỉ có đúng 1 giá trị `?v=N` duy nhất, nếu không thì bump
   chưa xong.

**Đánh giá hiệu quả/an toàn:** Rủi ro sửa thấp — chỉ đổi số version trong query
string, không đổi logic. Lệnh kiểm tra mới đã chạy thử trên `dev` sau khi sửa,
xác nhận trả về đúng 1 giá trị (`?v=65`), loại trừ đúng 2 file mockup cố ý đứng
yên ở version cũ theo comment sẵn có trong chính các file đó.

**Trạng thái test:** Không có test infra phía client cho lớp lỗi này (thuần
browser ES-module resolution, `client/js/` hiện chưa có Jest/coverage — nêu rõ
theo rule "Bug-fix workflow" thay vì bỏ qua âm thầm). `npm test` (server-side):
809/809 xanh, không hồi quy — bug này không chạm server logic.

**Audit toàn bộ nhánh (theo yêu cầu người dùng "fix đồng loạt trên các nhánh"):**
Kiểm tra `?v=` trên tất cả nhánh còn tồn tại (local: `main`, `dev`,
`feature/tournament-detail-mockup`; remote: `origin/feature/tables-tournaments-mockup`,
`origin/feature/tournament-client`, `origin/feature/tournament-server`) bằng
`git show <branch>:<file> | grep -oE '\?v=[0-9]+'` cho từng file client — kết quả:
- `main`: không có file tournament (`tournaments.js` chưa merge vào `main`) → không
  bị ảnh hưởng bởi lớp lỗi này.
- `dev`: đã sửa, nhất quán `?v=65` (trừ 2 mockup cố ý đứng yên `?v=61`).
- 4 nhánh còn lại (`feature/tournament-detail-mockup` và 3 nhánh remote) đều đã
  là ancestor của `dev` (`git merge-base --is-ancestor <branch> dev` → true) —
  tức đã merge xong, là lịch sử tĩnh, không phải nhánh sống cần sửa riêng.
Kết luận: không còn nhánh sống nào khác mang lỗi này ngoài `dev` (đã sửa).
