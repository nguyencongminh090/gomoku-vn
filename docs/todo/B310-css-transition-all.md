# B310 — 12 uses of transition: all
**Status:** ✅ DONE 2026-10-22 — 15× transition: all → explicit transition-property list. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/css/main.css:227,299,357; lobby.css:90,130,161,383,459,504,540,573,649
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F5), lobby mobile; recorded, not built   **Depends:** —

## Problem
'transition: all' also animates layout properties.
## Scope
1. Replace each with the properties that actually change (colour, background, border, transform, opacity, shadow).
## Don't
- Don't change durations or easing.
## Why this way
Rule DEP-COMPOSITOR-ONLY of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3100
