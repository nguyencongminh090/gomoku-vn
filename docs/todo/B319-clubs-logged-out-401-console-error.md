# B319 — /api/clubs/mine 401 console error on every logged-out /clubs.html visit
**Status:** ✅ FIXED 2026-10-22 (real-browser pass + jsdom)
**Area:** client/js/clubs.js:84 (`loadMine`), called at :119
**From:** ux-audit clubs.html mobile, 2026-10-22 (`.audit/ux-audit-2026-10-22-clubs-mobile.md`, evidence `docs/audits/2026-10-22/clubs-mobile-*`)   **Depends:** —

## Problem
Opening `/clubs.html` without a session logs `401 GET /api/clubs/mine` (red console error) on every visit; ux-audit hard gate = Critical (allowlist in `.audit/config.yml` is empty).
## Scope
1. In `loadMine`, return early (`renderTabs(false)`) when `localStorage.gvn_user` is unset, before the fetch; keep the `!res.ok` branch for expired sessions.
2. jsdom test in `client/tests/clubs-pages.test.js`: no `/api/clubs/mine` fetch when logged out; fetch + Mine tab when `gvn_user` set.
## Don't
- Do not allowlist the 401 instead; do not change the API status code.
## Traps
- `gvn_user` can be set while the cookie is expired: the `!res.ok` branch must still fall back to discover-only.
## Why this way
Guard removes the request; an allowlist would hide a real request every visit. Knowledge: none.
## Done when
- Logged-out visit: 0 console errors (real browser, own port + temp DB per `playwright-e2e-safety`).
- New jsdom test + `npm test` green; cache-bust OK.
