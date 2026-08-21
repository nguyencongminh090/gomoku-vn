# B134 — Sửa "sidebar-tab thụt vào trong" khi redraw

Hướng dẫn thực thi cho TODO.md #134 (đã làm — `fix/sidebar-drawer-collapsed-stuck` off `main`,
2026-08-21).

## Trước khi bắt đầu

- Đọc `docs/todo/B134-sidebar-tab-thut-vao-trong-khi-redraw.md` — mục "Nguyên nhân gốc — ĐÃ XÁC
  NHẬN": người dùng tái hiện lại kèm DevTools, chụp được `<body class="zen-room
  zen-drawer-collapsed">` trong khi viewport thật là 1920×935. Đừng điều tra lại từ đầu — nguyên
  nhân đã rõ, phần dưới đây là hướng dẫn viết bản sửa.

## Nguyên nhân (tóm tắt, xem chi tiết ở docs/todo)

`client/js/room-socket.js:193-196` check **một lần duy nhất**
`window.matchMedia('(max-width: 768px)').matches` lúc `game:init` (bắn lại ở mỗi ván, kể cả ván tái
đấu) và thêm `zen-drawer-collapsed` nếu đúng lúc đó viewport ≤768px. **Không có chỗ nào gỡ class
này khi viewport rộng trở lại** — bẫy một chiều. Điểm gỡ duy nhất khác là người dùng chủ động bấm
lại tab đang active (`client/js/room.js:125-157`).

## Cách tiếp cận khi làm

1. **Không đổi breakpoint 768px hay ý nghĩa auto-collapse trên mobile lúc `game:init`** — hành vi
   đó có chủ đích (comment tại `client/js/room.js:105-110`: nhường chỗ ngang cho bàn cờ ngay khi
   ván bắt đầu). Chỉ thêm cơ chế để **gỡ** class khi viewport đã thực sự rộng ra, không sửa lúc nó
   được **thêm**.
2. Hướng khuyến nghị: dùng `window.matchMedia('(max-width: 768px)')` (giữ 1 instance, không tạo mới
   mỗi lần) + `.addEventListener('change', handler)`. Trong `handler`, chỉ **gỡ**
   `zen-drawer-collapsed` khi `!mql.matches` (viewport đã vượt breakpoint) — **không** tự thêm lại
   khi `mql.matches` trở thành true (đừng tự ý collapse khi người dùng đang mobile và đã chủ động mở
   drawer ra bằng tay) — chỉ auto-collapse vẫn diễn ra đúng 1 lần lúc `game:init` như hiện tại.
   Đặt việc đăng ký listener ở `client/js/room.js` (cùng chỗ với logic tab/drawer hiện có) hoặc
   `client/js/room-socket.js` (cùng chỗ đang set class) — chọn 1 chỗ, không trùng lặp 2 nơi.
3. **Không đổi cơ chế co giãn hiện tại** của `.panel-right-shell` (width + `overflow:hidden` +
   `flex-end`, `client/css/room-zen.css:408-455`, cố ý tránh reflow chữ — xem comment tại chỗ) sang
   `transform`. Đây là bugfix về **thời điểm gỡ class**, không phải đổi kiến trúc CSS.
4. Không đụng gì trong `client/css/room-zen.css` mobile bottom-sheet block (đã qua 3 vòng tinh chỉnh
   ở #133, breakpoint ≤768px) — bản sửa này thuần JS, thêm 1 listener.
5. Bump `?v=N` toàn bộ theo quy tắc cache-busting `CLAUDE.md` (đụng `client/js/room.js` hoặc
   `client/js/room-socket.js`), verify bằng:
   ```
   grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
   ```
6. Theo `git-workflow` skill: nhánh `fix/*` off `main` (không làm trên nhánh
   `fix/paper-symbol-size-increase` đang mở cho việc khác).

## Xác minh

- `client/js/` không có hạ tầng test tự động cho việc này — nói rõ điều đó thay vì bỏ qua im lặng.
- Xác minh bằng Playwright (theo `playwright-e2e-safety` skill, instance cô lập không đụng DB/server
  thật): set viewport ≤768px, emit/trigger `game:init`, xác nhận `zen-drawer-collapsed` được thêm;
  sau đó resize viewport về >768px (Playwright `page.setViewportSize`), xác nhận class **tự gỡ**
  không cần người dùng bấm gì; đồng thời xác nhận trên desktop viewport (>768px) không có kịch bản
  nào tự thêm class ngoài ý muốn (regression check cho đúng bug đã báo cáo).
- Xác nhận không phá hành vi mobile hiện có: viewport ≤768px lúc `game:init` vẫn auto-collapse như
  cũ; người dùng bấm lại tab active trên mobile vẫn toggle mở/đóng thủ công bình thường.
