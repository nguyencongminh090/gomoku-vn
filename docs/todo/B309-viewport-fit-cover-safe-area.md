# B309 — Viewport meta lacks viewport-fit=cover; tab bar safe-area padding inert
**Status:** ✅ DONE 2026-10-22 — viewport-fit=cover on the 16 pages loading platform-shell.css. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/*.html viewport meta, client/css/platform-shell.css:68
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F4), lobby mobile; recorded, not built   **Depends:** —

## Problem
.ptabbar pads with env(safe-area-inset-bottom) but the meta has no viewport-fit=cover, so the inset is 0 on notched phones.
## Scope
1. Add viewport-fit=cover to pages that load platform-shell.css.
2. Check content is not hidden under the notch/home indicator in landscape.
## Don't
- Don't add it to pages without safe-area padding.
## Why this way
Rule LAY-SAFE-AREA of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3090
