## B151 — hướng dẫn thực hiện

**Đừng nhầm với B104.** B104 là bàn cờ vô tình *tạo ra* focus cho chat (ghost click sau `touchend`
không gọi `preventDefault`). B151 là chiều ngược lại: chat *đã* được focus chủ động, và không có gì
*gỡ* focus đó khi người dùng chuyển sự chú ý sang bàn cờ. Sửa B104 không tự động sửa B151 và ngược
lại — kiểm tra cả hai kịch bản khi verify.

**Trật tự sự kiện `blur` vs nút gửi/Enter — cạm bẫy chính.** Nếu gắn listener `blur` trực tiếp lên
`quickChatInput` để tự làm sạch state khi mất focus, nhớ rằng bấm nút `#quick-chat-send` cũng khiến
input mất focus (chuột/tap rời khỏi input) — `blur` sẽ bắn *trước* `click` trên nút gửi. Đừng để logic
blur xoá nội dung input hay chặn gửi tin trong trường hợp đó; `sendChatFrom()` (`room.js:293-302`) đã
tự `trim()`/tự xoá `inputEl.value` sau khi gửi nên không cần blur can thiệp vào luồng gửi — chỉ cần
đảm bảo hướng sửa **không thêm side-effect nào vào bản thân sự kiện blur ngoài việc để trình duyệt tự
đóng bàn phím**.

**Cách gỡ focus đúng: bấm ra ngoài, không phải "mất tương tác".** Hướng đúng là lắng nghe tương tác
trên khu vực bàn cờ/board-area (`pointerdown` hoặc `touchstart`, không dùng `click` vì `click` mobile
tới muộn ~300ms sau touch, đã học từ B104) rồi gọi `quickChatInput.blur()` **chỉ khi** nó đang là
`document.activeElement` — đừng gọi `.blur()` vô điều kiện mỗi lần bàn cờ được chạm, tốn một lệnh DOM
thừa và có thể can thiệp focus của phần tử khác nếu code sau này thay đổi thứ tự gọi.

**Phạm vi "bấm ra ngoài": chỉ bàn cờ hay bất kỳ đâu?** Báo cáo gốc nói cụ thể "bấm trở lại bàn cờ".
Đừng tự mở rộng sang "bấm bất kỳ đâu ngoài quick-chat-bar" (vd. bấm rail icon, bấm khu panel phải) trừ
khi xác nhận lại với người dùng — đúng theo rule "Bug-fix workflow: scope discipline" trong
`CLAUDE.md`. Nếu thấy hướng mở rộng hợp lý hơn khi đọc code thực tế lúc làm, ghi lại phát hiện đó
riêng (TODO.md mục mới) thay vì âm thầm gộp vào phạm vi B151.

**`.quick-chat-bar` là `position: fixed` — đừng đi tìm bug ở CSS scroll.** Đã xác minh
(`room-zen.css:1110-1148`) thanh quick-chat không tự di chuyển theo scroll của trang; hiện tượng "màn
hình tự nhảy xuống" nhiều khả năng là hành vi mặc định của trình duyệt mobile giữ phần tử đang focus
trong khung nhìn phía trên bàn phím ảo — **giả thuyết, chưa đo được bằng thiết bị thật**. Nếu sau khi
sửa (thêm blur) mà hiện tượng cuộn vẫn còn, quay lại đo root cause thật (rule "Root-cause diagnosis"
trong `CLAUDE.md`) thay vì coi việc thêm blur là đã xong — có thể còn một layer khác (vd.
`board-renderer.resize()` gọi `scrollIntoView` gián tiếp, tương tự B90 ở tournament-match) chưa lộ ra
qua đọc code tĩnh.

**Không có test infra cho `client/js/`.** Theo `CLAUDE.md` mục "Bug-fix workflow", khu vực này hiện
không có unit test coverage — nói rõ điều đó trong summary khi đóng B151 thay vì bỏ qua im lặng; nếu
muốn thêm coverage thật, cần dựng test DOM (jsdom) mô phỏng focus/blur + `pointerdown`, không phải bắt
buộc nhưng nên cân nhắc vì đây đúng dạng logic dễ hồi quy (một refactor `room.js` sau này xoá nhầm
listener sẽ không có gì báo động).

**Kiểm chứng bắt buộc trên thiết bị/emulation thật có touch**, không chỉ đọc code — theo rule "Feature
completion checklist" trong `CLAUDE.md`, verify bằng browser thật (`playwright-e2e-safety` skill nếu
dùng Playwright, hoặc `run` skill) trước khi đánh dấu B151 xong. Devtools resize thường (không giả
lập touch) không tái hiện được hành vi bàn phím ảo/scroll của Safari iOS hay Chrome Android thật —
[chi tiết](docs/todo/B151-quick-chat-input-giu-focus-sau-khi-tap-board.md).
