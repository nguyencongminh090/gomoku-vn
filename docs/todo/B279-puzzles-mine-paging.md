# B279 — /puzzles/mine is one unpaged list
**Status:** ✅ FIXED 2026-10-17 (tests + real-browser pass + fix-log)
**Area:** server/routes/puzzles.js (/mine), client/js/puzzles-mine.js
**From:** ux-audit puzzle 2026-10-17 (`docs/audits/ux-audit-2026-10-17-puzzle.md`), finding L3 (Low)   **Depends:** —

## Problem
49 puzzles → 49 rows in one response/page.
## Scope
1. Reuse the list pager (PAGE=20) for /mine, or cap with "Xem thêm".
## Don't
- Don't change the 5-pending limit.
## Done when
- Author with 45+ puzzles gets paged results; route + jsdom tests kept.
