# B300 — Lobby: Hôm nay / Đang phát trực tiếp rows misaligned
**Status:** OPEN
**Area:** client/css/shell.css (.ppanel.is-empty), client/js/lobby-home.js
**From:** lobby UI audit round 2 (user, 2026-10-19)   **Depends:** B294

## Problem
Compact rows (#294): the status text starts at a different x per row (Hôm nay and Diễn đàn at 939px, Đang phát trực tiếp at 1016px at 1440) and row heights differ (62 vs 48px, because only some rows hold a button).
## Scope
1. Fixed-width title column (or grid with a shared first column) so every status starts at the same x. 2. Or put the status under the title. 3. Same row height with and without the action button.
## Don't
- No change to what each card says or links to.
## Traps
- Titles are i18n and longer in vi vs en; don't fix a pixel width — use a shared grid track / ch-based min width. 375px must wrap cleanly.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-layout-spacing.md (alignment, proximity), ticket-rows.md (list rows).
## Done when
- Verified at 375/768/1280/1440, dark + light; `npm test` green.
