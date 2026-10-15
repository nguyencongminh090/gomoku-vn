# 2026-10-15 18:54 — untracked profile page: club avatar not shown
## Prompt
"Currently, I see that Club Avatar not update on profile" (after adding consistency rule #9)
## Root cause
`client/js/profile.js` club rows called `SHELL().avatar(null, …)` — URL hard-coded to null — although
`ClubService.clubsOfUser` already sends `avatarUrl` (with `?v=avatar_v`). Server/DB were correct; one page ignored the shared field.
## Fix
Pass `c.avatarUrl`. Regression test in `client/tests/profile-page.test.js` (club row renders the sent image). Cache-bust → v=374.
Not fixed (recorded): no-image fallback differs — club page/`clubs.js:32` pass `{color, tag}`, profile and `clubs.js:94` don't; `clubsOfUser` omits color/tag.
## Verification
profile-page suite green (new test failed before fix). Full npm test: only compression/lobby-home flaked under load, both pass alone (compression also fails on clean dev). No real-browser pass yet.
