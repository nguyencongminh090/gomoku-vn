# F431 — Room "Luật" tab: every rule explained + demo boards
**Status:** ✅ DONE 2026-11-21 (built, uncommitted on feature/431-room-rules-tab; browser pass desktop 1280 + phone 390)
**Area:** client/room.html, client/js/room-rules-guide.js (new), room-ui.js (renderRulesGuide), room-entry.js, i18n.js (guide.*), room-arena.css (.rg-*)
**From:** user 2026-11-21 "Thêm tab: Luật chơi trong trang Room… chi tiết dễ hiểu về các luật đang có + demo"   **Depends:** —

## Scope
1. 5th rail tab "Luật" (scales icon) with accordion per rule: basics, Luật 1/Tiêu chuẩn/Luật 2/Renju, Ô khoá, Hố đen, Swap2, Taraguchi-10, Yamaguchi.
2. Each section: plain lead, points, demo mini-boards with ✓/✗ captions. Rules in use are flagged "Đang dùng" and open.
## Don't
- Don't redraw on every updateUI (keeps user-opened sections); only when rule set/language changes.
## Traps
- New static import in room-entry.js needs a modulepreload hint (+ count in modulepreload-hints test).
- Demo boards use a fixed paper colour, not theme tokens (black stones vanish on dark cells).
## Done when
- Tests: room-rules-guide.test.js (keys vi+en, sections, flags, escaping).
