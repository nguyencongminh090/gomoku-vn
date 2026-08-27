# #160 — Gỡ bỏ hoàn toàn Dark UI Mode

**Trạng thái:** ✅ ĐÃ XONG (2026-08-28, nhánh `feature/remove-dark-ui` off `dev`)

## Đã làm

Gỡ toàn bộ hạ tầng dark theo đúng 9 mục dưới:
- Xoá `client/js/theme-preload.js` + 3 `<script>` ref (`index.html`, `tournament.html`,
  `tournament-match.html`).
- `settings-panel.js`: xoá `getTheme()`/`setTheme()`, xoá `themeRow`/`themeLabel`,
  `group(appearance, [densityRow])` chỉ còn density. Cập nhật 2 comment lạc (dòng đầu file + comment
  trong `openPanel`).
- `i18n.js`: xoá `gset.theme` / `_light` / `_dark` cả block vi và en.
- `main.css`: `:root, [data-theme="light"]` → `:root`; xoá khối `[data-theme="dark"]` (49 dòng) +
  `[data-theme="dark"] .ui-shell`. Giữ nguyên mọi token `--board-*` và token khác dưới `:root`.
- `room.css`: xoá 4 rule `[data-theme="dark"] .board-area/.panel-right-shell/.board-area-shell/
  .panel-players`.
- `board.js`: gỡ `_themeObserver` (MutationObserver trên `data-theme`) + comment; giữ
  `_readBoardTheme()` (vẫn đọc `--board-*` từ `:root`).
- `localStorage['theme']` cũ: bỏ qua, không migration (quyết định có ý thức — không ai đọc sau khi
  `theme-preload.js` bị xoá).
- `server/tests/compression.test.js`: test "tiny responses below threshold" trước dùng
  `/js/theme-preload.js` (đã xoá) → chuyển sang `/js/ui-mode-preload.js` (~399 B, vẫn dưới ngưỡng
  1 KB).
- Bump `?v=160 → ?v=161` toàn `client/` (HTML + mọi `import` trong `client/js/*.js`). Grep verify:
  đúng 1 giá trị `?v=161`.
- `docs/todo/B70` / `B73` có nhắc "test light/dark mode" trong tiêu chí verify — **không sửa** (rule
  append-only); người làm B70/B73 sau này bỏ phần dark.

## Test / verify

- Test mới `client/tests/settings-panel-no-theme-row.test.js` (5 case, jsdom): panel mở không throw
  + render overlay; không còn label/segment theme; nhóm Appearance vẫn có control mật độ UI
  (`mode.lite/default/pro`); mở panel không bao giờ ghi `localStorage['theme']`; `window.setTheme`/
  `getTheme` không tồn tại.
- `npm test`: **1389/1389 pass** (73 suite). Trước khi sửa `compression.test.js` thì 1 test fail
  đúng như dự đoán (404 cho `theme-preload.js` đã xoá) — xác nhận test bắt được.
- Browser thật (Playwright, guest login, db thật đã move aside + restore, 315 games nguyên vẹn):
  - Sảnh (`index.html`): `<html>` không còn attr `data-theme`, nền trắng, không FOUC, 0 console
    error/warning. Panel Cài đặt mở: nhóm "Giao diện" chỉ còn "Mật độ hiển thị".
  - Phòng (`room.html`, tạo qua "Tạo nhanh"): `data-theme` = null, nền trắng, không FOUC, 0 console
    error/warning. Panel Cài đặt: không còn hàng theme (ảnh `room-settings.png`).

**Nguồn:** yêu cầu người dùng "Implement Dark UI Mode" (2026-08-27) → sau khi audit cho thấy dark
mode gần như vô hiệu trên các màn hình chính (xem phần "Bối cảnh" bên dưới), người dùng **quyết
định gỡ bỏ hẳn Dark UI** thay vì hoàn thiện (2026-08-27). Scope chốt qua hỏi–đáp:
**gỡ toàn bộ hạ tầng dark** (không chỉ ẩn toggle), **ghi việc trước — implement sau**.

## Việc cần làm — gỡ toàn bộ hạ tầng dark

### 1. `client/js/theme-preload.js` — xoá file
Gỡ 3 dòng `<script src="js/theme-preload.js?v=N"></script>` trong:
- `client/index.html:26`
- `client/tournament.html:13`
- `client/tournament-match.html:15`

### 2. `client/js/settings-panel.js` — gỡ hàng chọn theme
- Xoá `getTheme()` (dòng 54-56), `setTheme()` (dòng 58-61).
- Xoá `themeRow` + `themeLabel` + `segment([...light/dark...])` (dòng 168-178).
- `body.appendChild(group(T('gset.appearance'), [themeRow, densityRow]))` (dòng 193) → chỉ còn
  `[densityRow]`. Kiểm tra nhóm "Giao diện" (Appearance) có còn nội dung không — nếu chỉ còn mật độ
  UI thì giữ; nếu rỗng thì gỡ luôn `group(...)`.
- Comment dòng 340 nhắc "theme toggled via OS preference" — cập nhật cho khỏi lạc.

### 3. `client/js/i18n.js` — gỡ 6 key
`gset.theme`, `gset.theme_light`, `gset.theme_dark` ở cả block vi (dòng 453-455) và en (1083-1085).
Kiểm tra `error-codes-i18n-consistency.test.js` / test đối chiếu key vi↔en không vỡ.

### 4. `client/css/main.css` — gỡ khối dark
- Dòng 10: `:root, [data-theme="light"] {` → `:root {`.
- Dòng 139-187: xoá nguyên khối `[data-theme="dark"] { ... }`.
- Dòng 487-489: xoá `[data-theme="dark"] .ui-shell { ... }`.
- **Giữ nguyên** token `--board-*` và mọi token khác dưới `:root` (giá trị light) — chúng vẫn được
  `board.js._readBoardTheme()` đọc.

### 5. `client/css/room.css` — gỡ khối dark
Dòng 37-52: xoá block comment "Dark mode for new Double-Bezel panels" + 4 rule
`[data-theme="dark"] .board-area / .panel-right-shell / .board-area-shell / .panel-players`.

### 6. `client/js/board.js` — gỡ theme observer
- Dòng 87-92: xoá comment + `this._themeObserver = new MutationObserver(...)` +
  `.observe(... 'data-theme')`.
- `_readBoardTheme()` (dòng 96-111) **giữ lại** — vẫn đọc `--board-*` từ `:root` (nay chỉ có light),
  không còn phụ thuộc theme. Hoặc đổi tên thành `_readBoardTokens()` nếu muốn cho sạch nghĩa
  (không bắt buộc — cân nhắc blast radius: `board.js:482` là caller duy nhất).
- Kiểm tra không còn `destroy()`/cleanup nào tham chiếu `this._themeObserver` (sẽ thành `undefined`).

### 7. `localStorage['theme']` — không cần migration
Giá trị cũ ('light'/'dark') trở thành rác vô hại sau khi `theme-preload.js` bị xoá. Có thể thêm
1 dòng dọn dẹp trong `settings-panel.js` (`localStorage.removeItem('theme')`) hoặc bỏ qua —
không đáng làm, ghi lại là quyết định có ý thức.

### 8. Bump `?v=N` toàn `client/`
Theo rule "Cache-busting version bump" trong `CLAUDE.md`: mọi `client/*.html` + mọi
`import '...?v=N'` trong `client/js/*.js`. Chạy grep verify (đúng 1 giá trị `?v=`). Trừ mockup.

### 9. Dọn tham chiếu lạc trong `docs/todo/B70`, `docs/todo/B73`
2 file này có nhắc "light/dark mode" trong tiêu chí verify. **Không sửa nội dung file cũ** (rule
append-only cho tracking detail) — nhưng khi làm B70/B73 sau này thì bỏ phần "test dark mode".
Ghi chú ở đây để người làm B70/B73 biết.

## Bối cảnh — vì sao gỡ thay vì hoàn thiện (audit tĩnh 2026-08-27)

Dark mode có hạ tầng (token `[data-theme="dark"]` trong `main.css`, toggle Sáng/Tối trong panel
Cài đặt, `theme-preload.js`, `board.js` MutationObserver) nhưng **gần như vô hiệu**:

1. `theme-preload.js` chỉ có ở 3/7 trang (`index`, `tournament`, `tournament-match`) — thiếu ở
   `room.html` (màn chơi game), `history.html`, `login.html`, `oauth-complete.html` → các trang đó
   luôn light.
2. Zen skin (`lobby-zen.css` / `room-zen.css`, luôn bật qua `<body class="zen-lobby/zen-room">`
   hardcode) flatten token về light cố định "per ui/* locks" → **Sảnh + Phòng luôn light bất kể
   `data-theme`**.
3. `login.css` có `:root` cục bộ light-only.
4. Nhiều màu hardcode rải rác không adapt.

Hoàn thiện đàng hoàng đòi đụng vào ui/* locks (điểm 2) và tô lại bảng màu nhiều file. Người dùng
chọn gỡ bỏ.

## Đánh giá hiệu quả / an toàn

- **Hiệu quả:** dọn code chết — bỏ ~60 dòng CSS token, 1 file JS, 1 hàng UI, 6 key i18n, 1 observer.
  Không mất tính năng người dùng đang thực sự dùng (dark mode vốn không hoạt động ở màn chính).
- **An toàn:** trung bình-thấp. Rủi ro: (a) `settings-panel.js` render — sửa DOM động, phải verify
  panel Cài đặt còn mở đúng, không JS error; (b) test đối chiếu i18n vi↔en có thể liệt kê key theme
  — cập nhật; (c) quên bump `?v=` gây stale cache; (d) `board.js` — nếu có cleanup path tham chiếu
  `_themeObserver` sẽ ném lỗi.

## Trạng thái unit test

- `settings-panel.js`: `client/tests/` có hạ tầng jsdom — thêm/ sửa test xác nhận panel render
  không còn hàng theme và không throw.
- i18n: chạy `npm test` — test đối chiếu key vi↔en sẽ bắt nếu xoá lệch.
- `board.js`: `client/tests/board-optimistic-stone.test.js` set `renderer._theme` thủ công (không
  liên quan observer) — kiểm tra vẫn pass.
- Verify browser thật: mở panel Cài đặt (Sảnh + Phòng), mọi trang load bình thường, không console
  error, không FOUC.

## Ngoài phạm vi (không đụng)

- Token `--board-*` và chế độ "stone" của bàn cờ — giữ nguyên (board-lock).
- Không refactor `settings-panel.js` ngoài phần gỡ theme.
- Không đổi `docs/todo/B70` / `B73` (append-only) — chỉ ghi chú ở mục #9.

Chi tiết hướng làm:
[docs/instruction/B160-go-bo-dark-ui-mode.md](../instruction/B160-go-bo-dark-ui-mode.md).
