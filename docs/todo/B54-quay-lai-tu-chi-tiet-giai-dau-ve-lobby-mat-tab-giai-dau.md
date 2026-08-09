# #54. "Quay lại danh sách giải đấu" từ trang chi tiết giải đấu luôn về tab "Bàn chơi", mất ngữ cảnh tab "Giải đấu"

**Nguồn:** báo cáo người dùng, 2026-08-07 — "Quay lại giải đấu/... return to lobby (tables tab)".

## Nguyên nhân đã xác nhận (đọc code, chưa sửa)

- Link "Quay lại danh sách giải đấu" trên `client/tournament.html:50` trỏ thẳng `href="index.html"`
  — không kèm bất kỳ query param nào để báo cho lobby biết nên mở tab nào.
- `client/index.html:67` hardcode `tab-tables` là tab `is-active` mặc định trong markup tĩnh.
- `client/js/tournaments.js`'s `activateTab()` (dòng 65-73) chỉ được gọi từ 2 click handler
  (`tabTables`/`tabTournaments`, dòng 75-76) — **không có đoạn code nào đọc query param lúc tải
  trang** (không `URLSearchParams`, không đọc `location.search`) để tự động gọi
  `activateTab('tournaments')`.
- Kết quả: bấm "Quay lại danh sách giải đấu" từ trang chi tiết giải đấu → về `index.html` → luôn
  hiện tab "Bàn chơi" mặc định, người dùng phải tự bấm lại sang tab "Giải đấu" — đúng như báo cáo.

## Việc cần làm khi triển khai fix

- Đổi link back ở `client/tournament.html:50` thành `href="index.html?tab=tournaments"` (hoặc
  tương tự).
- Thêm đoạn đọc `URLSearchParams(location.search)` trong `client/js/tournaments.js` lúc khởi tạo,
  gọi `activateTab('tournaments')` nếu `tab=tournaments` — tái dùng đúng hàm `activateTab()` đã có,
  không viết logic chuyển tab mới.
- Cân nhắc dọn param khỏi URL sau khi áp dụng (`history.replaceState`) để refresh trang sau đó
  không bị kẹt cứng ở tab Giải đấu nếu người dùng thực sự muốn quay lại Bàn chơi — chi tiết UX này
  để lúc triển khai quyết định, không phải yêu cầu bắt buộc.
