# B161 — Hướng dẫn: gộp Density Mode về Lite + Default

## Approach

1. **Sửa `ui-mode.js` trước.** `MODES = ['lite', 'default']`. Trong `getUiMode()` (~24): nếu
   attribute/stored là `'pro'` → coi như `'default'`. Cân nhắc export một hằng dùng chung để
   `lobby.js`/`room-ui.js`/`history.js`/`room.js` bỏ bản `uiMode()` cục bộ và gọi `getUiMode()`.
2. **`ui-mode-preload.js`**: cùng logic map `'pro'`→`'default'`; sau khi set attribute, nếu giá trị
   đọc từ localStorage là `'pro'` thì `localStorage.setItem('gvn_ui_mode','default')` (chuẩn hóa 1
   lần, bọc try/catch — file này chạy trước paint trên mọi trang).
3. **Chuyển hóa nhánh theo bảng trong `docs/todo/B161`** — làm từng file, giữ diff nhỏ:
   - `=== 'pro'` giữ thông tin có ích → đổi `=== 'default'`.
   - `=== 'pro'` chỉ là "power noise" (roomId, Infinity, nút Use-last) → xóa nhánh + code chết kèm.
   - `!== 'pro'` → `=== 'lite'` (nhánh rút gọn chỉ cho Lite); phần còn lại rơi vào Default.
4. **i18n**: xóa `mode.pro*`. Nếu người dùng chốt đổi nhãn, sửa `mode.lite`/`mode.default` +
   `gset.density` cả vi lẫn en, key phẳng có dấu chấm.
5. **Bump `?v=N`** cuối cùng, grep verify ra đúng 1 giá trị.

## Pitfalls

- **Đừng để Pro user tụt về Lite.** Đây là điểm dễ sai nhất — `getUiMode` validate whitelist nên
  `'pro'` sẽ fallback thẳng về `'lite'` nếu không map tường minh. Test bằng cách set localStorage
  thủ công.
- **`applyReplayMode()`**: xác nhận nút `#btn-analysis` (hoặc tên thật) có sẵn `display` hợp lệ
  trong HTML trước khi xóa hàm — nếu HTML để `style="display:none"` thì phải sửa HTML.
- **`modal--pro` CSS**: grep cả `lobby.css` lẫn `room*.css`/`main.css` trước khi xóa; đừng xóa nhầm
  `modal--lite`.
- **`onlineNameLimit`**: chỉ đổi nhánh `pro`, giữ nguyên `lite ? 6 : 12`.
- Cross-import `?v=` giữa các module non-entry — theo đúng cảnh báo trong `CLAUDE.md` (đã ship bug
  duplicate-socket 2 lần vì bỏ sót).

## Đừng đụng

- ui/* board-locks (bàn cờ / quân cờ / màu).
- Backend — việc này thuần `client/`.
- `docs/fix-log/2026-08-01-phase-2-infrastructure-lite-default-pro-ui-mode.md` (append-only; nếu
  cần ghi chú lịch sử thì thêm entry fix-log mới, không sửa).

## Verify

Browser thật mọi trang (`index.html`, `room.html`, `history.html`, `tournament-detail`) — checklist
đầy đủ trong `docs/todo/B161`. `npm test` xanh. `git grep -n "'pro'\|\"pro\"\|mode.pro"` client/
xác nhận sạch (trừ comment lịch sử nếu giữ lại có chủ đích).
