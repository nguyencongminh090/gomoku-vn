# B116 — Bảng điểm (score-panel) chiếm chỗ Chat trên mobile ở phòng chơi (room.html)

**Trạng thái:** ✅ ĐÃ XONG

**ĐÃ LÀM 2026-08-14** (người dùng chọn qua `AskUserQuestion`: tab riêng, áp dụng mọi kích thước màn
hình — không chỉ mobile, chỉ `room.html` chứ chưa đụng `tournament-match.html`):
- `client/room.html`: gỡ `.score-panel` ra khỏi `.panel-players`, đặt vào tab-content mới `#tab-score`
  (nút tab thứ 2, sau "Trò chuyện", icon `ph-trophy`, i18n key `room.tab_score` mới thêm cho cả
  `vi`/`en` trong `client/js/i18n.js`).
- `client/js/room-ui.js`'s `renderScoreTable()`: đổi từ toggle `scorePanel.style.display` sang toggle
  `.tab-btn[data-tab="tab-score"].style.display` + bật lại tab Trò chuyện nếu tab điểm đang active mà
  vừa hết dữ liệu — cùng khuôn mẫu "ẩn tab tới khi có dữ liệu, không để người dùng kẹt trên tab vừa
  biến mất" đã dùng cho `tab-users`. Biến `scorePanel` không còn dùng, đã xoá.
- `client/css/room.css`: giữ nguyên rule `.score-panel` gốc (vẫn phục vụ `tournament-match.html`),
  thêm `#tab-score .score-panel` riêng (bỏ border-top/margin-top, thêm padding) để không đụng
  `tournament-match.html`.
- `client/css/room-zen.css`: thêm `body.zen-room #tab-score .score-panel` (padding 0, không viền) để
  không cộng dồn với padding sẵn có của `.tab-content` trong skin zen, theo đúng khuôn mẫu
  `.users-panel`/`.settings-panel__body` đã có trong file này.
- `?v=` 119→120 toàn bộ `client/*.html` + `client/js/*.js` (đã grep xác nhận chỉ còn 1 giá trị).
- `npm test`: 1138/1138 pass (không có test nào assert cấu trúc DOM cũ bị vỡ).
- Xác minh trực tiếp bằng Playwright thật (2 guest, viewport 390×844, `PLAYWRIGHT_BROWSERS_PATH` từ
  môi trường, db thật đã di dời sang `.pre-e2e` theo `playwright-e2e-safety` trước khi khởi động
  server thử nghiệm, khôi phục lại sau khi xong): trước khi có kết quả, tab Bảng điểm ẩn (`display:
  none`) đúng như tab Khán giả; sau khi 1 người đầu hàng, tab hiện ra với đúng cột "Tên/Thắng/Thua/
  Hoà" và dữ liệu đúng (1-0-0 / 0-1-0); khung chat giữ nguyên chiều cao đầy đủ (228px trên viewport
  844px) ở cả 2 trạng thái, không còn bị bảng điểm chèn lên trên. Ảnh chụp màn hình xác nhận trực
  quan cả 3 mốc (trống, Bắt đầu-lại-hiện + tab điểm đã hiện, nội dung tab điểm) `[Model: Sonnet 5]`.
- **Ngoài phạm vi (chưa làm, xem ghi chú "SỬA PHẠM VI" bên dưới)**: `client/tournament-match.html`
  dùng cấu trúc gần giống hệt và rất có thể có cùng vấn đề trên mobile — người dùng chọn "Room only
  for now" khi được hỏi, nên trang đó **giữ nguyên chưa sửa**, có thể là việc theo dõi riêng sau này.

**SỬA PHẠM VI 2026-08-14:** Người dùng xác nhận báo cáo gốc là về **phòng chơi thường**
(`client/room.html` / `client/js/room-ui.js`), **KHÔNG PHẢI** trang trận đấu giải đấu
(`client/tournament-match.html`). Bản mô tả/vị trí code bên dưới đã được sửa lại theo đúng phạm vi
này — bản đầu tiên (trỏ sai vào `tournament-match.*`) là nhầm lẫn của agent, không phải của người
dùng: cả 2 trang dùng cấu trúc `.panel-players` → `.score-panel` → `.sidebar-tabs` gần giống hệt nhau
(`tournament-match.html` sao chép từ `room.html`, xem ghi chú tại `client/tournament-match.html:92-94`),
nên dễ nhầm; ảnh chụp gốc có cột "T/B/H" (Thắng/Bại/Hoà) — chỉ tồn tại ở bảng điểm của `room.html`
(`client/room.html:117-120`), bản tournament-match chỉ có cột "Điểm" đơn — nên xác nhận chắc chắn
đúng là `room.html`.

## Mô tả

Người dùng báo cáo (kèm ảnh chụp màn hình điện thoại) trên trang phòng chơi (`client/room.html`):
`.score-panel` (`#score-panel`, bảng điểm Thắng/Bại/Hoà 2 người chơi) nằm cố định phía trên khối tabs
(`.sidebar-tabs`), phía trên tab Chat đang mở (tab mặc định active). Trên màn hình hẹp, khối bảng
điểm này chiếm một phần chiều cao đáng kể của cột phải (`.panel-right-shell`), đẩy khung chat
(`#chat-messages` + ô nhập) xuống co lại rất thấp — trong ảnh chụp chỉ còn ~2 dòng tin nhắn hiển thị
trước khi phải cuộn.

## Đề xuất của người dùng

Tách Bảng điểm ra khỏi vị trí cố định hiện tại, đưa vào một tab riêng (tương tự tab "Nước đi" /
"Trò chuyện" / "Khán giả" đã có trong `.sidebar-tabs`) thay vì luôn hiển thị đè lên không gian của
tab Chat.

## Vị trí liên quan trong code (tham khảo, chưa xác nhận hướng sửa)

- `client/room.html:98-137` — `.score-panel` (`#score-panel`) nằm trong `.panel-players`, phía trên
  `.sidebar-tabs` (dòng 128: Trò chuyện / Khán giả / Cài đặt — chỉ 3 tab, KHÔNG có tab "Nước đi" như
  tournament-match), tức luôn hiển thị bất kể tab nào đang active. Tab "Trò chuyện" là mặc định active
  (`tab-btn--active` + `tab-content--active` trên `#tab-chat`).
- `client/js/room-ui.js:43-44,523-565` — `scorePanel`/`scoreBody`, hàm `renderScoreTable()` toggle
  `scorePanel.style.display`.
- `client/css/room.css:350-357` (`.score-panel`) — **class này dùng chung với
  `client/tournament-match.html`** (xem `client/tournament-match.html:92-94`, chính bản đó sao chép
  layout từ `room.html`) — đổi CSS ở đây cần kiểm tra không vỡ layout `tournament-match.html` (nơi
  CÓ score-panel ở vị trí gần giống, tuy không phải trọng tâm báo cáo lần này, xem `docs/todo/
  B116-...md` phần "SỬA PHẠM VI" ở trên).
- `client/css/room.css:686+` (`@media (max-width: 768px)`), `:765` (`.panel-right-shell` mobile
  override), `:803` (`@media (max-width: 360px)`) — các breakpoint mobile hiện có cho khu vực này.

## Việc cần làm trước khi code

- Xác nhận lại phạm vi: chỉ mobile (breakpoint nào — khớp `@media (max-width: 768px)` sẵn có trong
  `room.css:686`?) hay đổi cho cả desktop.
- Quyết định vị trí tab mới: thêm tab thứ 4 "Bảng điểm" cạnh Trò chuyện/Khán giả/Cài đặt.
- Nếu thêm tab mới: cần cập nhật i18n key (`data-i18n` hiện có cho 3 tab khác dùng `room.tab_*`), và
  `client/js/room-ui.js` phần switch-tab (dòng ~486-492, xử lý `data-tab`) để phối hợp với
  `renderScoreTable()` thay vì generic `style.display` độc lập.
- Xác nhận lại: `client/tournament-match.html` có cùng vấn đề không (dùng chung cấu trúc) — nếu người
  dùng muốn sửa cả 2 trang thì mở rộng phạm vi B116, nếu chỉ `room.html` thì giữ nguyên
  tournament-match như cũ.

[chi tiết instruction](../instruction/B116-tournament-match-scoreboard-lan-chiem-mobile-chat.md)
