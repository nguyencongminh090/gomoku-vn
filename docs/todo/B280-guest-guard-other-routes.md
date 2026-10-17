# B280 — Same `!req.user.userId` guest guard in 6 other routes (guest ids are `guest_…`)
**Status:** OPEN
**Area:** server/routes/games.js:138, forum.js:32, notifications.js:22, challenges.js:27, friends.js:28, clubs.js:45
**From:** #273 scope item 3, 2026-10-17   **Depends:** —

## Problem
Guest sessions carry userId `guest_…` + isGuest, so these guards never fire (found by reading, not yet reproduced with a guest cookie). Likely FK 500s or guest rows where #273 had them.
## Scope
1. Reproduce each with a guest cookie (jest route test with the realistic guest mock from puzzles-route.test.js).
2. Extract one shared guest guard (`middleware`) and use it everywhere incl. puzzles.
## Don't
- Don't change the guest identity model.
## Done when
- Each route 403 GUEST_FORBIDDEN for a guest; tests kept.
