# B294 — Right column spends a card on each empty state ("Chưa có…")
**Status:** ✅ DONE 2026-10-19 — empty Hôm nay / Diễn đàn / Live cards collapse to one wrapped row (title + message + entry link kept; class .is-empty set by flagEmpty()). Card heights at 1440 (guest, empty DB): today 141→46, forum 161→62, live 107→50; right column 646→395px. CLS (guest, one run): 1440 .036→.049, 1280 .067→.062, 768 .091 same, 375 .280 same (pre-existing; <=480 stats reservation, see #292 note). :empty reservations (36/90px) left unchanged. Dark skin only.
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 6.
## Scope
1. Collapse empty cards to one compact row, or hide empty Diễn đàn/Live/Hôm nay, keeping a single entry link.
## Don't
- Do not drop the tournament / forum entry points; keep the live card for streamers.
## Traps
- Cards fill in dynamically after /api/home - avoid layout jump (CLS).
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-layout-spacing.md.
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
