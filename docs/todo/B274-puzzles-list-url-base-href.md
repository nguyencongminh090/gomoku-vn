# B274 — /puzzles filter/paging rewrites URL to the lobby (<base href="/">)
**Status:** ✅ DONE 2026-10-17 — see fix-log 2026-10-17-puzzles-list-url-274
**Area:** client/js/puzzles.js:101, client/puzzles.html:5 (same <base> in puzzle*.html)
**From:** ux-audit puzzle 2026-10-17 (`docs/audits/ux-audit-2026-10-17-puzzle.md`), finding H1 (High)   **Depends:** —

## Problem
`history.replaceState(null,'','?'+query())` resolves against <base href="/"> → `/?`, `/?level=easy`, `/?page=2`. Reload lands on the lobby, shared link broken, Back leaves to /index.html.
## Scope
1. replaceState with `location.pathname + (q ? '?' + q : '')`.
2. jsdom test with <base href="/"> asserting pathname stays /puzzles.
3. grep other client/js for `replaceState/pushState('?` on pages that have <base>; list, don't fix beyond puzzles.
## Don't
- Don't remove <base>.
## Done when
- Reload on /puzzles?level=easy keeps the filter; test kept; ?v= bumped via cache-bust --write.
