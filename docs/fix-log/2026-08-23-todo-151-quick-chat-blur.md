# Fix log entry — 2026-08-23 20:54

## Prompt

Báo cáo người dùng (2026-08-22): trên mobile, bấm vào quick-chat rồi bấm lại bàn cờ, khung chat vẫn
giữ focus, khiến màn hình tự cuộn xuống chat.

## Action

`docs/todo/B151-*.md` xác định vị trí: `client/js/room.js:317-325` (khai báo `quickChatInput`) chỉ có
listener gửi tin (`click`/Enter), không có gì gỡ focus khi người dùng chạm nơi khác. Khác chiều với
B104 (đã đóng — B104 là bàn cờ vô tình *tạo* focus cho chat qua ghost click; B151 là chat *giữ* focus
không được gỡ), không phải trùng lặp.

Sửa: thêm listener `pointerdown` trên `#board-area-shell` (container ổn định, không bị `GameUI` thay
thế toàn bộ như `#board-area`), tự `blur()` `quickChatInput` nếu nó đang là `document.activeElement`.
Dùng `pointerdown` chứ không phải `click` — bài học từ B104, `click` trên mobile tới muộn ~300ms sau
touch. Không đụng luồng gửi tin (`sendChatFrom()` tự lo trim/xoá value, blur không can thiệp).

Rà soát các widget input khác trong `client/js/` theo yêu cầu người dùng: `#chat-input` (room +
tournament-match) nằm trong `.panel-right-shell`, khi mở trên mobile che kín bàn cờ (`z-index: 700`)
nên không thể vừa gõ vừa chạm bàn cờ cùng lúc — không tái hiện được lỗi này; khi drawer collapse,
`syncDrawerInert()` đã tự chuyển focus ra khỏi vùng `inert` từ trước. Input trong modal của
`tournament-detail.js` không có bàn cờ trên trang đó. Kết luận: `#quick-chat-input` là widget duy
nhất thiếu cơ chế gỡ focus.

## Decision

Sửa đúng phạm vi báo cáo gốc ("bấm bàn cờ"), không tự mở rộng sang "bấm bất kỳ đâu ngoài
quick-chat-bar". Không viết unit test — `client/js/` không có test infra, nói rõ trong
`docs/instruction/B151-*.md` đúng rule "Bug-fix workflow" của `CLAUDE.md`.

## Summary output

Verify bằng Playwright thật trên viewport mobile (`devices['Pixel 5']`, guest login qua UI thật → tạo
phòng qua `#btn-quick-match` → focus `#quick-chat-input` → giả lập tap `#board-area-shell` bằng
`mouse.down()/up()`): `document.activeElement.id` đổi từ `quick-chat-input` → rỗng sau tap. `npm test`
1256/1256 pass, không hồi quy. Bump `?v=150→151` toàn repo, grep completion-check trong `CLAUDE.md`
xác nhận đúng 1 giá trị `?v=151`.

`TODO.md` #151 → ✅, `docs/todo/B151-*.md` + `docs/instruction/B151-*.md` mới. Bug fix chạm code
dev-only (`#quick-chat-input` không tồn tại trên `main`) — theo ngoại lệ branch trong `git-workflow`
skill, commit trên `fix/quick-chat-input-focus` off `dev`, merge lại vào `dev`.
