# B312 — z-index literals 900–2500, no scale
**Status:** ✅ DONE 2026-10-22 — --z-* scale in main.css :root, values unchanged. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/css/lobby-zen.css:704, settings-panel.css:11, lobby.css:400, main.css:378,192, one at 900
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F7), lobby mobile; recorded, not built   **Depends:** —

## Problem
Layers use ad-hoc numbers; stacking order is implicit.
## Scope
1. Define --z-dropdown/--z-sheet/--z-modal/--z-toast in tokens.css preserving current order.
2. Replace literals.
## Don't
- Don't reorder any current layering.
## Why this way
Rule LAY-Z-SCALE of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3120
