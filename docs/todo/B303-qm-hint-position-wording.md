# B303 — Quick-match: Auto hint says "below" but the presets are above it
**Status:** ✅ DONE 2026-10-19 — wording only (qm.time_auto_hint vi/en + index.html fallback): "bên dưới"/"below" → "ở trên"/"above". Chose the wording change over moving the line (fewer edits, hint keeps sitting next to the Tự động chip's neighbours). Not checked: English at 375.
**Area:** client/js/i18n.js, client/index.html
**From:** lobby UI audit round 3 (user, 2026-10-19)   **Depends:** B298

## Problem
The explanation under the Thời gian chips tells the user to pick a level "below", but both chip rows are above it.
## Scope
1. Fix the wording in i18n (vi + en) and the HTML fallback text.
## Don't
- No layout change, no new copy beyond the direction word.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-layout-spacing.md (proximity: the hint stays attached to its group).
## Done when
- Hint reads "ở trên"; `npm test` green.
