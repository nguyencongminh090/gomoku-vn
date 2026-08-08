# Phần B #72. Tab "Cài đặt" trong phòng (Paper/Stone + toàn bộ setting khác) không lưu được — bị CSP chặn onchange

**Nguồn:** báo cáo người dùng — "User cannot change Display (Paper/Stone) It auto get back." Xác
nhận qua tái hiện bằng Playwright thật (server tạm, DB tạm theo quy tắc trong `CLAUDE.md`), không
chỉ đọc code.

## Vấn đề đã xác nhận

`client/js/room-ui.js`'s `renderLocalSettingsControl()` / `renderSettings()` build lại toàn bộ tab
Cài đặt bằng `innerHTML`, và mọi input trong đó (radio hiển thị Paper/Stone, board size, luật thắng,
Wall/Portal, Swap2, timer mode, thời gian/timer increment — 18 chỗ tổng cộng, dòng 320-403) mang
attribute `onchange="updateLocalSettings()"` / `onchange="updateSettings()"` kiểu inline cũ.

CSP hiện tại (`server/config/csp.js`, thêm ở TODO.md #65 để hardening XSS) đặt
`scriptSrcAttr: ["'none'"]`, chặn **toàn bộ** inline event-handler attribute (`onchange=`, `onclick=`
trực tiếp trong HTML) — trình duyệt log CSP violation và không bao giờ gọi hàm. Phần còn lại của
app đã migrate sang pattern `data-action` + `client/js/action-delegate.js` (delegated `click`
listener) đúng vì lý do CSP này, nhưng riêng tab Cài đặt trong phòng chưa được migrate.

Hệ quả tái hiện được: click radio "Stone" → `checked` state đổi ngay (hành vi mặc định của trình
duyệt, không cần JS) → nhưng `updateLocalSettings()` không bao giờ chạy → `localStorage` +
`RoomState.boardDisplayMode` không đổi → lần `renderSettings()` kế tiếp (bất kỳ `room:updated` nào,
vd. đối thủ chat/vào phòng/đi quân) build lại HTML từ giá trị cũ → radio "bật lại về Paper" như
người dùng mô tả. Test xác nhận `updateSettings()` (board size, luật, timer...) bị chặn y hệt.

**Chỉ tồn tại trên `dev`, không phải `main`:** `main`'s `server/index.js` chạy
`helmet({ contentSecurityPolicy: false })` — CSP hoàn toàn tắt, nên inline `onchange=` vẫn chạy bình
thường trên `main`. `server/config/csp.js` là tính năng dev-only (TODO.md #65, chưa merge vào
`main`). Branch off `dev`, không phải `main`, theo đúng ngoại lệ "code chỉ tồn tại trên dev" trong
`CLAUDE.md`.

## Việc cần làm

- Migrate 18 chỗ `onchange="fn()"` trong `renderLocalSettingsControl()`/`renderSettings()`
  (`client/js/room-ui.js`) sang pattern delegation, tương tự `data-action` nhưng cho sự kiện
  `change` — không dùng chung attribute `data-action` với click-delegate vì click radio/checkbox
  bắn cả `click` lẫn `change`, dùng chung sẽ gọi hàm 2 lần.
- Mở rộng `client/js/action-delegate.js` thêm 1 delegated listener cho `change` đọc
  `data-change-action`.
- Bump `?v=N` theo `CLAUDE.md` vì đổi `client/js/*.js`.

## Trạng thái

✅ ĐÃ XONG (2026-08-08, branch `fix/csp-inline-handlers-room-settings` trên `dev`).

**Sửa:** thêm delegated `change` listener trong `client/js/action-delegate.js` đọc
`data-change-action` (song song với listener `click` đọc `data-action` đã có), gọi hàm không tham số
— khớp với chữ ký `updateSettings()`/`updateLocalSettings()` cũ. Đổi cả 18 chỗ
`onchange="updateSettings()"` → `data-change-action="updateSettings"` và
`onchange="updateLocalSettings()"` → `data-change-action="updateLocalSettings"` trong
`client/js/room-ui.js`. Bump `?v=81` → `?v=82`.

**Test:** `client/` không có Jest/jsdom runner cho code phụ thuộc DOM như event delegation (khác
với `escape-utils.js` — pure string, `require()`-able thẳng từ Node) — nêu rõ theo đúng ghi chú
"Bug-fix workflow" trong `CLAUDE.md` thay vì bỏ qua âm thầm. `npm test` (931 test, server-side) vẫn
pass nguyên, không đụng gì server-side.

Verify bằng Playwright thật thay thế (server tạm, DB tạm — di chuyển `gomoku.db`/`-wal`/`-shm` ra
rồi phục hồi lại sau, đã xác nhận `PRAGMA integrity_check` = `ok` và đủ bảng sau khi phục hồi):
1. Trước fix: guest tạo phòng → mở tab Cài đặt → click "Stone" → `checked` đổi nhưng
   `localStorage.play3cr_board_display` vẫn `null`, `RoomState.boardDisplayMode` vẫn `'paper'` →
   console log đúng 1 dòng CSP violation `script-src-attr 'none'`. Guest thứ 2 vào phòng (bắn
   `room:updated`) → radio bật lại về Paper. Tái hiện đúng y báo cáo người dùng.
2. Sau fix: cùng thao tác → `localStorage`/`RoomState.boardDisplayMode` đổi thành `'stone'` ngay,
   không còn CSP violation trong console. Test thêm board size (radio dùng chung pattern) → đổi
   sang 19 thành công. Guest thứ 2 vào phòng → cả display mode lẫn board size **giữ nguyên** giá trị
   vừa đổi, không bật lại.

**Phạm vi:** người dùng xác nhận sửa toàn bộ 18 chỗ trong tab Cài đặt (không chỉ riêng 2 radio
Paper/Stone được báo cáo ban đầu) vì cùng 1 root cause đã verify, tránh để lại 16 điểm hỏng giống hệt
trong cùng 1 hàm.
