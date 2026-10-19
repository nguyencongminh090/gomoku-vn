# B301 — Lobby Diễn đàn card: two "view" actions point the same way
**Status:** OPEN
**Area:** client/js/lobby-home.js (renderForum), client/css/shell.css
**From:** lobby UI audit round 2 (user, 2026-10-19)   **Depends:** B295

## Problem
With posts present, the Diễn đàn card shows a per-post "Xem" and a "Xem diễn đàn" button right below; both lead to the forum (user report; NOT reproduced yet — empty DB shows only "Xem diễn đàn").
## Scope
1. Reproduce with a seeded thread. 2. Keep one: row click/Xem per post, and a quiet text link for the whole forum — or drop the per-row pill.
## Don't
- Don't remove the empty-state entry link (#294).
## Traps
- Don't make rows non-clickable; keep keyboard focus order.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-visual-principles.md, ticket-rows.md.
## Done when
- Verified at 375/768/1280/1440, dark + light; `npm test` green.
