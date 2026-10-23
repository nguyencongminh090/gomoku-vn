# B343 — Clubs panel: unexplained gap under heading
**Status:** ✅ FIXED 2026-10-23 (branch fix/339-343-profile-polish; jsdom + CSS tests; browser pass done)
**Area:** client/profile.html:58-60, client/css/platform.css (.ppanel/.ph2/.prows)
**From:** ux-audit of /u/<name> (user screenshot), 2026-10-23   **Depends:** —

## Problem
In the screenshot the Câu lạc bộ panel has a large gap between the h2 and first row; cause unknown (L2, Low).
## Scope
1. Inspect in real browser (computed margins on .ph2 / .prows / .prow).
2. Fix at the producing rule; screenshot before/after.
## Don't
- Don't restyle other .ppanel uses.
## Traps
- May be intentional row padding — measure before changing.
## Why this way
Measure first.
## Done when
- Gap equals the other panels' heading→content spacing (≤16px); cache-bust.
