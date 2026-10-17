# B273 — Guest solve/submit on puzzles returns 500 (guest passes the member guard)
**Status:** ✅ DONE 2026-10-17 — see fix-log 2026-10-17-puzzle-guest-500-273
**Area:** server/routes/puzzles.js:30-33, client/js/puzzle.js:165
**From:** ux-audit puzzle 2026-10-17 (`docs/audits/ux-audit-2026-10-17-puzzle.md`), finding C1 (Critical)   **Depends:** —

## Problem
Guests have userId `guest_…` (isGuest on the session), so `!req.user.userId` never blocks them. POST /api/puzzles/:id/solve and POST /api/puzzles → 500 `FOREIGN KEY constraint failed`; UI "Lỗi máy chủ". Client `member = me.ok` is true for guests, so #pz-login never shows.
## Scope
1. Server guard: `if (!req.user.userId || req.user.isGuest)` → 403 GUEST_FORBIDDEN.
2. Client puzzle.js: member = ok && not guest (use fetchMe's isGuest); show the login prompt before typing.
3. Check the same guard text in games.js:138, forum.js:32, notifications.js:22, challenges.js:27, friends.js:28, clubs.js:45 with a guest cookie; list which also 500/leak, fix only puzzles here, record the rest as new items.
## Don't
- Don't change the guest identity model or the DB schema.
## Why this way
Guard on the session flag, not on FK errors; cheapest and consistent with the 403 contract.
## Done when
- Guest solve + submit → 403 + friendly prompt, no 5xx; jest route test (guest cookie) and jsdom test kept; fix-log entry.
