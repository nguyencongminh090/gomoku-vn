# B116 — Hướng dẫn thực hiện: tách Bảng điểm khỏi vị trí cố định trên mobile (phòng chơi, room.html)

**Trạng thái nguồn:** ghi nhận từ báo cáo người dùng kèm ảnh chụp màn hình, chưa hỏi lại để chốt
thiết kế cụ thể — KHÔNG code trực tiếp từ file này, cần hỏi lại người dùng trước (theo quy tắc
"Short/underspecified prompts" của `CLAUDE.md`: đây là yêu cầu mới nêu giữa hội thoại, không phải
"làm ngay").

**SỬA PHẠM VI 2026-08-14:** người dùng xác nhận báo cáo là về **phòng chơi thường** (`client/room.html`
/ `client/js/room-ui.js`), KHÔNG PHẢI `client/tournament-match.html` như bản ghi đầu tiên (nhầm lẫn
của agent — 2 trang dùng cấu trúc gần giống hệt nên dễ lẫn). Toàn bộ hướng dẫn dưới đây đã trỏ lại
đúng file.

## Trước khi code, hỏi lại người dùng

1. Tab mới riêng cho Bảng điểm (như đề xuất gốc), hay chỉ ẩn nó khi tab Chat đang active trên mobile
   (giữ nguyên hiển thị khi ở tab Khán giả/Cài đặt)? Đề xuất gốc của người dùng là "tab riêng" —
   xác nhận lại đây có phải hướng cuối hay chỉ là gợi ý ban đầu.
2. Áp dụng đổi layout chỉ ở mobile (`@media (max-width: 768px)`, khớp breakpoint đã có trong
   `client/css/room.css:686`) hay cả desktop? Ảnh chụp gốc chỉ chụp mobile.
3. Nếu thêm tab thứ 4: tên hiển thị + i18n key nào (tiếng Việt "Bảng điểm" đã có sẵn ở
   `.score-panel__title` — `data-i18n="room.score_title"` — có thể tái dùng cho nhãn tab).
4. `client/tournament-match.html` có cấu trúc gần giống hệt (`.panel-players` → `.score-panel` →
   `.sidebar-tabs`, sao chép từ `room.html` — xem ghi chú tại `client/tournament-match.html:92-94`)
   và **rất có thể có cùng vấn đề trên mobile** dù không phải trọng tâm ảnh chụp lần này — hỏi người
   dùng có muốn mở rộng sửa luôn cả trang đó hay chỉ giới hạn `room.html`.

## Điểm cần cẩn thận khi implement

- `.score-panel`/`.score-table` (định nghĩa tại `client/css/room.css:350-357`) là class **dùng chung
  với `client/tournament-match.html`** — đổi CSS layout/vị trí cần giới hạn phạm vi selector cho
  riêng `room.html` (thêm class con hoặc scope theo container/`body` riêng của `room.html`), KHÔNG
  sửa `.score-panel` chung chung trong `room.css` theo kiểu ảnh hưởng luôn cả tournament-match, trừ
  khi câu hỏi 4 ở trên được người dùng xác nhận muốn sửa cả 2.
- `client/js/room-ui.js:523-565` (`renderScoreTable()`) hiện toggle `scorePanel.style.display` trực
  tiếp — nếu chuyển sang tab, logic ẩn/hiện phải phối hợp với logic chuyển tab hiện có
  (`client/js/room-ui.js:~486-492`, xử lý theo `data-tab`) thay vì generic display toggle độc lập, để
  không có 2 nguồn sự thật (tab active vs display style) đá nhau.
- `room.html` chỉ có 3 tab (Trò chuyện / Khán giả / Cài đặt), khác `tournament-match.html` (Nước đi /
  Trò chuyện / Khán giả) — đừng copy logic switch-tab của tournament-match.js sang mà không kiểm tra
  lại danh sách tab thực tế của room.js.
- Nếu thêm tab mới: bump `?v=N` toàn bộ theo quy tắc cache-busting ở đầu `CLAUDE.md` (đụng cả
  `client/css/` và `client/js/`, bao gồm mọi `import '...?v=N'` cross-import trong `client/js/*.js`).
- Đây là thay đổi thuần `client/`, không đụng `server/` — không cần branch backend-locked kiểu B113;
  nhưng vẫn nên theo `git-workflow` skill để chọn branch/tên đúng quy ước (`fix/*` nếu coi là sửa lỗi
  UX, hoặc qua `design-workflow` nếu người dùng muốn brainstorm nhiều phương án layout trước).
- Xác minh bằng trình duyệt thật ở kích thước mobile thực tế (theo "Feature completion checklist"
  của `CLAUDE.md` — không chỉ sửa CSS rồi đoán, phải mở DevTools responsive mode hoặc thiết bị thật
  kiểm tra chat không còn bị bóp), test trên `room.html` thật với 2 người chơi có lịch sử Thắng/Bại/Hoà
  để `.score-panel` không bị `display:none` (điều kiện hiện ở `renderScoreTable()`, cần ván đã có kết
  quả trước đó mới hiện bảng điểm).

(TODO.md #116) — [chi tiết todo](../todo/B116-tournament-match-scoreboard-lan-chiem-mobile-chat.md)
