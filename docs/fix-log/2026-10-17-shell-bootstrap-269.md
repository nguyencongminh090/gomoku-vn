# 2026-10-17 15:08 — #269 /api/shell bootstrap + no duplicate rankings/me
## Prompt
"Optimize Request per loading" → measure → "làm cả (a) và (b)".
## Root cause
Every member page's nav fired /api/notifications + /api/rankings/me + /api/admin/me; settings/rankings/forum/puzzle(-editor) then fetched rankings/me again.
## Fix
New GET /api/shell → {me, admin, notifications} (bodies built by the same code: rankings.buildMe, roles, NotificationService). platform-shell loadShell()/fetchMe() (15 s shared, fallback to old endpoints); page scripts use PlatformShell.fetchMe(); api-early starts /api/shell. Old endpoints and polls unchanged.
## Verification
Isolated server, Chromium, warm cache API requests: lobby 6→4, rankings 7→4, settings 6→3, profile 5→3 (cold: -2/-3/-3/-2). New server/tests/shell-route.test.js, platform-shell + api-early tests updated; npm test green.
