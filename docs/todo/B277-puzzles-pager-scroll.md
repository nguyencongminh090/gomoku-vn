# B277 — Pager keeps scroll position after changing page
**Status:** ✅ FIXED 2026-10-17 (tests + real-browser pass + fix-log)
**Area:** client/js/puzzles.js:85-86
**From:** ux-audit puzzle 2026-10-17 (`docs/audits/ux-audit-2026-10-17-puzzle.md`), finding L1 (Low)   **Depends:** B274

## Problem
Click "Sau" at the bottom → scrollY stays 483, user lands mid-list.
## Scope
1. After a page change, scroll #pz-list into view (start).
## Don't
- Don't scroll on first load or on filter changes unless needed.
## Done when
- New page opens at its first card; test kept.
