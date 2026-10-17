# 2026-10-17 19:00 — #275 Puzzle guests/visitors see the prompt up front
## Prompt
Do #273 - 276 (ux-audit puzzle findings).
## Root cause
Pages only learned "members only" from a failing API call; guests passed the `me.ok` check (see #273).
## Fix
Solve page shows `#pz-login` on load for non-members; editor shows `#ed-error` instead of the form for guests; /puzzles hides `#pz-actions` and /puzzles/mine skips the `/api/puzzles/mine` probe (and hides its actions) when `GvnSession.getUser()` is null/guest.
## Verification
jsdom: solve guest/member, editor guest, mine-without-session (no API call), list actions hidden for anon/guest, shown for member. Not run: real-browser pass. cache-bust --write/verify OK; npm test 3317 pass.
