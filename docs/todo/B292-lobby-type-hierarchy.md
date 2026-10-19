# B292 — Lobby: flat type hierarchy - greeting and 3 stats near same size; bold "0" draws the eye
**Status:** OPEN
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
