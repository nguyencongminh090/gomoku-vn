# B358 — Home redesign: M4 "Câu lệnh" (sentence composer)
**Status:** ✅ DONE 2026-11-12 — ui/home-sentence; npm test 3592/3592, cache-bust OK; browser pass 1280/768/375 light+dark + guest (0 console errors, CTAs above the tab bar at 375×812: play bottom 406, code bottom 579 < 742). Not built: sparkline + open-room count (no data in /api/home). Unverified in a browser: resume strip with a live game. Follow-ups #360, #361.
**Area:** client/index.html (#screen-home), client/js/lobby-home.js, client/css/lobby.css (+ platform.css bg on home), client/js/i18n.js, client/tests/lobby-home*.test.js
**From:** user 2026-11-12, picked M4 of `features/home-redesign/` (gallery index.html, mockups/m4-sentence.html)   **Depends:** —

## Problem
Home leaves ~40 % of the first screen empty and the two main actions (Vào phòng, Chơi nhanh + options) do not dominate. User: "Làm nổi bật tính năng chính: Vào phòng + Chơi nhanh (tùy chỉnh)".

## Scope
1. Rebuild #screen-home DOM to the M4 shape (not a reskin): greeting row (name + online tag + 4 icon-only links), resume strip (= #home-mine-card), sentence h1 with 3 blank buttons (rule / time / rated|casual), big "Chơi nhanh" button, "hoặc vào phòng bằng mã" + 3-box code input + "Xem N phòng đang mở", right column cards (Đang tìm trận: queue + ETA, Đang chơi: count + one live game).
2. Blanks open a listbox popover under the blank (desktop) / bottom sheet (≤860px); values = QM_RULES, QM_MENU_TIMES, rated/casual exactly as today; saved pick + guest = casual only keep working.
3. Searching state replaces the button in place (timer, queue, Huỷ tìm); qm-line facts per #328.
4. Code input reuses the rooms join-by-code flow (`#A3F`, same validation/errors).
5. Secondary links icon-only + aria-label + tooltip on hover/focus (user accepted reversing ui-audit F4, 2026-11-12).
6. Background on home: grid only, leaves removed, grid faded to transparent below the hero.
7. Phone order: sentence + Chơi nhanh first, code input next; both inside the first screen above the tab bar.

## Don't
- No server change (all data already in GET /api/home + lobby sockets).
- Don't touch BoardRenderer/board CSS. Don't build the Hội nhóm rename here (#359).

## Traps
- `font: … inherit` shorthand is invalid; body/zen-lobby CSS outranks new rules → check specificity.
- Popover must not cover the Chơi nhanh button (mockup showed it did) — close on outside tap/Esc, focus return.
- Sentence wraps to 4 lines on 375px; keep it ≤ 30px there.

## Why this way
User choice after 8 mockups. Style: vstyle-minimalism-swiss (type-led). Notes: vbase-eye-flow-scanning (primary action top-left, first screen), a11y-aria-keyboard-focus (listbox pattern). Rejected: chips under the sentence, tap-to-cycle (user picked dropdown).

## Done when
- jsdom tests: blanks set qm.rule/time/rated, searching swap, guest casual-only, code join; lobby-home + lobby-cls-reserve green; `npm test` green; cache-bust OK.
- Real-browser pass 1280/768/375 light+dark vs mockup screenshots; both CTAs above the fold at 375×812; keyboard: Tab through blanks, Enter opens, arrows choose, Esc closes.
