# B295 — Same "Xem" action in three looks: underlined link, white-on-grey button, solid green
**Status:** ✅ DONE 2026-10-19 — one pattern = quiet 1px outline (border color-mix ink-2 75% = 4.15:1 on card, transparent fill, ink-2 text): empty-state buttons, "Xem diễn đàn", and the row action pill (Vào ván / Đăng ký / Xem). Underlined green .hlink removed ("Xem giải đấu" is now a link-action with trophy icon, trailing "→" dropped from vi/en strings); quick-match CTA stays the only filled button. Verified 375/768/1280/1440 (guest, dark), empty state real, data state via mocked /api/home (no DB writes). Row click targets and Ready-match bullet unchanged.
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 7. Pairs with B289 (solid one removed).
## Scope
1. Pick one pattern for navigational "view" actions in lobby cards (text link `.hlink` or ghost button) and apply to row actions + empty states.
## Don't
- No change to row click targets.
## Traps
- `row()` actions in lobby-home.js double as primary for Ready matches (highlighted) - keep that exception.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-visual-principles.md.
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
