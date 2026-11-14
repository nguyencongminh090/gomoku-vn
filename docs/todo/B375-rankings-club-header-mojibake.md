# B375 — Rankings "Nhóm" column header shows mojibake "NhÃ³m"
**Status:** OPEN
**Area:** client/js/i18n.js:1428 (`rankings.col_club` vi)
**From:** seen in #374 real-browser pass, 2026-11-14   **Depends:** —

## Problem
vi string is double-encoded UTF-8 (`NhÃ³m`), so the rankings table header reads "NHÃ³M". Pre-existing on dev (rankings.html fallback text had the same bytes; #374 fixed only the HTML fallback, i18n overrides it).
## Scope
1. Fix the vi string; grep i18n.js for other `Ã` / `Â` mojibake.
2. Regression test: no i18n value contains `Ã` followed by a byte-pair pattern.
## Don't
- Don't touch other locales' wording.
## Done when
- Header reads "NHÓM"; test kept; fix-log row.
