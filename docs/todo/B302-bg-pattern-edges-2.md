# B302 — Paper-grid + leaves background still strong at both page edges
**Status:** OPEN
**Area:** client/css/platform.css (shared body.pl / zen-lobby pattern)
**From:** lobby UI audit round 2 (user, 2026-10-19)   **Depends:** B296

## Problem
Follow-up to #296 (already x0.75 leaves, grid fades over the outer 8%): at 1440 dark the leaves on the right rim and the grid lines near both edges still read heavy next to the cards.
## Scope
1. Lower edge opacity a further step (e.g. leaves x0.6, wider grid fade) and compare before/after screenshots at 1440 + 1920 in both modes. 2. Keep the centre column untouched.
## Don't
- Don't remove the pattern or change the home layout; don't touch non-lobby pages' composition.
## Traps
- Pattern is shared by all platform pages; check rankings/profile too. Cards' shadows sit above it.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-depth-motion.md, vbase-visual-principles.md.
## Done when
- Verified at 375/768/1280/1440, dark + light; `npm test` green.
