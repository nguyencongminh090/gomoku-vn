# B118 — Bàn cờ mobile thỉnh thoảng méo/lệch, responsive không ổn định

**Nguồn:** báo cáo người dùng kèm ảnh chụp màn hình thật (Safari iOS, `play3cr.dpdns.org`,
2026-08-14) — "UI sometimes become unstable and distort/wrong responsive".

**Trạng thái:** ✅ Đã sửa (phòng ngừa, chưa tái hiện được để xác nhận triệt để).

Người dùng không có thiết bị Safari iOS để tái hiện trực tiếp; sau khi được hỏi, chốt hướng "sửa
phòng ngừa ngay, ghi rõ chưa tái hiện được, nhờ người dùng gốc xác nhận sau khi deploy" thay vì chờ
vô thời hạn có thiết bị test. Xem thảo luận trong hội thoại 2026-08-14.

## Mô tả

Bàn cờ (`BoardRenderer`) trong phòng chơi thỉnh thoảng bị méo/lệch trên điện thoại (không xảy ra
lúc load trang, mà "thỉnh thoảng" trong lúc dùng), tự hết khi có tương tác khác (đi quân, đổi tab)
vô tình gọi lại resize.

## Nguyên nhân gốc (điều tra qua CodeGraph + agent, chưa đo trực tiếp trên thiết bị thật)

1. `client/css/room.css:58` (và `room-zen.css:302,955`) dùng `calc(100vh - 76px)` cho
   `.board-area-shell` — chưa dùng `dvh`/`svh`. Trên Safari iOS, `100vh` neo theo viewport lớn nhất
   (thanh địa chỉ ẩn); mỗi lần thanh địa chỉ hiện/ẩn khi cuộn → nhiều sự kiện `resize` bắn liên tiếp
   trong lúc trình duyệt đang animate.
2. `client/js/game-ui.js:113-114`:
   ```js
   window._boardResizeHandler = () => { if (S().boardRenderer) S().boardRenderer.resize(); };
   window.addEventListener('resize', window._boardResizeHandler);
   ```
   Không debounce/throttle — mỗi sự kiện `resize` chạy full `BoardRenderer.resize()`
   (`client/js/board.js:131-288`, đọc `getComputedStyle`/`clientWidth`/`getBoundingClientRect`, ghi
   `canvas.width/height`).
3. Nếu `resize()` chạy đúng lúc thanh địa chỉ iOS đang animate, nó đọc phải `innerHeight` trung
   gian (chưa ổn định) và "đóng băng" kích thước canvas theo giá trị sai đó — không có lần tính lại
   khi animation kết thúc.
4. `_computeGeometry()` (`board.js:300`) đọc `window.innerWidth` độc lập với `resize()`, một điểm
   phân kỳ khác nếu 2 lần đọc rơi vào 2 thời điểm khác nhau của cùng 1 lần toolbar animate.
5. Không dùng `visualViewport` API ở đâu trong codebase (tín hiệu đáng tin hơn cho ẩn/hiện toolbar
   mobile).

## Tiền lệ liên quan

`docs/fix-log/2026-08-13-zen-room-board-sizing-and-chat-input.md` — bug canvas không vuông
(825×875) ở đúng cụm `resize()`/đo shell này (đã sửa, nguyên nhân là border đặt sai element). Lần
sửa đó còn thêm nhiều điểm gọi `resize()` khác (`setTimeout(180/400)`, `requestAnimationFrame`,
`refitBoardAfterDrawer()` ở `client/js/room.js:119-127,170-184`) không đồng bộ với nhau — nên các
lần gọi có thể chồng/đua nhau khi trùng lúc socket reconnect hoặc chuyển tab.

Cũng liên quan `docs/instruction.md` B90 — đã có tiền lệ bỏ
`requestAnimationFrame(() => boardRenderer.resize())` khỏi `updateBoardState()` ở
`tournament-match.js` vì gây tự động scroll; cùng họ vấn đề "gọi resize không kiểm soát thời điểm".

## Sửa đã áp dụng (2026-08-14)

- `client/css/room.css:59` và `client/css/room-zen.css:302` — thêm dòng `height: calc(100dvh - ...)`
  ngay sau dòng `100vh` gốc (giữ `100vh` làm fallback cho browser không hỗ trợ `dvh` — cascade CSS tự
  nhiên ghi đè, không cần `@supports`).
- `client/js/game-ui.js:113-125` — `window resize` listener gate qua `requestAnimationFrame` với cờ
  `window._boardResizePending`, đảm bảo chỉ 1 lệnh `BoardRenderer.resize()` đang chờ chạy tại một
  thời điểm thay vì chạy đồng bộ mỗi sự kiện `resize`.
- `?v=` 120 → 121 (toàn bộ `client/*.html` + `client/js/*.js`, xác nhận bằng grep theo `CLAUDE.md`).
- Không đụng `visualViewport` API — để dành nếu 2 bước trên không đủ sau khi người dùng xác nhận
  thật.
- Không đụng `tournament-match.js`/`tournament-match.html` — báo cáo gốc chỉ có ảnh `room.html`.

## Đánh giá hiệu quả/an toàn

**Chưa đo/xác nhận trên thiết bị thật** — người dùng không có Safari iOS hay iPhone để tái hiện.
Theo quyết định của người dùng (2026-08-14), sửa được tiến hành như phòng ngừa dựa trên hành vi đã
biết rõ của WebKit/Safari (`100vh` neo theo viewport lớn nhất khi toolbar ẩn, gây nhiều sự kiện
`resize` liên tiếp lúc toolbar animate) thay vì chờ có thiết bị. Rủi ro kỹ thuật thấp: thay đổi cục
bộ (CSS unit thêm + debounce), không đụng logic game/board state, dễ rollback nếu người dùng gốc
báo cáo lại vẫn còn lỗi hoặc phát sinh vấn đề mới.

**Cần người dùng gốc (báo cáo ảnh Safari iOS) xác nhận sau khi deploy** — nếu vẫn còn lỗi, quay lại
hướng `visualViewport` API hoặc điều tra thêm các điểm gọi `resize()` khác (`room.js`,
`room-socket.js`) chưa được gate.

## Trạng thái unit test

Không có — vấn đề thuần client-side responsive/CSS, không có test infra cho `client/js/` (theo rule
"Bug-fix workflow" trong `CLAUDE.md`). Chưa verify bằng browser thật (Chromium DevTools mobile
emulation không mô phỏng đúng hành vi toolbar `100vh` của Safari iOS) — đây là giới hạn đã biết,
không phải bỏ sót.
