# B330 — Rankings on phone: no sideways scroll, top 3 highlighted
**Status:** FIXED
**Area:** client/rankings.html, client/js/rankings.js, client/css/platform.css (`#rk-wrap`), client/tests/rankings-page.test.js
**From:** user 2026-10-23   **Depends:** —

## Problem
7-column table forced horizontal scroll on phones.
## Scope
1. ≤640px: show only # · Người chơi · Rating (hide region/7-day/club/games via classes).
2. Top 3 rows `rk-top--N`: tinted row + coloured left bar + bold name, all widths.
## Don't
- Don't change the API or desktop columns; other `.ptbl` tables untouched (scoped to `#rk-wrap`).
## Done when
- Test for hide classes + top-3 marks; 360px browser pass has scrollWidth == clientWidth.
