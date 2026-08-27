# B151 — Mobile: `#quick-chat-input` giữ focus sau khi bấm lại bàn cờ, gây tự cuộn xuống chat

**Trạng thái:** ✅ ĐÃ XONG (2026-08-22) — thêm listener `pointerdown` trên `#board-area-shell`
(`client/js/room.js`, ngay sau khối quick-chat) tự `blur()` `quickChatInput` nếu nó đang là
`document.activeElement`. Dùng `pointerdown` chứ không phải `click` (bài học từ B104 — `click` mobile
tới muộn ~300ms sau touch). Không đụng luồng gửi tin (`sendChatFrom()` tự lo trim/xoá value, blur
không can thiệp). Bump `?v=150→151` toàn repo (đúng grep completion-check trong `CLAUDE.md`).
**Không viết unit test** — `client/js/` không có test infra (đã nói rõ trong `docs/instruction/
B151-*.md`, đúng rule "Bug-fix workflow" của `CLAUDE.md`). **Verify bằng Playwright thật trên viewport
mobile** (`devices['Pixel 5']`, guest login qua UI thật → tạo phòng qua `#btn-quick-match` →
`page.focus('#quick-chat-input')` → giả lập tap vào `#board-area-shell` bằng `mouse.down()/up()`):
`document.activeElement.id` đổi từ `quick-chat-input` → rỗng (blur thành công) sau tap. `npm test`
1256/1256 pass (không hồi quy). **Rà soát các widget khác** (theo yêu cầu người dùng): grep toàn bộ
`client/js/*.js` cho các input text/textarea còn lại — chỉ có `#chat-input` (room + tournament-match)
và các input trong modal `tournament-detail.js`. `#chat-input` nằm trong `.panel-right-shell`, khi mở
trên mobile **che kín toàn bộ bàn cờ** (`z-index: 700`, tự động phủ lên cả `.quick-chat-bar` lẫn
`.float-messages`) nên không thể vừa gõ chat vừa chạm bàn cờ cùng lúc — không tái hiện được lỗi này;
và khi drawer collapse, `syncDrawerInert()` (`room.js:143-166`) đã tự chuyển focus ra khỏi vùng bị
`inert` từ trước. Các input trong `tournament-detail.js` nằm trong modal, không có bàn cờ trên trang
đó. Kết luận: `#quick-chat-input` là widget **duy nhất** thiếu cơ chế gỡ focus — không có widget nào
khác cần sửa tương tự.

**Severity:** Medium
**Platform:** Mobile (phone browsers), skin `zen-room`
**Pages affected:** `room.html`
**Reported by:** User (báo cáo trực tiếp, 2026-08-22)

---

## Symptom (nguyên văn báo cáo)

> Khi User đang bấm vào khung chat (quick chat), khung chat sẽ active, khi User bấm trở lại bàn cờ,
> khung chat vẫn còn active. Vì thế, screen sẽ tự nhảy xuống khung chat.
>
> Expect: Khi user bấm vào bàn cờ, khung chat tự động gỡ active.
>
> Note: Active ở đây hiểu là **focus** — khung chat vẫn giữ focus ngay cả khi người dùng đã bấm lại
> bàn cờ.

Đây là **hướng ngược lại** với B104 (đã đóng 2026-08-11): B104 là bàn cờ vô tình làm chat *được*
focus (ghost click do thiếu `preventDefault`/`touch-action`). Báo cáo này là chat *đã* được focus chủ
động bởi người dùng, rồi bấm lại bàn cờ nhưng **không có gì gỡ focus đó** — khác defect, cùng khu vực
UI, không phải trùng lặp của B104.

---

## Vị trí trong code (đã xác định qua đọc code, chưa sửa)

- `client/js/room.js:317-325` — nơi khai báo `quickChatInput`/`quickChatSend` (mobile quick-chat bar,
  độc lập với `#chat-input` trong tab Chat đầy đủ). Chỉ có listener cho `click` (nút gửi) và `keydown`
  Enter — **không có listener nào gỡ focus khỏi `quickChatInput` khi người dùng tương tác với nơi
  khác** (bàn cờ, hay bất kỳ đâu ngoài quick-chat-bar).
- `client/room.html:200-203` — markup `#quick-chat-bar` / `#quick-chat-input`.
- `client/css/room-zen.css:1110-1148` — `.quick-chat-bar` là `position: fixed`, luôn nổi phía trên
  rail icon, không tự cuộn theo trang. Tức bản thân thanh chat **không di chuyển** — hiện tượng "màn
  hình tự nhảy xuống khung chat" nhiều khả năng là trình duyệt mobile tự cuộn viewport để giữ phần tử
  đang giữ focus (`quickChatInput`) nằm trong vùng nhìn thấy phía trên bàn phím ảo, mỗi khi layout đổi
  (bàn phím đóng/mở, `board.js`/`board-renderer` resize canvas sau nước đi) — vì input **chưa từng bị
  blur**, trình duyệt coi nó vẫn là mục tiêu cần giữ trong khung nhìn.
- Không tìm thấy bất kỳ `.blur()` hay theo dõi `document.activeElement` nào liên quan tới
  `#quick-chat-input` hoặc `#game-canvas` trong `client/js/room.js`, `client/js/board.js`,
  `client/js/room-ui.js` (đã grep `activeElement|\.blur(|quick-chat-bar` trên cả 3 file).
- Chỉ `room.html`/`zen-room` có `.quick-chat-bar` — `tournament-match.html` không có thanh quick-chat
  tương đương (đã grep `client/css/*.css` và `tournament-match.js`), nên phạm vi báo cáo này chỉ giới
  hạn ở phòng chơi thường trên mobile.

---

## Hướng sửa gợi ý (chưa triển khai, để người thực hiện B151 tự xác nhận lại)

Thêm gỡ focus tường minh cho `quickChatInput` khi người dùng chạm/bấm ra ngoài thanh quick-chat —
ứng viên: lắng nghe `pointerdown`/`touchstart` trên `#board-area` (hoặc canvas bàn cờ) trong
`room.js`, gọi `quickChatInput.blur()` nếu nó đang là `document.activeElement`. Cân nhắc phạm vi rộng
hơn nếu người dùng xác nhận (bấm ra bất kỳ đâu ngoài `.quick-chat-bar`, không chỉ riêng bàn cờ) —
xem `docs/instruction/B151-*.md` để biết ràng buộc/cạm bẫy cần tránh trước khi chọn.

---

## Kiểm chứng cần làm khi triển khai

1. Mobile thật (hoặc DevTools device emulation với touch), skin `zen-room`.
2. Bấm `#quick-chat-input`, gõ vài ký tự, bàn phím ảo hiện lên.
3. Bấm ra bàn cờ (khi đang lượt mình lẫn không phải lượt mình, cả pre-game/spectator).
4. Kỳ vọng: `document.activeElement` không còn là `quickChatInput`, bàn phím ảo đóng lại, trang không
   tự cuộn xuống khung chat.
5. Xác nhận gõ Enter hoặc bấm nút gửi trong quick-chat vẫn hoạt động bình thường (không bị blur sớm
   phá luồng gửi tin — thứ tự `blur` vs `click`/`keydown` cần kiểm tra kỹ, xem instruction).
