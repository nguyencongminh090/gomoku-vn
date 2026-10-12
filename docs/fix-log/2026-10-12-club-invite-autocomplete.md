# 2026-10-12 — Club "Mời thành viên": no suggestions, exact username only
## Prompt
"'Mời Thành viên' trong CLB không hoạt động? hoặc không có Auto Correct?"
## Root cause
Invite posts `/invites/<text>` and the server resolves the EXACT username (`userIdByUsername`); the input had `autocomplete="off"` and no suggestions, and failures landed in `#cb-msg` at the page top, out of view in the Manage tab. Typing a display name/typo → silent "not found".
## Fix
club.js: after ≥2 chars (250 ms debounce) query existing `GET /api/friends/search`; suggestions list under the form, click fills the exact username. Invite errors also shown in `#cb-invite-msg` beside the field. club.html + platform.css (`.cb-sugg`).
## Verification
clubs-pages.test.js (suggest → pick → submit error shown inline). Not seen in a real browser. Suggestions include existing members (server still answers "already a member").
