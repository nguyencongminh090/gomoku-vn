# B339 — Profile name wraps one syllable per line at ≥861px
**Status:** OPEN
**Area:** client/css/platform.css (~L85, L489-493), client/profile.html
**From:** ux-audit of /u/<name> (user screenshot), 2026-10-23   **Depends:** —

## Problem
At ≥861px the right column is `minmax(440px, auto)` and `h1` has `padding-right:140px` + `overflow-wrap:anywhere`; name column ≈220px → ~80px text → "Ngu/yễn/Min/h" (Severity High, layout collapse).
## Scope
1. Reproduce at 1280/1440 with a long display name (jsdom can't; use real-browser pass).
2. Drop h1 padding-right; give the Edit button its own row under the name (or let h1 `overflow-wrap:break-word`).
3. Regression test: CSS no longer pairs `padding-right` reserve with the narrow column (assert on stylesheet) + browser screenshot 1024/1280/1440.
## Don't
- Don't change avatar size (128px, see .audit/profile-avatar-proportion.md) or the stats grid.
## Traps
- `.phead` is shared with club/social pages (`.pprofile` scope) — keep selectors scoped.
- Mobile (≤860px) layout already works; don't touch it.
## Why this way
Root-cause fix in layout, not a smaller font. Rejected: shrinking column 3 min (breaks stats grid).
## Done when
- Name renders on ≤2 lines at 1024/1280/1440 for a 20+ char name; Edit button not overlapping.
- `npm test` green; cache-bust --write.
