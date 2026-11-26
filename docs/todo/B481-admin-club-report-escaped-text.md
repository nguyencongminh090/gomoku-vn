# B481 — Admin club report queue shows escaped text (`&lt;`)
**Status:** OPEN
**Area:** `client/js/admin-clubs.js` (report rows), `client/tests/admin-clubs.test.js`
**From:** #476 real-browser pass, 2026-11-26   **Depends:** —

## Problem
Club message bodies are stored escaped (`DmText.clean`: `<` → `&lt;`). The /admin club report queue prints
`excerpt`, `prior[].body` and `later.body` raw, so a reported "15 phút <sửa>" reads "15 phút &lt;sửa&gt;".
## Scope
1. Decode with `EscapeUtils.decodeChatText` (as `club.js` does) before `textContent`, for excerpt, prior and later.
## Don't
- Use `innerHTML` to "fix" the entities.
## Done when
- jsdom: a report with `&lt;b&gt;` in excerpt/prior/later renders `<b>` as text, no `<b>` element.
