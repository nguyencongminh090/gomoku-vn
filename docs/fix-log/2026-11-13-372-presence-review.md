# 2026-11-13 23:31 — #372 presence/heartbeat review: wrong "online" predicates, per-IP 429s, stale beats
## Prompt
"Review Security with Heartbeat implement … Improve implement if there is potential issue … Sync overall backend with heartbeat. Analyze potential issue/unsync and fix."
## Root cause
#372 replaced every `sessions.has` with `isPresent` (socket ∪ HTTP beat), but callers needed different facts:
- Challenge seat check means "has a socket" → an away room tab lost its seat after 90 s; a social.html beat kept a never-connected seat.
- DM `notify` means "a live push can land" → heartbeat-only recipient (forum/profile, no socket) got notify:false and no socket push = DM with no bell.
- `setHideOnline` re-broadcast only when `sessions.has` → hide_online from settings.html (beat-only) stayed listed (privacy).
- Rate limits keyed per IP (presence 30/min, friends 300/15min with the new 10 s poll) → members behind one IP (CGNAT) 429'd = shown offline. Edges forced a POST per blur/focus/visibility event.
- Logout / admin lock left the beat alive up to ~60 s. Evicted socket could still set presence; repeat reports re-broadcast the room.
## Fix
- state.js: `hasPresentSocket`, `dropHeartbeat`; setHideOnline re-broadcasts for fresh beats too.
- SocketHandler: Challenge `isOnline` = `sessions.has`; DM notify (REST + socket) = `!hasPresentSocket`, live push = any socket (DmService `hasSocket` hook) so an away tab gets both.
- RoomHandler presence handler: ignore non-registered socket; skip room broadcast when `RoomManager.setPresence` reports `changed:false`.
- routes/presence.js + friends.js: loose per-IP flood guard, real budget per member after auth (presence 60/min, friends 300/15 min).
- auth.js logout + AdminUserService.kickLiveSocket → dropHeartbeat.
- platform-shell.js: edges coalesced (250 ms) and sent only on an active/away flip. cache-bust --write (18 files).
- Left alone: no pagehide 'away' beacon (page-to-page navigation would flicker offline); 45 s TTL.
- Branch fix/372-presence-hardening off dev.
## Verification
New: presence-route.test.js, room-handler-presence.test.js, platform-shell-presence-beat.test.js; extended dm-route, presence-global, SocketHandler (hook wiring), RoomManager (changed), admin-users, auth-session-routes. npm test 213 suites / 3759 pass.
NOT verified: real-browser pass (multi-tab, alt-tab, CGNAT), live server.
