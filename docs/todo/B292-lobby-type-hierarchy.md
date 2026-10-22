# B292 — Lobby: flat type hierarchy - greeting and 3 stats near same size; bold "0" draws the eye
**Status:** ✅ DONE 2026-10-19 — title 22→28px (24px ≤480px, line-height 1.3), stat number 22→18px/600, label 12.5px; zero counts weight 400 + --c-ink-3 (5.24:1 on card). Verified 375/768/1280/1440 with "Nguyễn Minh" (stacked diacritics clean, 2 lines at 375). Dark skin, guest only.
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 4.
## Scope
1. Define ~3 main sizes (title / stat / body) from tokens for the hero + `#home-stats`.
2. De-emphasise zero values (regular weight, ink-3).
## Don't
- Do not rewrite stats data (`/api/home`).
## Traps
- Vietnamese stacked diacritics: test "Nguyễn Minh" at the larger size (line-height).
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-typography.md.
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
