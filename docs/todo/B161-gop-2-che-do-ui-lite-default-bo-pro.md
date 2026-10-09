# B161 — Gộp Density Mode về 2 chế độ (Lite + Default), bỏ Pro

**Nguồn:** yêu cầu người dùng (2026-08-28) — sau khi review khác biệt 3 chế độ, người dùng
quyết định bỏ Pro, chỉ giữ Lite + Default.

**Trạng thái:** ✅ ĐÃ XONG (2026-08-28 — `feature/ui-mode-two-modes` off `dev`)

Đã làm đúng kế hoạch. `ui-mode.js` `MODES=['lite','default']` + `normalizeMode()` map
`'pro'`→`'default'`; `ui-mode-preload.js` ghi đè `localStorage['gvn_ui_mode']` một lần khi gặp
`'pro'`. Các nhánh Pro-only: `roomId` meta phòng + `Infinity` tên online + nút "Use last settings"
(+ `#btn-use-last`, CSS `.modal__use-last`, i18n `modal.use_last`, class `modal--pro`) đã bỏ hẳn;
bảng tag luật đầy đủ + replay auto-Analysis chuyển sang Default (`=== 'default'`). Gộp 3 bản
`uiMode()` cục bộ (lobby/room-ui/history) thành wrapper mỏng gọi `window.getUiMode()` — chuẩn hoá
mode ở đúng 1 nơi. Xoá `applyReplayMode()` (no-op: nút `#btn-analysis` hiện tĩnh, CSS
`display:inline-flex`) + 3 call site. Xoá `.online-panel--lite*` mồ côi `lobby.css`. Segment Cài
đặt còn 2 nút; xoá i18n `mode.pro`/`mode.pro_desc` vi+en, gộp `mode.default_desc` = "Hiển thị đầy
đủ chi tiết" / "Full detail for power users". `?v=161→162` toàn `client/` (grep verify: 1 giá trị).

**Test:** cập nhật `client/tests/settings-panel-no-theme-row.test.js` (segment không còn `mode.pro`)
+ file mới `client/tests/ui-mode-two-modes.test.js` (16 assertion: MODES 2 phần tử, `getUiMode`
normalize `'pro'`→`'default'` không tụt về `'lite'`, `setUiMode('pro')` bị từ chối, `uimodechange`
chỉ bắn khi đổi thật, preload migrate `'pro'` + ghi đè localStorage). `npm test` **1400/1400**.

**Verify browser thật** (server dev :3000, guest login qua UICthật, Playwright): mode mặc định
`lite`; segment chỉ Gọn/Mặc định; đổi sang Default → attr+localStorage+getUiMode đều `default`;
modal Default = form phẳng, `#modal-confirm` hiện (flex), không có `#btn-use-last`; modal Lite =
Quick match hiện + Advanced đóng + ép preset 17×17+Wall, `#modal-confirm` ẩn tới khi mở Advanced;
set `localStorage['gvn_ui_mode']='pro'` + reload → thành `default` (attr + localStorage), **không
tụt về Lite**; history.html mở ở Default. **0 lỗi/cảnh báo console** trên mọi luồng.

## Mục tiêu

Hệ thống `data-ui-mode` còn đúng **2 chế độ**:

| | Lite (mặc định user mới) | Default |
|---|---|---|
| Đối tượng | Người mới, chơi nhanh | Người chơi quen |
| Tạo phòng | Quick match, ép preset mặc định (17×17 + Wall), luật nâng cao trong "Advanced" đóng — **giữ nguyên hành vi Lite hiện tại** | Form phẳng, tự nhớ cấu hình lần trước |
| Thông tin | Rút gọn tối đa | Đầy đủ |

`MODES = ['lite', 'default']`, fallback vẫn `'lite'`.

## Việc cần làm

### 1. Xử lý các hành vi Pro-only

| Hành vi Pro hiện tại | Quyết định |
|---|---|
| `roomId` trong dòng meta phòng ở sảnh (`lobby.js` `buildRoomMeta` ~401) | **Bỏ hẳn** |
| Bảng tag luật đầy đủ (`lobby.js` `buildRuleSummary` ~411) | **Chuyển sang Default** (nhánh `!== 'pro'` → chỉ `=== 'lite'` mới dùng câu tóm tắt 1 dòng) |
| Liệt kê tất cả tên online `Infinity` (`lobby.js` `onlineNameLimit` ~195) | **Bỏ** — Default giữ cap 12, Lite giữ 6 |
| Nút "Use last settings" + class `modal--pro` (`lobby.js` `applyModalMode` ~603/611, `btnUseLast`) | **Bỏ nút hẳn** — Default đã auto-áp last-settings khi mở modal |
| Replay mở thẳng Analysis mode (`history.js` ~254) | **Chuyển sang Default**: `setAnalysisMode(uiMode() === 'default')` |

Mọi nhánh `=== 'pro'` → đổi thành `=== 'default'` hoặc xóa; mọi nhánh `!== 'pro'` → trở thành
nhánh Lite (`=== 'lite'`), nhánh còn lại là Default.

### 2. Dọn code

- **Gộp 4 bản `uiMode()` trùng lặp** (`lobby.js` ~68, `room-ui.js` ~50, `history.js` ~348,
  `room.js`) → import/dùng `getUiMode` từ `client/js/ui-mode.js`.
- `history.js` `applyReplayMode()` (~354) giờ chỉ còn `btnAnalysis.style.display = ''` → xóa hàm,
  để nút hiện tĩnh trong HTML (kiểm tra `room`/`history.html` markup).
- Xóa class `modal--pro` + CSS liên quan trong `lobby.css`; giữ `modal--lite`.
- Xóa selector mồ côi `.online-panel--lite*` `lobby.css:760-767` (đã chết — không JS nào gắn class).
- Segment trong `settings-panel.js` (~166) còn 2 lựa chọn.

### 3. i18n (`i18n.js`)

- Xóa `mode.pro`, `mode.pro_desc` (vi ~297/300 và en ~925/928).
- Cân nhắc đổi nhãn `mode.lite`/`mode.default` cho rõ ("Gọn" / "Đầy đủ"); `gset.density` giữ hoặc
  đổi tên — chốt với người dùng khi làm.

### 4. Di trú giá trị `'pro'` đã lưu (BẮT BUỘC)

User có `localStorage['gvn_ui_mode'] = 'pro'`: sau khi bỏ `'pro'` khỏi `MODES`, cả `getUiMode()`
lẫn `ui-mode-preload.js` sẽ trả `'lite'` → Pro user bị đẩy về **Lite** thay vì Default.

→ Trong `ui-mode-preload.js` và `ui-mode.js` (`getUiMode` ~24-27): map `'pro'` → `'default'` và
ghi đè lại localStorage một lần để chuẩn hóa.

### 5. Cache-busting

Đụng `client/js/*` + `client/css/*` ⇒ bump `?v=160` → `?v=161` ở **mọi** `client/*.html` và
**mọi** `import '...?v='` trong `client/js/*.js` (kể cả file non-entry). Verify:
```
grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
```
Chỉ được ra **một** giá trị `?v=N` duy nhất.

## Kiểm thử

- Client-side chưa có hạ tầng test tự động — verify trên **browser thật**:
  - Segment Cài đặt chỉ còn 2 nút; chuyển qua lại Lite↔Default áp đúng.
  - Sảnh: câu tóm tắt luật (Lite) vs tag đầy đủ (Default); không còn roomId; số tên online 6 vs 12.
  - Modal tạo phòng: Lite = Quick match + Advanced đóng + ép preset; Default = form phẳng + auto
    last-settings, không còn nút "Use last settings".
  - Phòng: tab Khán giả / tab Điểm số / tóm tắt settings đúng theo mode.
  - Replay: Default mở thẳng Analysis, Lite mở ở chế độ xem.
  - Set thủ công `localStorage['gvn_ui_mode']='pro'` → reload → phải thành Default (không FOUC,
    không tụt về Lite), localStorage đã đổi thành `'default'`.
- `npm test` phải xanh (không có test server nào phụ thuộc, nhưng chạy để chắc).

## Ngoài phạm vi

- Không thêm khác biệt CSS thuần theo `[data-ui-mode]` (hiện toàn bộ do JS — giữ nguyên hướng đó).
- Không rename hệ thống "Density" thành khái niệm khác nếu người dùng chưa chốt nhãn.
