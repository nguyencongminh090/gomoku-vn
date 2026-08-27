# B136 — Reopen #134: drawer thu vào rail khi modal hiện lên

**Nguyên tắc số 1:** không vá thêm một lớp nữa ở nơi triệu chứng hiện ra. #134 đã là một vòng vá như
vậy (thêm listener gỡ class ở `room.js`) và bug quay lại với mô tả rộng hơn — đúng dạng lặp mà
`CLAUDE.md` → "Root-cause diagnosis" cảnh báo. Bắt buộc có bằng chứng runtime trước khi sửa.

## Cách lấy bằng chứng

```js
new MutationObserver(() => console.trace('BODY CLASS →', document.body.className))
  .observe(document.body, { attributes: true, attributeFilter: ['class'] });
```

Chạy trong Playwright (browser binaries có sẵn ở `$PLAYWRIGHT_BROWSERS_PATH`), tuân thủ
`playwright-e2e-safety`: không đụng DB thật, không tự cài lại browser.

Kịch bản phải bao gồm: 2 client vào phòng → ngồi ghế → bắt đầu → kết thúc ván (đầu hàng) → modal
"Sẵn sàng vào trận?" hiện lại. Đo `getBoundingClientRect()` của `.panel-right-shell` **trước và sau**
khi modal hiện, ở viewport ≥1024px.

## Nghi phạm số 1 và hướng sửa nếu xác nhận

`renderUsersList()` (`room-ui.js:488-495`) và `renderScoreTable()` (`room-ui.js:544-549`) bắn
`chatBtn.click()` để "không bỏ rơi người dùng trên tab vừa biến mất". Click tổng hợp đó chạy vào
handler tab (`room.js:139-172`) — nơi có nhánh
`document.body.classList.toggle('zen-drawer-collapsed', !collapsedNow)` dành cho thao tác **người
dùng bấm lại tab đang mở**. Đó là hai ý định khác nhau đi chung một đường.

Nếu xác nhận: sửa đúng chỗ là **tách ý định khỏi sự kiện DOM** — rút phần đổi tab ra thành
`activateTab(tabId)` thuần (không đụng drawer), handler click gọi `activateTab()` + xử lý toggle,
còn hai call-site trong `room-ui.js` gọi thẳng `activateTab('tab-chat')`. **Không** dùng cờ kiểu
`isSyntheticClick` — nó chỉ giấu vấn đề dưới một biến trạng thái mới.

Nếu **không** xác nhận: đừng đoán tiếp — mở rộng instrument (log cả `e.isTrusted` của mọi click vào
`.tab-btn`, log mọi lần `game:init` kèm `window.innerWidth`) rồi mới kết luận.

## Boundary — không đụng

- Bản sửa #134 ở `room.js:135-140` (đúng cho đường vào của nó, có 4 test bảo vệ).
- Breakpoint 768px và auto-collapse mobile ở `room-socket.js:193-196`.
- Cơ chế width / `overflow:hidden` / `justify-content:flex-end` của `.panel-right-shell`
  (`room-zen.css:408-448`) — cố ý tránh reflow chữ khi drawer co giãn.

## Test

`client/tests/` có sẵn hạ tầng jsdom (xem `room-zen-drawer-collapsed-recovery.test.js` của #134).
Fix phải kèm test ở đó: "click tổng hợp đổi tab không được đổi trạng thái collapsed của drawer",
theo decision table tab-đang-active × drawer-mở/đóng.
