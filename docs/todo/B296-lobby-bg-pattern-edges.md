# B296 — Paper-grid + leaves background slightly strong at both page edges
**Status:** ✅ DONE 2026-10-19 — platform.css (shared body.pl/zen-lobby pattern, so all platform pages): leaf opacity x0.75 (desktop) / x0.45 (<=820px, was x0.6); grid ::before mask now also fades the outer 8% of each side (mask-composite intersect with the centre ellipse). Centre column untouched. Compared before/after screenshots 1440 dark + light by eye (375-1440 captured, guest); no numeric metric (edge pixel std is dominated by card content). Change is subtle by design.
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 8 (#282 follow-up).
## Scope
1. Reduce pattern opacity near the edges (mask or lower alpha) without touching the centre column.
## Don't
- Do not remove the pattern or change the home A7.1 composition.
## Traps
- Check light and dark skins; pattern is behind `.ppanel` shadows.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-depth-motion.md.
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
