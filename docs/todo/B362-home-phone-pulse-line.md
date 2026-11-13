# B362 — Home (phone): counts → one status line, 4 links → one "Khám phá" card
**Status:** ✅ DONE 2026-11-13 — built on ui/home-pulse-line (uncommitted)
**Area:** client/index.html (.hq-main, #home-stats), client/css/shell.css (@media ≤860), client/js/lobby-home.js renderStats, client/js/i18n.js
**From:** user 2026-11-13 on #360 result: "Các thẻ Học,... xếp chưa bắt mắt, có phần hơi loạn so với bố cục chung"; then "các thiết kế trên làm phần thẻ Đang chơi,... trở nên lạc lỏng". Picked **F** ("Okay, F") from features/home-redesign/tiles-v2/shots (f-status-line-*).   **Depends:** #360

## Problem
≤860px: the 2×2 link tiles and the two count cards are two unaligned grids (gaps 8 vs 14, different heights) of equally heavy cards under the main actions.

## Scope
1. ≤860px: hide `#home-stats`; new `p#home-pulse` right after `.hq-go`: "● N người đang tìm trận │ M ván đang chơi" (bold numbers, live-dot). Same data as the cards (renderStats), same live push.
2. "M ván đang chơi" is a button when M > 0 → Phòng screen, tab Quan sát (replaces the #home-live-one game button on phones).
3. `.hq-tiles` → one card, 4 equal columns (icon over label), dividers between; same hrefs/labels.
4. Desktop (>860px): unchanged — right-column cards stay, pulse line hidden.

## Don't
- Don't change desktop, the counts' data/API, or the greeting-row `#home-online` tag.

## Traps
- B261 CLS: the line must exist in the static HTML with "–" placeholders (no reflow on first data).
- #317 test forbids `<aside>`; keep `#home-stats` in DOM (desktop).
- No ETA on the line: `#qm-line` right under it already shows "ước tính N giây" (browser pass 2026-11-13 showed it twice).

## Done when
- jsdom tests for line render/zero/click + CSS hooks; real browser 390/360 light+dark; tab bar not covering.

## Result (2026-11-13)
- `p#home-pulse` after `.hq-go` (in static HTML with "–"); `renderPulse()` in lobby-home.js fed by renderStats (push too). Playing part = `<a href="#rooms">` only when > 0, click also selects the Quan sát tab.
- Real browser (pass-built.js, /api/home stats overridden): 390 + 360, light/dark, line on one row (434–466); desktop 1280 unchanged (pulse hidden, cards shown); click → #rooms + watch tab selected; 0 console errors. Tests: lobby-home.test.js `#362` block.
