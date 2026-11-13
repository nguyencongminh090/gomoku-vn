# B366 — Home desktop: "Bảng quán cờ" scoreboard + labelled explore chips
**Status:** DONE — built 2026-11-13 on ui/home-desktop-scoreboard, merged to dev
**Area:** client/index.html (#screen-home), client/css/shell.css, client/js/lobby-home.js, client/js/i18n.js, client/tests/lobby-home.test.js
**From:** user 2026-11-13 "Học/Hội nhóm... Đang online... Các layout này trên desktop cần thiết kế lại. Layout trên điện thoại giữ nguyên"; mockup C picked (features/home-redesign/desktop-side, gallery artifact Ut21hiNdcfBeAEVQszUhmZ)   **Depends:** #358 #360 #362

## Problem
Desktop: online pill + 4 unlabelled icons in the greeting row and 2 sparse white count cards read as disconnected pieces.
## Scope
1. Right column #home-stats = one ink scoreboard (dark in both modes, faint board grid, "Trực tiếp" pulse dot): rows online / searching / playing as digit plates + label, live game line at the bottom.
2. The 4 links (Học, Diễn đàn, Giải đấu, Hội nhóm) leave the greeting row → 2×2 labelled pill chips under the board, inside #home-stats.
3. Greeting row keeps only "Chào …"; #home-online pill removed (count = board row #home-n-online).
4. Same ids for counts (#home-n-search, #home-n-live, #home-live-one, "–" before data — B261).
## Don't
- Touch phone layout (≤860px): .hq-tiles, .hq-pulse stay; #home-stats stays hidden there.
- Backend: all data already in /api/home stats + live.
## Traps
- Digit plates: keep textContent = the number (tests, live push); leading "0" plate for 1-digit values is CSS ::before, not text.
- #292: zero counts de-emphasised (dim plates), label still says what it counts.
- Pulse dot animation off under prefers-reduced-motion.
- Dark mode: board must stand off the #161512 page (border + lighter ink tone).
## Why this way
User pick of 4 mockups (A–D); C chosen for character. Explore chips have no data line (accepted with C).
## Done when
- jsdom tests updated (#358 counts, icon links → labelled chips, phone CSS asserts); npm test green.
- Real-browser shots 1440/1280 light+dark + 390 phone unchanged; cache-bust OK.
## Build notes (2026-11-13)
- Phone kept the greeting-row #home-online tag (dev shows it ≤860px); desktop hides it (`@media (min-width: 861px)`). Phone screenshots byte-identical to dev (390, light+dark, same /api/home payload).
- Removed unused i18n: home.card_*, unit_*, none_*. 3657 tests green; cache-bust OK; console errors 0; shots features/home-redesign/desktop-side/built/.
- Open: the empty scratch server reports online 0 while the viewer is on the page (existing count timing, not touched).
