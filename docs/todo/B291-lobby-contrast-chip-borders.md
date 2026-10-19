# B291 — Lobby contrast: unselected quick-match chips have no boundary (1.1-1.4:1 vs 3:1 required)
**Status:** ✅ DONE 2026-10-19 — Measured (computed styles + WCAG formula), dark skin: unselected chip boundary before = none (bg 1.20:1 vs card; --c-border 1.36:1) -> after 1px border rgb(136,132,125) = 4.15:1 vs card, 3.47:1 vs chip fill. Light skin from tokens: before 1.12-1.32:1 -> 3.73:1 / 3.34:1 (not checked in browser). Text already passes: ink-2 on card 6.23:1 dark / 6.76:1 light; ink-3 qm-grp 5.24:1 / 6.07:1 (on chip fill 4.39:1 dark, no text on chip uses ink-3). No text colour change needed.
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 3. Measured from tokens (WCAG 1.4.3 / 1.4.11): text passes, chip boundary fails.
## Scope
1. Add a 1px border to `.hp-qm .pchip` using `color-mix(in srgb, var(--c-ink-2) 75%, var(--c-surface))`.
2. Record measured before/after in the fix commit and here.
3. Small text (.muted .small 12.5px, qm-grp 12px) passes 4.5:1 already; size bump not done.
## Don't
- No hard-coded colours; do not touch global `.pchip` on other pages.
- Keep ✓ on the selected chip (state not colour-only).
## Traps
- Other skins in tokens.css override --c-ink-2/--c-surface, so color-mix adapts; verify one non-default skin.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-color.md, docs/knowledge/ui-ux/a11y-wcag-essentials.md.
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
