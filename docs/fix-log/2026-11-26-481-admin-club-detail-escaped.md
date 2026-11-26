# 2026-11-26 18:13 — #481 follow-up: admin club detail message list shows escaped text
## Prompt
"fix the admin club detail &lt; too"
## Root cause
Same as #481: club message bodies are stored escaped (`DmText.clean`); `admin-clubs.js` `detail()` printed `m.body` raw. Club name/description are stored raw (`validateText`), so they are left alone.
## Fix
- `client/js/admin-clubs.js` `detail()`: `m.body ? decode(m.body) : m.kind` (guard: `decodeChatText(undefined)` would print "undefined").
- Branch `fix/481-admin-club-detail-escaped` off dev; cache-bust `--write` (admin.html).
## Verification
- New test in `client/tests/admin-clubs.test.js` (escaped body, empty body, null body): fails before, passes after.
- Real server + throwaway DB, /admin → Hội nhóm → club: row reads "… · 15 phút <b>sửa</b>", no element, 0 console errors.
