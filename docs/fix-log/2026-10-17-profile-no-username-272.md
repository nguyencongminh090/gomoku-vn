# 2026-10-17 18:00 — #272 /profile.html without /u/<name> called a 404 API
## Prompt
Do #272 (ux-audit finding).
## Root cause
`profile.js` derives `username` from `location.pathname` by stripping `/u/`; on `/profile.html` nothing is stripped, so the whole path became the username → `GET /api/profile/%2Fprofile.html` 404 + console error.
## Fix
`profile.js` DOMContentLoaded: if the path has no `/u/<name>` segment, `location.replace('/')` and return before building the shell or fetching.
## Verification
profile-page.test.js: new #272 case (fails without the fix: fetches the 404 URL); 33 pass. cache-bust --write/verify OK. Not run: real-browser pass.
