# B320 — Club list search: failed fetch is an unhandled rejection with stale/false status
**Status:** ✅ FIXED 2026-10-22 (real-browser pass + jsdom)
**Area:** client/js/clubs.js:41-43 (`loadList`)
**From:** ux-audit clubs.html mobile, 2026-10-22 (`.audit/ux-audit-2026-10-22-clubs-mobile.md`, evidence `docs/audits/2026-10-22/clubs-mobile-*`)   **Depends:** —

## Problem
Offline (or a thrown fetch) during search: `pageerror: Failed to fetch`, list unchanged, status keeps an old/false "Chưa có CLB nào." under the new query (`docs/audits/2026-10-22/clubs-mobile-B13-offline.png`). The `!res.ok` branch also leaves the old list on screen.
## Scope
1. Wrap the fetch in try/catch; on throw and on `!res.ok` set `#cl-status` to `t('clubs.error')` and clear `#cl-list` and the pager.
2. jsdom test: rejected fetch and 500 response both show the error text and empty list; no unhandled rejection.
## Don't
- No retry button or offline banner (separate decision); same for `loadMine`.
## Why this way
Smallest change in the one function; reuses the existing `clubs.error` key. Knowledge: none.
## Done when
- Offline search shows the error line, 0 pageerrors.
- New jsdom test + `npm test` green; cache-bust OK.
