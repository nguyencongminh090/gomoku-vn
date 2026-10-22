# B306 — Lobby mobile: 22 controls under 44px touch target
**Status:** ✅ DONE 2026-10-22 — all lobby/settings/platform controls ≥44px at ≤860px (incl. .pswatch). ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/css/platform.css (.pchip/.pbtn/.ptab), shell.css (.hp-qm chips), lobby link-actions, .pnav__me, .pnav__mode
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F1), lobby mobile; recorded, not built   **Depends:** —

## Problem
At 375px, 15 chips are 38px high, 'Xem phòng/giải đấu/diễn đàn' pills 38–40px, avatar 60×34, theme toggle 40×40; chip gap 8px.
## Scope
1. At max-width 860px raise min-height of chips, link-actions, avatar and theme toggle to 44px (or pad the hit area without growing the visual).
2. Re-measure at 360/375/414; check the quick-match card does not grow past one screenful more than needed.
## Don't
- Don't change desktop sizes. Don't touch the board or room layout.
## Why this way
Rule LAY-TOUCH-TARGET of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3060
