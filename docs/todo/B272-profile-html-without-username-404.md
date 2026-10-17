# B272 — /profile.html without /u/<name> calls a 404 API
**Status:** DONE
**Area:** client/js/profile.js:283
**From:** ux-audit 2026-10-17 (`docs/audits/ux-audit-2026-10-17.md`)   **Depends:** —

## Problem
Typing /profile.html fetches /api/profile/%2Fprofile.html → 404 + console error. /u/<name> is clean.
## Scope
1. Redirect to / (or own profile) when the path has no /u/ segment, before fetching.
## Don't
- Don't touch anything beyond the listed lines; no token redesign.
## Done when
- No 404/console error on /profile.html; test kept.
