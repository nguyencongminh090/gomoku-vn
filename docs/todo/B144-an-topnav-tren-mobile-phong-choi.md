# #144 — Topnav chiếm 60px cố định trên mobile phòng chơi; ẩn mặc định, kéo xuống khi cần

**Trạng thái:** ✅ ĐÃ XONG (dạng khác với đề xuất ban đầu — xem "Kết quả cuối" bên dưới).

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
- Nút cài đặt thì **trùng lặp** — bottom bar đã có `tab-settings`. **(Sai — xem "Kết quả cuối":
  đây là 2 phạm vi cài đặt khác nhau, không trùng.)**
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

## Kết quả cuối

**Hỏi trước khi code** (`AskUserQuestion`, đúng yêu cầu `instruction.md` §B144): chọn nút `V`
(không phải vuốt — tránh xung đột pull-to-refresh không kiểm chứng được trong môi trường này) làm
vòng 1.

**Đo bắt buộc trước khi kết luận** (server throwaway cổng 3111, DB tạm, không đụng server/DB thật):
canvas board **KHÔNG đổi 1px** khi bật/tắt topnav ở cả Pixel 5 (393×727, 391px cả hai) lẫn iPhone SE
375×667 (373px cả hai, đúng viewport `instruction.md` yêu cầu) — trái với giả định "iPhone SE bị
giới hạn bởi chiều cao nên có lợi thật". Board **rộng-giới hạn** (width-bound) trên mọi viewport
điện thoại thực tế đã đo; khoảng trống giải phóng chỉ biến thành **khoảng trắng dưới
`.game-controls`**, không phải board to hơn. Chỉ trên iPhone SE đời cũ 320×568 mới thấy lợi thật
nhưng cực nhỏ (~2.6px). Hỏi lại người dùng qua `AskUserQuestion` với số đo thật: **giữ làm tính năng
gọn giao diện thuần tuý** (đúng yêu cầu gốc "thanh này tốn quá nhiều chỗ, ẩn được không?" — không
phải "làm board to hơn").

**Vòng 1** (nút `V` mở rộng/thu gọn): implement xong, screenshot cho người dùng xem. Phản hồi:
**bỏ nút V**, làm thanh tối giản **luôn ở trạng thái nhỏ**, không cần mở rộng — chỉ còn icon rời
phòng (trái) + mã phòng (giữa) + icon cài đặt chung (phải), logo/brand bỏ hẳn trên mobile.

**Phát hiện khi làm vòng 1**: nút "cài đặt" trong topnav **không tĩnh trong HTML** — được
`settings-panel.js`'s `mountTrigger()` chèn động vào `.topnav__right` lúc `DOMContentLoaded` (mọi
trang: index/room/history), nên lần đọc `client/room.html` ban đầu bỏ sót nó. Đây là **Cài đặt
chung** (theme/ngôn ngữ/mật độ/chế độ hiển thị bàn/tài khoản) — khác phạm vi với `tab-settings` ở
bottom bar (cài đặt **ván đấu**: cỡ bàn, luật thắng, wall/portal, chỉ host). Nhận định "trùng lặp"
ban đầu trong mục "Rủi ro UX" ở trên là **sai** — đã đính chính tại chỗ, không xoá.

**Bản cuối (vòng 2)**: `--zen-topnav-h` cố định `28px` trên zen mobile (không còn 2 trạng thái, bỏ
hẳn JS toggle). `.topnav__brand` ẩn vĩnh viễn trên mobile. `.topnav__right` dùng
`justify-content: space-between` + `order` tường minh (`#btn-leave` order 1, `#room-id-nav` order 2,
`#btn-settings` order 3 — độc lập vị trí DOM thật vì `#btn-settings` được chèn động sau cùng) để dàn
đều 3 nút/text ra 3 vị trí trái/giữa/phải bất kể thứ tự chèn. Không đụng `--zen-topnav-h`'s vai trò
biến hình học chịu lực (11 chỗ `calc()` khác + `board.js` đọc gián tiếp qua `shellTop`) — vẫn không
cần sửa `board.js`.

Test `e2e/topnav-minimal-mobile.spec.ts` (2 viewport Pixel 5 + iPhone SE 375×667): topnav
`height ≤ 36px` (bỏ bản sửa ra → fail đúng `received 60`), rời phòng/mã phòng/cài đặt đều hiện và
nằm trọn trong hộp nav (không tràn), và **kiểm tra chức năng thật** — bấm rời phòng thật sự điều
hướng về `index.html`, không chỉ đo `isVisible()`. `npm test` **1230/1230**, `?v=147→148→149`.

Nhánh `fix/hide-topnav-mobile` off `dev` (đúng exception rule vì #144 chỉ tồn tại trên `dev`).
