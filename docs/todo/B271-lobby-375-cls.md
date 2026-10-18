# B271 — Lobby at 375 px: CLS 0.135 during load
**Status:** ✅ DONE 2026-10-17 — see fix-log (#271)
**Area:** client/js/lobby-home.js, client/css/lobby*.css
**From:** ux-audit 2026-10-17 (`docs/audits/ux-audit-2026-10-17.md`)   **Depends:** —

## Problem
Load / at 375×812 as member: CLS 0.135 (other pages ≤ 0.03; gate 0.25). Layout shifts when /api/home content arrives.
## Scope
1. Find the shifting block (PerformanceObserver layout-shift sources). 2. Reserve its min-height (see client/tests/lobby-cls-reserve.test.js).
## Don't
- Don't touch anything beyond the listed lines; no token redesign.
## Done when
- CLS < 0.05 at 375 px; test kept.
