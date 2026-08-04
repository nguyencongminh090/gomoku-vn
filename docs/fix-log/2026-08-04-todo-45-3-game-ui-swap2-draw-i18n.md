# Fix log entry — 2026-08-04 14:52

## Prompt

TODO.md #45, sub-item 3 theo `instruction.md` §B45: [client/js/game-ui.js](client/js/game-ui.js)'s Swap2 opening UI (`renderSwap2`) và prompt đề nghị hoà (`renderDrawPrompt`) build `innerHTML` bằng chuỗi tiếng Việt viết thẳng, không gọi `t()` — hiển thị tiếng Việt kể cả ở English mode. `renderTimePrompt` trong cùng file đã đúng chuẩn (dùng `t()`), dùng làm mẫu.

## Action

Thêm 11 khoá mới vào `client/js/i18n.js` (cả `vi`/`en`): `game.opponent_generic`, `game.swap2_place_title`, `game.swap2_opponent_placing`, `game.swap2_go_white`, `game.swap2_go_black`, `game.swap2_place_two_more`, `game.swap2_opponent_choosing`, `game.swap2_choose_black`, `game.swap2_choose_white`, `game.swap2_opponent_choosing_color`, `game.draw_waiting`. Đổi toàn bộ template string trong `renderSwap2()`/`renderDrawPrompt()` sang gọi `t(key)`; nút Đồng ý/Từ chối trong draw-prompt tái dùng khoá có sẵn `game.btn_accept`/`game.btn_decline` (đã tồn tại, cùng ý nghĩa, không tạo khoá trùng). Chuỗi `'{name} đề nghị hoà'` tái dùng khoá `game.draw_offer` (đã có sẵn interpolation `{name}`), chỉ đổi fallback `'Đối thủ'` sang `t('game.opponent_generic')`.

Thêm listener `window.addEventListener('langchange', ...)` trong `game-ui.js` (chưa từng có) gọi lại `renderSwap2()`/`renderGameControls()` (bản thân gọi `renderDrawPrompt()`/`renderTimePrompt()`) khi đổi ngôn ngữ — không có listener này thì các panel này (build bằng `innerHTML` chứ không phải `data-i18n`) sẽ đứng yên tiếng cũ cho tới lần render tiếp theo do state đổi, không phải do `applyI18n()` (vốn chỉ quét `[data-i18n]`). Theo đúng pattern đã có ở `room-ui.js:543`/`lobby.js:287`.

Bump `?v=51` → `?v=52`.

## Decision

Không đụng `renderTimePrompt` — đã đúng chuẩn từ trước, chỉ dùng làm tham chiếu.

## Summary output

`npm test`: 467/467 passing — không đổi (client-side `client/js/` không có hạ tầng test theo CLAUDE.md, đúng như đã ghi trong `docs/todo/B45-...md`). Kiểm tra `node --check` cho `game-ui.js`/`i18n.js` (cú pháp hợp lệ). Chưa chạy Playwright trực quan xác nhận UI thật (không có server đang chạy sẵn để test theo đúng quy trình an toàn DB trong CLAUDE.md) — nói rõ ở đây thay vì ngầm coi là đã verify bằng UI thật.
