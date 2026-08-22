# #144 — Topnav chiếm 60px cố định trên mobile phòng chơi; ẩn mặc định, kéo xuống khi cần

**Trạng thái:** ⏳ CHƯA LÀM (mới ghi nhận, chưa chốt phương án tương tác).

**Nguồn:** báo cáo trực tiếp người dùng kèm ảnh chụp Android (2026-08-22), ngay sau khi
`ui/strip-clock-mobile` (#143 → strip đồng hồ) lên site thật. Nguyên văn: *"Thanh Panel này tốn quá
nhiều space, có thể ẩn đi?"*

## Vấn đề

`<nav class="topnav">` trong `client/room.html` cao **60px** cố định trên zen mobile
(`--zen-topnav-h`, `room-zen.css:78`), luôn hiện, chứa: logo `P`, mã phòng `#TCP`, nút rời phòng,
nút cài đặt.

Trên iPhone SE (375×667) đó là **9% chiều cao viewport** — gấp 20 lần cái giá 3px mà #143 phải cân
não để tiết kiệm. Đây là khoản dư địa lớn nhất còn lại của màn hình phòng chơi trên điện thoại.

## Ý tưởng người dùng đưa ra (chưa chốt)

1. **Mặc định ẩn**, vuốt xuống thì hiện.
2. Hoặc: nút mũi tên `V` để thả thanh xuống.

Chỉ mobile. Desktop giữ nguyên.

## Vì sao đây không phải một dòng CSS

`--zen-topnav-h` là **biến hình học chịu lực**, không phải chỉ chiều cao của chính thanh nav. 11 chỗ
trong `room-zen.css` tính toán từ nó:

| Dòng | Dùng để làm gì |
|---|---|
| 100 | chiều cao chính `.topnav` |
| 283-284 | `height: calc(100vh - var(--zen-topnav-h))` — khung cột board |
| 442 | `top:` của một surface neo dưới nav |
| 1005 | `max-height` của bottom sheet mobile |
| 1140-1142, 1152-1154 | `inset` + `height` của sheet ở hai trạng thái mở/thu |

Thêm nữa `board.js` `resize()` (nhánh zen mobile) lấy ngân sách chiều cao từ
`boardAreaShell.getBoundingClientRect().top + scrollY`, tức là **gián tiếp** đã bao gồm chiều cao
nav. Nếu nav chuyển sang overlay/ẩn mà các `calc()` trên không đổi theo, board sẽ **không** đòi lại
được 60px đó — chỉ để lại một dải trống.

## Rủi ro UX phải giải quyết trước

- **Nút rời phòng chỉ có ở topnav.** Ẩn nav = ẩn luôn lối thoát duy nhất. Bottom bar có
  chat/bảng điểm/khán giả/cài đặt — **không** có "rời phòng".
- **Mã phòng `#TCP` cũng chỉ có ở topnav**, và đó là thứ người chơi cần để rủ bạn vào.
- Nút cài đặt thì **trùng lặp** — bottom bar đã có `tab-settings`.
- Vuốt-xuống-từ-mép-trên **đụng pull-to-refresh** của Chrome/Safari Android/iOS. Đây là lý do
  nghiêng về phương án 2 (nút `V`), hoặc phải `overscroll-behavior-y: contain`.

## Lợi ích thật sự thu được (dự kiến, cần đo)

Giống hệt bài học của #143: board trên **Pixel 5 bị giới hạn bởi chiều rộng** (391px, còn dư ~149px
chiều cao) nên ẩn nav **không làm board to thêm** ở đó — chỉ bớt lộn xộn. Trên **iPhone SE** board
bị giới hạn bởi chiều cao nên mới có lợi thật. Phải đo cả hai viewport trước khi kết luận, đừng suy
từ CSS.

## Phạm vi

`client/room.html`, `client/css/room-zen.css`, có thể thêm JS toggle. `.topnav` là **dùng chung 5
trang** (`index/history/room/tournament/tournament-match`) → mọi rule phải khoá trong
`body.zen-room` + media query mobile, nếu không sẽ rò sang sảnh chờ và giải đấu.

## Ngoài phạm vi

- Desktop.
- `client/js/board.js` (khoá theo `design-workflow`) — nếu hoá ra bắt buộc phải sửa ngân sách chiều
  cao trong đó thì phải dừng lại và hỏi, đừng tự nới khoá.
