# Fix log entry — 2026-08-22 11:50

## Prompt

Người dùng xem trực tiếp bản sửa #143 vòng 1 (`✕` ở góc thẻ qua `position: absolute`), phản hồi:
"kiểu cũ: X inline có vẻ trông đẹp và dễ thu hút ánh mắt người dùng hơn. Kiểu mới: X trên góc làm
Slot trông rời rạc. => I want to use the old one."

## Action

Việc quay lại nguyên trạng inline sẽ tái phát đúng bug gốc của #143 (tên ghế mình bị bóp còn ~40px
`clientWidth` trong khi ghế đối thủ giữ 78px). Hỏi lại người dùng qua `AskUserQuestion` trước khi
đụng code (đúng tinh thần "cần bàn trước khi làm" mà chính mục #143 tự flag lúc mới mở): revert
nguyên trạng chấp nhận bug quay lại, hay giữ inline nhưng thu nhỏ nút để đỡ bóp tên hơn. Chọn:
inline nhưng thu nhỏ.

Đổi `client/css/room.css`: bỏ `position: relative` khỏi `.slot-card`, bỏ `position: absolute` +
`padding-top` khỏi `.slot-card__header`/`.slot-card__stand` của vòng 1; `.slot-card__header` về lại
`justify-content: space-between; gap: 6px` nguyên bản. `.slot-card__stand` giữ `flex-shrink: 0`
inline, nhưng `min-width`/`min-height` hạ `32px → 24px` — chọn đúng sàn **WCAG 2.2 AA "target size
(minimum)"** (không phải số tuỳ ý thấp hơn nữa), `padding` giảm tương ứng `6px 8px → 3px 5px`.

`instruction.md` §B143 ràng buộc rõ: nếu hạ ngưỡng chạm thì **phải kiểm chứng lại bằng chạm thật
trên viewport điện thoại, không chỉ đo trên desktop**. Verify trên instance cô lập (db tạm, cổng
3111, `CORS_ORIGIN`/`AUTH_LIMITER_MAX`/`MAX_ROOMS_PER_IP` override chỉ phiên chạy):
- Đo desktop (1920×995, 2 tài khoản thật tên 23 ký tự): nút đúng 24×24px, không chồng lấp
  `.slot-card__name`; `clientWidth` tên ghế có nút 40px→48px (cải thiện 8px, không full parity với
  78px của ghế kia — đúng tradeoff đã chọn).
- Chạm thật: Playwright `devices['Pixel 5']` (`hasTouch: true`, `isMobile: true`), `page.tap()` vào
  nút 24px → đứng dậy thành công (`#slot-1` chuyển `.slot-card__empty`, không còn `.slot-card__name`).

Viết lại test `e2e/slot-card-stand-name-symmetry.spec.ts` (vòng 1) thành
`e2e/slot-card-stand-inline-touch-target.spec.ts`: assertion "full parity" của vòng 1 giờ luôn sai
với thiết kế mới nên không giữ nguyên được — đổi sang đo đúng sàn 24px (không phải 32px cũ, không
thấp hơn 24px) + không chồng lấp + kịch bản chạm thật trên Pixel 5. Xác nhận không rỗng bằng
`git stash` riêng `room.css`: kịch bản đo kích thước fail đúng dự đoán (`received 32`, tức bản gốc
32px); `git stash pop` khôi phục, cả hai kịch bản pass lại. `e2e/drawer-rail-not-displaced.spec.ts`
(#142) vẫn 2/2 pass — không tái phát #142.

Trong lúc viết test gặp một lần false-positive: kịch bản chạm thật timeout đăng ký tài khoản không
phải do bug sản phẩm mà do **bug trong chính test** — `stamp` nối thêm literal `'-touch'` sinh
username chứa dấu `-` (không hợp lệ theo `isValidDisplayName`/username regex chỉ cho chữ/số/gạch
dưới), validate phía client chặn submit im lặng không log lỗi. Sửa `stamp` bỏ dấu gạch ngang, test
pass ổn định qua nhiều lần chạy.

`npm test` **1230/1230** (không đổi — thay đổi thuần CSS/test, không đụng code có Jest coverage).
`?v=` 145→146 toàn repo.

## Decision

Nhánh `fix/slot-card-stand-inline-smaller` off `dev` (tiếp tục theo exception rule vì mục #143 chỉ
tồn tại trên `dev`). Merge một commit vào `dev`.

## Summary output

`TODO.md` #143 cập nhật mô tả 2 vòng (vòng 1 bị thay bởi vòng 2). `docs/todo/B143-*.md` thêm mục
"Vòng 2 — hướng chốt cuối cùng" giữ lại vòng 1 làm lịch sử thay vì xoá.
