# B360 — Home (phone): Học / Diễn đàn / Giải đấu / Hội nhóm links move off the top
**Status:** ✅ DONE 2026-11-12 — N2 built on ui/home-challenge-tiles (uncommitted)
**Area:** client/index.html (.hq-hello .hub-more), client/css/shell.css (.hq @media ≤860), platform-shell.js tab bar (if merged there)
**From:** user 2026-11-12 after #358 review: "On phone: các nút Puzzle/Forum... chuyển xuống bottom thay vì để đầu trang (cần audit lại hoặc redesign riêng)"   **Depends:** #358

## Problem
On ≤860px the 4 icon-only links sit in a row right under the greeting, above the sentence — they take the first-screen slot the main actions should own, and icon-only without hover tooltips is weak on touch.

## Scope
1. DECIDED 2026-11-12: **N2** (features/home-redesign/followups/shots/n2-*) — on ≤860px hide the greeting-row icons; a 2×2 grid of labelled tiles (icon + text, 52px, surface card) right after the room code, before the count cards. Same 4 links/hrefs.
2. Desktop greeting row unchanged (icon-only + tooltip).

## Don't
- Don't change desktop. Don't build #359 rename here.

## Traps
- Tab bar already has Giải; avoid a duplicate. Phone links had labels before (ui-audit F4) — icon-only on touch has no tooltip.

## Done when
- User picked a direction; phone 375×812 shows sentence + Chơi nhanh + code above the tab bar; jsdom + browser pass.

## Result (2026-11-12)
- `nav.hq-tiles` in `.hq-main` right after `#home-code` (DOM order, no CSS `order:` — keeps the resume strip where #358 put it); `display:none` >860px, `.hub-more` hidden ≤860px. Labels = existing keys (`lobby.clubs` "Câu lạc bộ"; #359 rename not done). Giải đấu kept (same 4 links as decided).
- Real browser 375×812 (light+dark): sentence 116–268, Chơi nhanh 286–350, Thách đấu 360–416, code 473–533, tiles 607–719, tab bar 742 → all above it; no horizontal scroll. Tests: lobby-home.test.js `#360` block.
