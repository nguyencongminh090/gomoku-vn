# 2026-10-12 04:07 — #229 index.html subscribes to `lobby` only on the rooms screen
## Prompt
"Do #229" (audit #226 finding F2).
## Root cause
lobby.js emitted `lobby:subscribe` unconditionally at load, so dashboard/tournaments tabs received every `lobby:patch` and the online list.
## Fix
- Subscribe/unsubscribe moved to lobby-home.js `showScreen` (`setLobbySubscribed`, mirrors `home`): rooms screen + visible tab only; visibilitychange toggles; reconnect rejoins only if on rooms (#228 kept). lobby.js no longer subscribes.
- `?v=311`.
- Verified `room:joined` is a per-socket emit (SocketHandler/LobbyHandler), so the auto-redirect still works on every screen.
- Open: PrivateChat's online list (`lobby:online_users`) is stale off the rooms screen → #230.
## Verification
- jsdom: 3 new cases in lobby-home.test.js; resubscribe-on-reconnect.test.js lobby case now asserts no self-subscribe. `npm test` 2919 green.
- Real browser (copy of app, fresh DB, 3 users): dashboard tab got 0 `lobby:*` frames on load, on room create, and while on tournaments; entering rooms gives one `lobby:update` snapshot and renders the list. `measure-socket-transfer.js` not re-run.
