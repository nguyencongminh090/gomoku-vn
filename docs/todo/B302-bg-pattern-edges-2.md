# B302 — Paper-grid + leaves background still strong at both page edges
**Status:** ✅ DONE 2026-10-19 — platform.css only (shared by every body.pl page): leaves x.75 → x.6 (desktop), x.45 → x.35 (<=820px); grid fade band 8% → 14% per side. Edge-strip luminance std with all content hidden (left/right ~8% of width, guest, lobby): 1440 dark L 4.64→3.53 R 6.09→4.70; 1440 light L 4.79→3.67 R 3.88→2.88; 1920 dark L 4.67→3.60 R 5.93→4.62; 375 dark L 2.50→1.71 R 2.81→1.93 (about -23…-32%). Centre column untouched. Checked by eye 1440 dark+light. Not checked: other platform pages (rankings/profile), 768/1280 screenshots, a real ultrawide.
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
