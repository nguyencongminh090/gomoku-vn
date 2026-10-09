# B160. Gỡ bỏ hoàn toàn Dark UI Mode (TODO.md #160)

**Nguồn:** người dùng quyết định gỡ Dark UI thay vì hoàn thiện (2026-08-27). Scope: gỡ **toàn bộ**
hạ tầng dark, không chỉ ẩn toggle. Ghi việc trước, implement sau.

## Cách tiếp cận

- Đây là **xoá code chết**, không phải refactor. Chỉ đụng đúng những chỗ liệt kê trong
  [docs/todo/B160](../todo/B160-go-bo-dark-ui-mode.md) mục 1-9. Không tiện tay dọn thứ
  khác trong cùng file.
- Làm theo thứ tự mục 1→8. Mục 9 chỉ là ghi chú cho người làm B70/B73 sau này — **không** sửa
  `docs/todo/B70` / `B73` (rule append-only cho tracking detail).
- `main.css`: khi đổi `:root, [data-theme="light"] {` → `:root {`, giữ nguyên **mọi** token bên
  trong (đặc biệt `--board-*`). Chỉ xoá selector `[data-theme="dark"]` và `[data-theme="dark"]
  .ui-shell` / `.board-area` v.v.
- `board.js`: gỡ `_themeObserver` (khai báo + `.observe`). **Giữ** `_readBoardTheme()` — nó đọc
  `--board-*` từ `:root`, không phụ thuộc theme sau khi gỡ. Đổi tên là tuỳ chọn, cân nhắc caller
  duy nhất `board.js:482`. Grep `_themeObserver` toàn file để chắc không còn cleanup path nào
  tham chiếu (nếu có `disconnect()` trong `destroy()` — gỡ luôn).
- `settings-panel.js`: sau khi gỡ `themeRow`, kiểm tra `group(T('gset.appearance'), [...])` còn
  `densityRow`. Nếu nhóm Appearance chỉ còn mật độ UI → giữ nguyên nhóm. `renderInto(...)` được gọi
  lại trong callback của `setTheme` cũ — đảm bảo không còn reference tới `setTheme`/`getTheme` sau
  khi xoá.
- i18n: xoá cùng lúc cả 3 key ở block vi (453-455) **và** en (1083-1085). Lệch sẽ làm test đối
  chiếu key vi↔en fail — đó là feature, không phải bug.

## Pitfalls

- **`?v=` bump toàn bộ** — đụng HTML + CSS + JS, rất dễ sót. Verify bằng lệnh grep trong `CLAUDE.md`
  (`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` → đúng 1 giá trị), không eyeball.
- **Mockup files** (`client/*-mockup.html`, `tournament-detail-mockup.html`,
  `tables-tournaments-mockup.html`) — không đụng, không bump.
- `localStorage['theme']` cũ còn sót lại — vô hại sau khi `theme-preload.js` bị xoá (không ai đọc).
  Quyết định: bỏ qua, không viết migration. Ghi rõ trong summary là quyết định có ý thức.
- Không xoá token `--board-*` hay đụng chế độ "stone" bàn cờ (board-lock — tiền lệ B133).
- `board.js` MutationObserver: nếu môi trường test jsdom không có `MutationObserver`, việc gỡ có thể
  làm 1 test đang skip-vì-lỗi trở lại pass — kiểm tra `client/tests/` output trước/sau.

## Verify (bắt buộc — có `client/` surface)

- `npm test` xanh (đặc biệt test i18n vi↔en, `error-codes-i18n-consistency.test.js`,
  `board-optimistic-stone.test.js`).
- Thêm/sửa test jsdom cho `settings-panel.js`: panel render không còn hàng "Chủ đề", không throw.
- Browser thật (`run` skill hoặc Playwright theo `playwright-e2e-safety`): login → Sảnh → Phòng →
  game → Lịch sử → Giải đấu. Mỗi trang: load bình thường, **không FOUC**, không console error, mở
  panel Cài đặt thấy đúng (chỉ còn Ngôn ngữ / Mật độ UI / Đăng xuất …).
- Xác nhận `git grep -n "data-theme\|theme-preload\|gset.theme\|_themeObserver\|setTheme"` trong
  `client/` (trừ mockup) trả về rỗng sau khi xong.

## Git

`client/` only, không đụng `server/`. Hạ tầng dark có trên cả `main` không? `git show
main:client/js/theme-preload.js` — nếu có ở cả `main` thì đây là gỡ tính năng chung: branch
`fix/remove-dark-ui` off `main` (tiền lệ B92/B157, đánh số theo `dev`), merge `dev` re-bump `?v=`
theo `max(dev,main)+1`. Nếu chỉ ở `dev` → `feature/remove-dark-ui` off `dev`. Một commit/việc theo
quy ước repo. `[Model: Sonnet 5]` — phạm vi rõ ràng, cơ học.

Chi tiết việc:
[docs/todo/B160-go-bo-dark-ui-mode.md](../todo/B160-go-bo-dark-ui-mode.md).
