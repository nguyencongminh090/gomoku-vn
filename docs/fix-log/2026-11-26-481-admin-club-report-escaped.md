# 2026-11-26 17:27 — #481 Admin club report queue shows escaped text
## Prompt
"Do #481 482 483"
## Root cause
Club bodies are stored escaped on the wire (`DmText.clean`: `<` → `&lt;`, the chat-XSS design). `club.js` decodes at render; `admin-clubs.js` printed `excerpt`, `prior[].body`, `later.body` raw, and `admin.html` never loaded `escape-utils.js`.
## Fix
- `client/admin.html`: load `js/escape-utils.js` before `admin-clubs.js`.
- `client/js/admin-clubs.js`: `decode()` (`EscapeUtils.decodeChatText`, as club.js) on excerpt, prior and later bodies; still `textContent`, no `innerHTML`.
- Left alone: the club-detail message list (`detail()`, `m.body`) has the same raw print; not in scope.
- Branch `fix/481-483-club-chat` (off dev: code only on dev); cache-bust `--write` (admin.html).
## Verification
- 2 new tests in `client/tests/admin-clubs.test.js` (decoded text, no `<b>` element; page loads escape-utils first): fail before, pass after.
- Real server + throwaway DB, /admin → Hội nhóm: report of "15 phút <b>sửa</b>" shows the text literally, no element, 0 console errors.
