# 2026-11-13 14:40 — untracked: lobby online faces show initials instead of avatar photos
## Prompt
"Page Room do not load user avatar correctly" + screenshot of the lobby Phòng tab (online faces `NO`, `QU`; nav avatar fine).
## Root cause
`getOnlineUsersList()` (server/socket/state.js) sent `{userId, displayName, isGuest}` only — no `avatarUrl` — and
`renderOnlineLine` (client/js/lobby.js) hard-coded `PlatformShell.avatar(null, …)`. Two layers, both dropped the URL.
The in-room seat cards were checked in a real browser (isolated server, 1–2 members, reload): they load fine (200).
## Fix
Server: add `avatarUrl` via the same `roomManager.avatarLookup` the room payload uses (null for guests). Client: pass `u.avatarUrl`.
The online diff keys on JSON, so an avatar change is re-sent as a `joined` entry on the next flush.
## Verification
state-online-users (3 new), online-users-delta (shape), online-users-patch (renderOnlineLine → avatar url; red without fix). Full `npm test` 3676 green. `cache-bust` OK.
Not verified: real-browser pass of the lobby after the fix.
