# B313 — lobby-zen.css literal 120ms transitions ignore reduced motion
**Status:** ✅ DONE 2026-10-22 — literal durations → --duration-* tokens (new --duration-xfast); dot pulse stops after 5s. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/css/lobby-zen.css (5 transitions, e.g. :566)
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F8), lobby mobile; recorded, not built   **Depends:** —

## Problem
main.css:148 zeroes only --duration-* tokens under prefers-reduced-motion; literal 120ms stays on.
## Scope
1. Use var(--duration-fast) (or the nearest token) in those transitions.
## Don't
- Don't change normal-motion timing noticeably.
## Why this way
Rule DEP-REDUCED-MOTION of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3130
