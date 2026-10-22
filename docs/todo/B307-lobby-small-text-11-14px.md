# B307 — Lobby text at 11–14px; set a 14px floor
**Status:** ✅ DONE 2026-10-22 — calc(10–13px) font sizes raised to 14px; badge 10px/.pav--xs 9px accepted as exception. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet. FLOOR DECISION 2026-10-22: 12px (--text-xs) kept, not 14px; modal 10.5/11.5px fixed — fix-log 2026-10-22-lobby-text-floor-307.
**Area:** client/css/platform.css (74 font-size decls, calc(11–14px * --fs-scale)), .pchip/.ptab 13px
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F2), lobby mobile; recorded, not built   **Depends:** —

## Problem
Chips, labels and captions on the lobby render at 11–14px; body font-size floor (16px) not verified.
## Scope
1. Verify body font-size in main.css/platform.css.
2. Raise chip/label/caption minimum to 14px, keep --fs-scale multiplier.
3. Screenshot lobby 375 before/after.
## Don't
- Don't remove --fs-scale. Don't resize the board text.
## Why this way
Rule TYP-BODY-SIZE of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3070
