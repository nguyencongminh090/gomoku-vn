# #58. Trận đấu giải đấu không có kiểu bàn cờ "Đá" (Stone) — luôn hiện "Giấy" (Paper)

**Nguồn:** báo cáo người dùng, 2026-08-07, ngay sau đợt full-refactor #52/#55/#56: "Board Style need
to be recover in tournament too. It seems do not have Stone Board".

## Nguyên nhân (đã xác nhận, đã sửa)

Cùng loại lỗi với #55 (click mode) — `tournament-match.js`'s `initBoard()`/`updateBoardState()`/
`renderSwap2Board()` không bao giờ đọc `localStorage.getItem('play3cr_board_display')`, nên
`BoardRenderer` (`board.js:49`) luôn rơi về mặc định cứng `'paper'`, bất kể người dùng đã chọn "Đá"
(Stone) từ trước ở `room.html`'s tab Cài đặt (`room-ui.js:321-324`, `updateLocalSettings()`).

## Đã sửa

Thêm hàm `boardDisplayMode()` (đọc cùng key `play3cr_board_display`, mặc định `'paper'`) trong
`client/js/tournament-match.js`, truyền `displayMode: boardDisplayMode()` vào cả 3 điểm gọi
`BoardRenderer`/`setState` (khởi tạo, cập nhật ván đang chạy, cập nhật khi đặt quân Swap2) — khớp
với 4 điểm `game-ui.js` đã truyền `displayMode: st.boardDisplayMode`.

Không thêm listener live-sync (khác #55's `clickmodechange`) vì bản thân `room.html` cũng không phát
sự kiện toàn cục cho setting này — nó chỉ là 1 lựa chọn cục bộ trong tab Cài đặt của phòng, cập nhật
tức thời trong chính trang đó, không có cơ chế broadcast cross-tab/cross-page nào để mô phỏng lại.

Không thêm UI đổi Stone/Paper ngay trong `tournament-match.html` (tab "Nước đi/Trò chuyện/Khán giả"
hiện tại không có tab Cài đặt) — chỉ khôi phục việc đọc đúng giá trị đã lưu, đúng phạm vi báo cáo
("recover"). Nếu người dùng muốn đổi kiểu bàn cờ trong lúc đang ở trận đấu giải đấu (không chỉ kế
thừa từ lần chọn trước ở phòng thường), đó là 1 yêu cầu UI mới, chưa được yêu cầu ở đây.

Verify: Playwright, đặt `localStorage.play3cr_board_display = 'stone'` trước khi vào
`tournament-match.html` của 1 trận đang diễn ra (3 nước đã đi) — bàn cờ hiện đúng nền gỗ + quân tròn
bóng kiểu Stone thay vì kiểu Giấy (X/O phẳng) trước đó.
