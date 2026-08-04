# §40. `room.html` không `?id=` freeze ở overlay "Đang vào phòng" (TODO.md #40)

## §40 — `room.html` không `?id=` freeze ở overlay "Đang vào phòng" (TODO.md #40)

**Bối cảnh phát hiện:** người dùng báo dán link `room.html` trần (không tạo
phòng trước) → màn hình đứng im, không fallback về sảnh chờ. Đã xác nhận
bằng đọc `client/js/room-socket.js:377-398` (`processRoomIntent`) và
`client/room.html:45-50` (`#room-entry-overlay`).

**Chỗ cần sửa:** `processRoomIntent()` trong
`client/js/room-socket.js:393-397` — nhánh `else` hiện tại:
```javascript
} else {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');
  if (roomId) client.emit('room:join', { roomId });
}
```
Thêm `else` fallback khi `!roomId`: redirect `window.location.href =
'index.html'`. Đây là toàn bộ phạm vi sửa — **không cần đổi** nhánh
`intent.action === 'create'`/`'join'` phía trên, không cần đổi
`#room-entry-overlay` hay `hideEntryOverlay()`.

**Cân nhắc UX nhỏ trước khi sửa (hỏi người dùng nếu muốn khác):** redirect
ngay lập tức không hiện thông báo gì — có thể người dùng muốn 1 toast ngắn
kiểu "Thiếu mã phòng, đưa bạn về sảnh chờ" trước khi chuyển trang (tham khảo
pattern đã có ở `room:kicked`/`room:destroyed` trong cùng file, dùng
`showToast` + `setTimeout` 1500ms). Không tự quyết định thêm toast nếu không
được yêu cầu — giữ bug-fix tối giản theo đúng nội dung `TODO.md` #40 trừ khi
người dùng xác nhận muốn có thông báo.

**Không đụng:** `client/room.html` cấu trúc overlay, luồng `sessionStorage
gvn_room_intent` (được set từ `index.html` lúc tạo/join phòng — không phải
nguồn của bug này).

**Test dự kiến:** `client/js/` chưa có Jest — verify bằng Playwright
(`e2e/`) case mới: mở `room.html` không query string, assert URL cuối cùng
là `index.html`. Không viết test tay rồi xoá — giữ lại theo rule
"Bug-fix workflow" trong `CLAUDE.md`.

---
