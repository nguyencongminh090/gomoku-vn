# Fix log entry — 2026-08-22 11:01

## Prompt

Người dùng: "Do #142" — nhưng #142 đã merge vào `dev` trước đó (commit `2282b73`). Hỏi lại qua
`AskUserQuestion`, người dùng chọn làm tiếp **#143** (mục ⏳ kế tiếp trong `TODO.md`, do chính bản
sửa #142 làm lộ ra).

## Action

Đọc `instruction.md` §B143 trước khi làm (theo quy tắc bug-fix workflow): ràng buộc là **không** hạ
`min-width/min-height: 32px` của `.slot-card__stand` mà không kiểm chứng chạm thật trên mobile,
**không** gỡ `minmax(0, 1fr)` của #142, giữ ellipsis làm dự phòng. `docs/todo/B143-*.md` liệt kê 3
hướng chưa chốt — hỏi người dùng qua `AskUserQuestion` (đúng flag "cần bàn trước khi làm" trong chính
tài liệu #143), chọn: đưa `✕` ra khỏi dòng tên bằng `position: absolute`.

Đổi `client/css/room.css`: `.slot-card` thêm `position: relative`; `.slot-card__stand` từ flex-child
(`flex-shrink:0`) sang `position: absolute; top: 0; right: 0` (giữ nguyên `min-width/min-height:
32px`); `.slot-card__header` thêm `padding-top: 18px` áp đều cho cả hai ghế (có nút hay không) để
dòng tên không lệch chiều cao giữa hai ghế.

Verify trên instance cô lập (copy repo tại chỗ, không đụng DB thật — db tạm theo
`playwright-e2e-safety`, cổng 3111, `CORS_ORIGIN`/`AUTH_LIMITER_MAX`/`MAX_ROOMS_PER_IP` override chỉ
cho phiên chạy này): script Playwright thủ công đăng ký 2 tài khoản thật tên 23 ký tự, đo
`clientWidth` của `.slot-card__name` ở ghế có nút vs không nút, 2 viewport (1920, 1280). Trước sửa:
40px vs 78px (khớp mô tả bug gốc `Ngu…` vs `Trần Hoàn…`). Sau sửa: 78px cả hai, không chồng lấp giữa
`.slot-card__name` và `.slot-card__stand`.

Viết test e2e mới `e2e/slot-card-stand-name-symmetry.spec.ts` (2 kịch bản theo 2 viewport) dựa cùng
khuôn fixture tài khoản-thật-tên-dài với `e2e/drawer-rail-not-displaced.spec.ts` (#142). Xác nhận
test không rỗng bằng cách `git stash` riêng `client/css/room.css` (giữ các thay đổi khác) — 1/2 kịch
bản fail đúng như dự đoán (`own-seat name width (40px) must match opponent-seat name width (78px)`),
kịch bản còn lại timeout đăng ký (rate-limit từ nhiều lần đăng ký liên tiếp trong phiên, không liên
quan code); `git stash pop` khôi phục bản sửa, cả hai kịch bản pass. Chạy lại cùng
`drawer-rail-not-displaced.spec.ts` (#142) — 2/2 vẫn pass, xác nhận không tái phát #142.

`npm test` **1230/1230** (không đổi số so với trước, thay đổi thuần CSS không đụng code có Jest
coverage). `?v=` 144→145 toàn repo (grep xác nhận đúng 1 giá trị).

## Decision

Nhánh `fix/slot-card-stand-squeezes-name` off `dev` (theo exception rule của `git-workflow` skill:
mục #143 chỉ tồn tại trên `dev`, không có trên `main`). Merge một commit vào `dev`, không merge
`main` (chưa được yêu cầu).

## Summary output

`TODO.md` #143 chuyển ⏳→✅, `docs/todo/B143-*.md` cập nhật trạng thái + hướng đã chọn + kết quả đo.
`instruction.md` §B143 giữ nguyên (không có marker done/not-done, chỉ là execution guidance).
