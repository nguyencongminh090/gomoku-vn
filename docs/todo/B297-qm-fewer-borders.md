# B297 — Quick-match card: chips, secondary actions and "Xem" buttons are all the same grey outlined box
**Status:** ✅ DONE 2026-10-19 — chip = lighter fill (--c-surface-2) + 1px border mixed 62% (was 75%); secondary actions (Giao hữu / Thách bạn bè) and every "Xem" button = pill (new skin-independent --radius-pill) so shape separates action from chip; #293 dim no longer uses opacity. Selected chip keeps brand fill + ✓. Measured 1280 dark (WCAG 1.4.3/1.4.11), before → after: chip border 4.15 → 3.29; secondary-action border 1.36 → 7.37 (was FAILING 3:1); unselected time chip text 3.36 → 5.24 (opacity .7 broke 4.5:1); group labels "Cả ván/Mỗi nước" 3.31 → 5.24; selected chip fill vs card 3.16 (unchanged). Light mode: see fix-log of the round.
**Area:** client/css/shell.css, client/css/tokens.css
**From:** lobby UI audit round 2 (user, 2026-10-19)   **Depends:** B291, B293, B295

## Problem
Chip, "Giao hữu", "Thách bạn bè" and every "Xem" share one dark-grey outlined box → the form reads as a grid of cells and a secondary action is mistaken for a chip.
## Scope
1. Chips: light fill + thin border. 2. Secondary/view buttons: their own shape. 3. Keep boundary ≥ 3:1, selected = fill + ✓. 4. Re-measure.
## Don't
- No JS/markup change; no new hard-coded colours (tokens only).
## Traps
- `opacity` on a group lowers text AND border contrast — dim with fill/colour instead.
- Skin blocks must define a full token set (skin-contrast test) → skin-independent tokens go in the last `:root` block.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-layout-spacing.md (background/space over borders), vbase-depth-motion.md (signifiers), vbase-color.md (4.5:1 / 3:1).
## Done when
- Measured before/after at 375/768/1280/1440, dark + light; `npm test` green.
