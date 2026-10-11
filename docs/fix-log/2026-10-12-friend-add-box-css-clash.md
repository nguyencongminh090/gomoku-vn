# 2026-10-12 — #231/#232 add-friend input rendered as a small box inside a grey bar
## Prompt
Screenshot of social.html: the "Thêm bạn" input is ~190 px wide inside a wider grey container. "Issue: UI textbox for input name#code".
## Root cause
New class `.psearch` collided with the existing rankings search `.psearch` (platform.css: flex + `--c-fill` background + `input{width:180px}`), which won by source order.
## Fix
Renamed to `.padd` (social.html + platform.css). `?v=322`.
## Verification
Jest guard in client/tests/social-add-friend.test.js: the form's class has exactly 2 CSS definitions, none with flex/180px. Screenshot not taken here.
