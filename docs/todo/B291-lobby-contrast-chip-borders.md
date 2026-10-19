# B291 — Lobby contrast: unselected quick-match chips have no boundary (1.1-1.4:1 vs 3:1 required)
**Status:** OPEN — in progress
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
