# B290 — Quick-match card: CTA buttons sit under ~14 same-size chips; move them near the top
**Status:** OPEN — in progress
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 2. Defaults are preselected, so the CTA can come first and the chips become "adjust".
## Scope
1. Move `.qm-start` (summary line + actions) in client/index.html to right after the card h2; border-top dashed becomes border-bottom.
2. DOM move (not CSS `order`) so tab order matches visual order (WCAG 2.4.3).
3. Anything beyond display (JS behaviour, collapsing the chips into a disclosure, sticky bar) is recorded here only, not built.
## Don't
- Do not change `#qm-*` ids or lobby-home.js render logic.
- No collapsible/accordion in this item.
## Traps
- `#qm-line` is aria-live; moving it must not change its content or id.
- Mobile: CTA now above the fold — check 375px wraps.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-eye-flow-scanning.md (eye-flow: SKILLS_TREE reference, see INDEX).
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
