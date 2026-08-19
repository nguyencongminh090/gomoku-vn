# B132 — Hướng dẫn triển khai

Vị trí sửa: `client/css/game.css`, block `@media (max-width: 768px)` quanh dòng 636-651
(`.game-controls` + `.btn-game`).

## Approach

1. `.game-controls` (trong media query mobile): bỏ `flex-wrap: wrap`, thêm:
   ```css
   overflow-x: auto;
   overflow-y: hidden;
   scroll-snap-type: x proximity;
   -webkit-overflow-scrolling: touch;
   scrollbar-width: none;
   ```
   `::-webkit-scrollbar { display: none; }` trên cùng selector cho Safari/Chrome mobile.
2. `.btn-game` (cùng media query): đổi `flex: 1 1 30%` → `flex: 0 0 auto`, thêm `min-width` đủ chứa
   text 2 dòng ngắn nhất hiện có ("Xin đi lại" ~ 90-100px là hợp lý cho font-size 12px hiện tại) +
   `scroll-snap-align: start`.
3. **Không đổi** `flex: 1` gốc của `.btn-game` (dòng ~193, desktop/base) — chỉ override trong
   breakpoint mobile như các rule khác trong cùng block.
4. Bump `?v=N` toàn repo theo `CLAUDE.md` (đổi `client/css/game.css`) — verify bằng:
   `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` phải ra đúng 1 giá trị.

## Pitfalls

- `room-zen.css:924` (`body.zen-room .game-controls { width: 100%; margin: 8px 0 0; }`) không set
  `flex-wrap` riêng nên đang thừa hưởng rule base không-wrap của `game.css:181-190` — **không đụng
  tới zen skin**, đây là do người dùng chụp ảnh ở skin mặc định (không phải `body.zen-room`).
  Nếu app hiện tại mặc định load zen skin, xác nhận lại bằng DOM thật trước khi coi B132 là "đã sửa
  đúng chỗ observed trong ảnh".
- 4 nút thực tế đến từ `game-ui.js:279-286` (`renderGameControls`) VÀ đường swap2 riêng
  (`game-ui.js:337-380`, chỉ 1 nút Undo trong `.swap2-undo-row`, không đi qua flex 4-nút này) —
  scroll chỉ cần áp dụng cho trường hợp render chính (`renderGameControls`), swap2 không có vấn đề
  wrap vì chỉ 1-3 nút nhỏ.
- Đừng đặt `overflow-x: auto` lên `.room` hay ancestor nào khác — chỉ scope đúng `#game-controls`,
  đúng yêu cầu người dùng ("chỉ khối chứa button, không cuộn cả trang").
- Test thật trên viewport hẹp (iPhone SE ~375px hoặc DevTools responsive 360px) — 4 nút + gap 6px có
  tràn hay không phụ thuộc `min-width` chọn, phải xác minh bằng mắt/Playwright chứ không đoán bằng
  số.
