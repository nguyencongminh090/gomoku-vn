# Phần B #37. Timer không chạy trong suốt giai đoạn khai cuộc Swap2, và chạy sai bên

**Nguồn:** báo cáo người dùng — lỗi đếm giờ trong luồng Swap2 (2026-08-04)


37. ~~**Timer không chạy trong suốt giai đoạn khai cuộc Swap2, và chạy sai bên
    sau khi Swap2 resolve**~~
    **✅ ĐÃ XONG (2026-08-04)** — người dùng phát hiện khi test thủ công, đã xem
    sơ đồ luồng Swap2 hiện tại (state diagram + sequence diagram, mermaid) do
    agent dựng từ code, rồi tự chốt hướng sửa: **tính giờ ngay từ lúc bắt đầu
    ván, không có giai đoạn nào được miễn trừ** ("Apply Time manager right
    after START game. Không có ngoại lệ"). **Đọc kỹ `instruction.md` §B37
    trước khi làm — thiết kế có 1 điểm dễ làm sai (nhãn placeholder
    black/white trong lúc màu chưa gán), tóm tắt ở đây chỉ là gạch đầu dòng.**
    - **Lỗi 1 (đã xác nhận):** `startGame()` nhánh `ruleSwap2`
      (`server/socket/handlers/GameHandler.js:576-605`) emit `game:init` với
      `timer: null`, không gọi `startTimerForGame()`. Suốt các phase
      `place3`/`p2choice`/`place2`/`p1choice`, `timerMap` không có entry cho
      phòng đó → không ai bị trừ giờ khi đặt quân mở màn / chọn bên.
    - **Lỗi 2 (đã xác nhận):** `TimerManager` constructor hard-code
      `this.activeColor = 'black'` (`server/managers/TimerManager.js:59`),
      đúng cho ván thường (Đen đi trước) nhưng sai cho Swap2 — luật Swap2 quy
      định **Trắng luôn đi trước** sau khi resolve
      (`GameEngine.js:380`, `_assignColors`). `startTimerForGame()` (gọi tại
      `GameHandler.js:158-159` khi `r.done`) không truyền `activeColor` khởi
      tạo theo `engine.currentTurn` thực tế → timer luôn bắt đầu trừ giờ Đen
      dù đang là lượt Trắng.
    - **Hướng sửa đã chốt:** dùng `firstPlayerId`/`secondPlayerId` (cố định
      suốt khai cuộc) làm nhãn placeholder cho 2 khe đếm `black`/`white` của
      `TimerManager` ngay từ lúc `startGame()` tạo engine Swap2, sau đó
      **remap** nhãn đó sang màu thật khi `_assignColors()` chạy (thêm
      method `remapForSwap2()` mới trên `TimerManager`, không đổi API cũ).
      Switch lượt trong lúc khai cuộc (`game:swap2_place`/`game:swap2_choice`
      handler) qua `timer.switchTurn()` mỗi khi `currentTurn` đổi người.
    - **Đụng tới cả client:** `renderSwap2()`
      (`client/js/game-ui.js`) hiện đang ẩn hẳn turn-bar
      (`setTurnBarVisible(false)`) — phải bật hiển thị + sửa
      `renderTimers()`/tên hiển thị để không dựa vào `player.color` (đang
      `null` lúc chưa gán màu), nếu không đồng hồ chạy đúng ở server nhưng
      người dùng không thấy gì. Bump `?v=N` (rule `CLAUDE.md`) vì đụng
      `client/js/game-ui.js`.
    - **Trạng thái:** đã triển khai đúng hướng đã chốt — xem chi tiết đầy đủ
      trong `docs/fix-log.md` (dòng `2026-08-04 09:52`).
    - **Test:** `server/tests/TimerManager.test.js` — 3 case cho
      `remapForSwap2()` (firstPlayer thật sự là Đen → không hoán đổi;
      firstPlayer hoá ra là Trắng → hoán đổi đúng `black`/`white` +
      `blackPlayerId`/`whitePlayerId`; field khác không bị đụng), mutation
      qua stash → cả 3 đỏ đúng dự kiến → khôi phục xanh lại. `npm test`
      368/368 xanh (was 365). Client-side vẫn chưa có Jest — mở rộng
      `e2e/swap2-opening.spec.ts` với assertion timer thật (turn-bar không
      ẩn, `timerValues.black` giảm thật qua 2.2s trong lúc khai cuộc, đúng
      bên WHITE được `turn-bar__active` sau khi resolve); chạy trên server
      thật ở cổng 3099 (không đụng server thật đang phục vụ Cloudflare
      Tunnel ở 3000). Mutation-check cả assertion e2e bằng stash 3 file sửa
      + restart server → đỏ đúng ngay tại assertion turn-bar ẩn, khớp lỗi
      báo cáo; khôi phục → xanh lại trên chromium.
