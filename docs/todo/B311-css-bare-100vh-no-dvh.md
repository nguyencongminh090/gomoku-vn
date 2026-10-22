# B311 — Bare 100vh without svh/dvh fallback
**Status:** ✅ DONE 2026-10-22 — svh/dvh lines added after bare vh. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/css/main.css:157, platform.css:9, lobby.css:38,742,748
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F6), lobby mobile; recorded, not built   **Depends:** —

## Problem
Full-height mobile layouts use 100vh, which ignores the collapsing browser toolbar.
## Scope
1. Add a following 100svh/100dvh line (vh stays as fallback) at each site; check calc(100vh - N) max-heights.
## Don't
- Don't change desktop behaviour.
## Why this way
Rule LAY-VIEWPORT-UNITS of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3110
