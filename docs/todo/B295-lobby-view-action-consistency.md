# B295 — Same "Xem" action in three looks: underlined link, white-on-grey button, solid green
**Status:** OPEN
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
