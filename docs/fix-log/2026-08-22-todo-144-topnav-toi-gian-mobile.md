# Fix log entry — 2026-08-22 19:05

## Prompt

Người dùng: "Do #144". `instruction.md` §B144 tự flag phải hỏi `AskUserQuestion` chốt hướng tương
tác (vuốt/nút `V`) trước khi code, và phải đo canvas board trước/sau trên cả Pixel 5 lẫn iPhone SE
trước khi kết luận có lợi ích thật hay không.

## Action

Hỏi hướng tương tác trước: chọn nút `V` (không phải vuốt — vuốt đụng pull-to-refresh, không kiểm
chứng được bằng Playwright `hasTouch` trong môi trường này). Hỏi tiếp: nút rời phòng + mã phòng khi
thu gọn nên ở đâu — chọn giữ trong thanh mini luôn-hiện (rủi ro thấp hơn, không đụng hệ thống
drawer/rail vốn đã có lịch sử lỗi qua #134/#136/#138) thay vì chuyển hẳn sang rail.

Implement vòng 1: `.slot-card`... không, nhầm — `.topnav` giữ `--zen-topnav-h` làm biến chịu lực,
mặc định `28px` trên mobile (che `.topnav__brand`), nút `▾` (`#btn-topnav-toggle`, tái dùng icon
`ph-bold-caret-right` xoay 90°/-90° qua CSS thay vì đổi `href`) đổi class `zen-topnav-expanded` trên
`body` (single-writer pattern giống `setDrawerCollapsed`) để bật `--zen-topnav-h: 60px` + hiện lại
brand. Gọi `refitBoardAfterDrawer()` sau mỗi lần đổi để `board.js` đo lại `shellTop` mới — không
đụng `board.js` (khoá theo `design-workflow`).

**Đo bắt buộc trước khi kết luận** (server throwaway cổng 3111, `CORS_ORIGIN`/`AUTH_LIMITER_MAX`/
`MAX_ROOMS_PER_IP` override chỉ phiên chạy, db tạm — không đụng server/DB thật): dựng 2 tài khoản
thật, vào trận, đo canvas trước/sau khi bật/tắt nav ở Pixel 5 (393×727) và iPhone SE **375×667**
(đúng viewport `instruction.md` yêu cầu, không dùng bản 320×568 mặc định của Playwright). Kết quả:
canvas **không đổi 1px** ở CẢ HAI — board rộng-giới hạn (width-bound) trên cả hai, trái ngược giả
định gốc "iPhone SE lợi thật vì bị giới hạn chiều cao". Đo thêm iPhone SE đời cũ 320×568: lợi thật
nhưng chỉ ~2.6px (318→315.4px khi mở rộng nav), không đáng kể.

Báo lại người dùng bằng bảng số đo qua `AskUserQuestion` trước khi merge — đúng tinh thần "đo trước
khi kết luận" của chính tài liệu #144: giữ làm tính năng gọn giao diện thuần tuý (đúng câu hỏi gốc
"thanh này tốn chỗ, ẩn được không?"), không phải "làm board to hơn" như lý do ban đầu nêu.

Cho xem bản nút `▾` (screenshot Pixel 5 + iPhone SE 375×667, cả 2 trạng thái). Phản hồi: **bỏ nút
▾**, muốn thanh **luôn tối giản**, không cần mở rộng — chỉ icon rời phòng (trái) + mã phòng (giữa) +
icon cài đặt (phải).

**Phát hiện giữa chừng**: khi xem screenshot, thấy MỘT icon bánh răng lạ ở góc phải mà tôi không hề
thêm — hoá ra `client/js/settings-panel.js`'s `mountTrigger()` chèn `#btn-settings` (Cài đặt
**chung**: theme/ngôn ngữ/mật độ/hiển thị bàn/tài khoản) vào `.topnav__right` lúc `DOMContentLoaded`,
không nằm tĩnh trong `room.html` nên bị bỏ sót lúc đọc code ban đầu. Xác nhận đây **không phải**
bản trùng của `tab-settings` (cài đặt ván đấu: cỡ bàn/luật/wall-portal, chỉ host) như
`docs/todo/B144-*.md`/`instruction.md` §B144 nhận định ban đầu — đính chính tại chỗ trong cả hai
file, không xoá nhận định cũ.

Vòng 2: gỡ `#btn-topnav-toggle` (HTML/JS/CSS/i18n key), `.topnav__brand` ẩn vĩnh viễn trên mobile,
`--zen-topnav-h: 28px` cố định (không còn 2 trạng thái). `.topnav__right { justify-content:
space-between }` + `order` tường minh (`#btn-leave` 1, `#room-id-nav` 2, `#btn-settings` 3) để dàn 3
phần tử ra trái/giữa/phải bất kể `#btn-settings` được chèn động sau cùng trong DOM thật.

Viết `e2e/topnav-minimal-mobile.spec.ts` (2 viewport Pixel 5 + iPhone SE 375×667): topnav
`height ≤ 36px` (bỏ bản sửa ra → fail đúng `received 60`), rời phòng/mã phòng/cài đặt hiện & nằm
trọn trong hộp nav, và bấm rời phòng **thật sự điều hướng** về `index.html` (không chỉ đo
`isVisible()`). `npm test` **1230/1230** (không đổi — thay đổi thuần CSS/markup, JS không có Jest
coverage cho phần này). `?v=` 147→148 (vòng 1)→149 (vòng 2).

**Lỗi quy trình tự phát hiện**: bắt đầu sửa trực tiếp trên `dev` thay vì tạo `fix/*` trước — sửa
giữa chừng bằng `git checkout -b fix/hide-topnav-mobile` (giữ nguyên các thay đổi chưa commit, không
mất gì) trước khi commit đầu tiên.

## Decision

Nhánh `fix/hide-topnav-mobile` off `dev` (đúng exception rule vì #144 chỉ tồn tại trên `dev`, tạo
muộn giữa chừng — xem lỗi quy trình ở trên). Merge một commit vào `dev`.

## Summary output

`TODO.md` #144 ⏳→✅. `docs/todo/B144-*.md` thêm mục "Kết quả cuối" đầy đủ 2 vòng + đính chính nhận
định "trùng cài đặt" sai. `docs/instruction/B144-*.md` đính chính cùng nội dung tại chỗ, không xoá
bản gốc.
