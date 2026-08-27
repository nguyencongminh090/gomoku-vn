# B132 — `#game-controls` cuộn ngang 1 hàng thay vì wrap 2 hàng trên mobile

**Trạng thái:** ✅ ĐÃ XONG

## Nguồn

Người dùng chụp màn hình phòng chơi trên iPhone (Safari), chỉ ra 4 nút hành động (Đầu hàng / Đề
nghị hoà / Xin thêm giờ / Xin đi lại) wrap thành 3 nút hàng 1 + 1 nút full-width hàng 2, đề xuất gộp
thành 1 hàng cố định và cho cuộn ngang (kiểu slider) để xem hết các nút, cuộn chỉ trong phạm vi khối
nút — không cuộn cả trang.

## Vấn đề

`client/css/game.css:636-651` — mobile breakpoint (`max-width: 768px`) đặt `#game-controls` là
`flex-wrap: wrap` với mỗi nút `flex: 1 1 30%`. Với 4 nút, 3 nút vừa hàng 1, nút thứ 4 rớt xuống hàng
2 (full width) — chiếm thêm chiều cao dọc, xấu trên điện thoại nhỏ.

## Giải pháp đã chốt (thảo luận trực tiếp với người dùng)

- Bỏ `flex-wrap: wrap`; mỗi nút đổi `flex: 1 1 30%` → `flex: 0 0 auto` với `min-width` theo nội
  dung (không co ép nhồi vừa viewport).
- `#game-controls` (chỉ ở breakpoint mobile) thêm `overflow-x: auto; overflow-y: hidden` — cuộn
  ngang cục bộ trong chính khối nút, không cuộn `.room`/trang (trang vốn đã không cuộn dọc ở zen
  mode nên không xung đột).
- Discoverability: khi tràn, nút cuối cùng cố ý cắt hụt (không set width bằng nhau ép vừa) để gợi ý
  "còn nữa" — không thêm gradient/overlay riêng.
- `scroll-snap-type: x proximity` trên container + `scroll-snap-align: start` trên `.btn-game` —
  vuốt nhẹ tự khớp về đúng nút, không khoá cứng như `mandatory`.
- Ẩn thanh scrollbar ngang bằng `scrollbar-width: none` / `::-webkit-scrollbar { display: none }`
  (chỉ là chi tiết thẩm mỹ, không đổi hành vi cuộn).

## Phạm vi

Chỉ breakpoint mobile hiện có (`max-width: 768px`) trong `client/css/game.css`. Không đụng
`room-zen.css` (`.game-controls` desktop/zen không wrap, không cần đổi) — chỉ ảnh hưởng skin mặc
định (`room.css`/`game.css`) trên mobile, đúng ảnh chụp gốc của người dùng.

## Đã làm

- `client/css/game.css` mobile block: bỏ `flex-wrap`, đổi `.btn-game` sang `flex: 0 0 auto` +
  `min-width`, thêm `overflow-x: auto`, `scroll-snap-type: x proximity`, ẩn scrollbar.
- Bump `?v=132→133` toàn bộ (đổi `client/css/game.css`); xác minh bằng grep cache-bust còn đúng 1
  giá trị.
- **Bug phát hiện lúc verify bằng Playwright, đã sửa**: `.game-controls` base rule (desktop) có
  `justify-content: center` không bị override ở breakpoint mobile — trên container cuộn được, điều
  này khiến trình duyệt cắt nội dung tràn đối xứng cả 2 đầu tại `scrollLeft: 0` (nút đầu tiên bị
  pre-clip và không cách nào cuộn tới vì `scrollLeft` không âm được). Thêm `justify-content:
  flex-start` cho đúng breakpoint mobile để sửa.
- Xác minh bằng Playwright trên instance cô lập (copy repo + DB tạm + cổng 3111, không đụng
  server/DB thật đang có người chơi — theo `playwright-e2e-safety`): trang test tĩnh load đúng
  `main.css`/`room.css`/`room-zen.css`/`game.css`/`settings-panel.css` thật với `body.zen-room` (skin
  mặc định của `room.html`) và markup 4 nút y hệt `game-ui.js:279-286`. Đo bằng
  `getBoundingClientRect()`:
  - Ở `scrollLeft: 0`: nút đầu ("Đầu hàng") bắt đầu đúng mép trái container (trước khi sửa: bắt đầu
    tại x=-22.5, bị cắt mất "Đầ").
  - Ở `scrollLeft: max (61px)`: nút cuối ("Xin đi lại") kết thúc đúng mép phải container.
  - `window.scrollY` không đổi (0→0) khi set `#game-controls.scrollLeft` — xác nhận cuộn chỉ trong
    khối nút, không cuộn trang, đúng yêu cầu người dùng.
  - Ảnh chụp element-scoped tại 2 vị trí cuộn xác nhận trực quan khớp số đo.
  Đã dừng server tạm + xoá bản copy repo sau khi verify xong.

Xem hướng dẫn triển khai: [instruction B132](../instruction/B132-game-controls-cuon-ngang-1-hang-thay-vi-wrap-2-hang.md).
