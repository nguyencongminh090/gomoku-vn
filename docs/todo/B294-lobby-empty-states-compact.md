# B294 — Right column spends a card on each empty state ("Chưa có…")
**Status:** OPEN
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
