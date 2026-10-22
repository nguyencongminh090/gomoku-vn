# B322 — Club list rows: two badges squeeze the club name column (name wraps per word)
**Status:** ✅ FIXED 2026-10-22 (real-browser pass 414/375/320 + jsdom; rank-badge wrap case unseen)
**Area:** client/js/clubs.js:32-35 (`row`), client/css/platform.css `.prow` / `.pbadge`
**From:** ux-audit clubs.html mobile, 2026-10-22 (`.audit/ux-audit-2026-10-22-clubs-mobile.md`, evidence `docs/audits/2026-10-22/clubs-mobile-*`)   **Depends:** —

## Problem
Rank badge + policy badge sit right of the body: `.prow__body` is 181 px at 414, 142 at 375, 87 at 320 (`clubs-mobile-metrics.json`); user screenshot shows "FLASH / TEAM" wrapped and "Hạng #1" + "Công khai" taking ~45% of the row.
## Scope
1. Show the policy badge only for `invite` ("Theo lời mời"); "Công khai" is the default.
2. At ≤480px let `#cl-list .prow` wrap so any remaining badge sits on its own row under the body.
3. Keep rank badge; confirm with user if the open badge should instead stay (taste).
## Don't
- Do not change the Mine list badges (role) or the club page header badge.
## Traps
- Removing the open badge changes information density; it is the one taste call here.
## Why this way
Gives the name the width back without new components. Rejected: smaller badges (still 14px-floor text). Knowledge: none.
## Done when
- 414/375/320: name on one line when it fits (≥ 55% of row width), screenshots attached.
- jsdom assert: open club has no policy badge, invite club has one; `npm test` green; cache-bust OK.
