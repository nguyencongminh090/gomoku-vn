# Phần B #36. Redesign Start Modal + bỏ Game-End Modal, đổi cơ chế đếm-trượt cho

**Nguồn:** yêu cầu người dùng — redesign Start Modal & luồng ready/kết-thúc-ván (2026-08-04)


36. **Redesign Start Modal + bỏ Game-End Modal, đổi cơ chế đếm-trượt cho
    ready-window** — người dùng xem sơ đồ luồng "bắt đầu ván" hiện tại
    (mermaid) và đánh giá UX chưa tốt, tự đề xuất thiết kế mới, đã hỏi lại
    3 vòng làm rõ trực tiếp trước khi ghi mục này. **Đọc kỹ
    `instruction.md` §B36 trước khi làm — thiết kế khá tinh vi (máy trạng
    thái đếm-trượt 3 lần), tóm tắt ở đây chỉ là gạch đầu dòng.**
    - **Đổi thời điểm mở đếm ngược:** hiện tại cả 2 ngồi đủ ghế là tự động mở
      đếm ngược 30s (`syncReadyWindow`). Mới: đủ 2 ghế chỉ đứng yên chờ, đếm
      ngược **15s** chỉ mở khi **1 người bấm "Bắt đầu" trước**.
    - **Cơ chế 3 lần trượt:** hết 15s mà người còn lại chưa bấm → tính 1 lần
      trượt, quay lại chờ (không tự mở lại đếm ngược). Trượt đủ 3 lần → kick
      đúng người không bấm ở lần thứ 3, người kia được giữ ghế. Bất kỳ thay
      đổi tư cách ngồi nào ở 1 trong 2 ghế (đứng dậy/kick/rời phòng, kể cả
      giữa chừng 1 vòng đếm chưa hết hạn) → reset bộ đếm về 0, coi là cặp
      ghế mới.
    - **Modal nhỏ lại:** bỏ backdrop full-screen của `#start-modal`, định vị
      **giữa bàn cờ** thay vì che cả màn hình — người dùng vẫn bấm được nút
      đứng dậy trên ghế (`.slot-card__stand`, đã có sẵn) và dùng chat bình
      thường trong lúc modal hiện.
    - **Bỏ hẳn `#game-overlay`** (modal công bố Thắng/Thua/Hoà + nút "Đấu
      lại"/"Đóng") — không cần công bố thắng/thua vì bàn cờ đã tô nước thắng
      (`_drawWinHighlight`); case Hoà chỉ cần cải thiện toast/system-chat,
      không cần modal. Kết thúc ván = coi như "cặp ghế mới", chạy lại đúng
      luồng B36 từ đầu — **không còn phân biệt ván đầu tiên và rematch** (cố
      ý đảo ngược 1 ranh giới cũ từng ghi ở B35, xem lý do trong
      `instruction.md` §B36).
    - **Phạm vi đụng tới:** `server/socket/state.js` (`syncReadyWindow`,
      `handleReadyWindowTimeout`, `READY_WINDOW_MS`), `server/managers/
      RoomManager.js` (`forceUnreadyPlayersToStand`, cần state
      `readyMissCount` mới trên room), `server/socket/handlers/
      GameHandler.js` (`handleGameEnd`, bỏ `game:rematch` đặc biệt),
      `client/room.html` (`#start-modal` CSS + xoá `#game-overlay`),
      `client/js/room-ui.js` (`renderStartModal`, xoá `showGameOverlay`),
      `client/js/room.js` (xoá `btnRematch`/`btnCloseOverlay`, hoặc đổi mục
      đích). Nhớ bump `?v=N` (rule `CLAUDE.md`) vì đụng cả `client/css/` lẫn
      `client/js/`.
    - **Trạng thái:** ✅ ĐÃ XONG (2026-08-04) — xem `docs/fix-log.md` (hàng
      `2026-08-04 04:23`) để biết chi tiết đầy đủ.
    - **Test:** `server/tests/RoomManager.test.js` — describe block mới
      "ready-window miss counting" (13 case: confirmStart/allReady, trượt
      1/3, 2/3, 3/3 đúng người, reset khi đứng dậy/kick/leave giữa chừng,
      2 case biên). `npm test` 379/379 xanh. Playwright:
      `e2e/start-modal-non-blocking.spec.ts` (mới, bắt buộc theo yêu cầu ở
      trên) + cập nhật `draw-offer`/`resign-flow`/`room-lifecycle`/
      `rematch-overlay-conflict`/`real-player-gameplay` cho khớp DOM mới —
      chạy riêng từng file qua thật, tất cả pass (trừ
      `real-player-gameplay.spec.ts`, chưa chạy được trọn vẹn trong phiên
      này do giới hạn tiến trình nền của sandbox, không phải regression).

---
