# B229 — index.html: subscribe to `lobby` only while the rooms screen is open
**Status:** ✅ DONE 2026-10-12 (uncommitted) — fix-log 2026-10-12-b229; transfer script not re-run
**Area:** client/js/lobby.js (`client.emit('lobby:subscribe')` at load), client/js/lobby-home.js (`showScreen`, `setSubscribed`)
**From:** audit #226 finding F2, 2026-10-12   **Depends:** — (coordinate with #228)

## Problem
lobby.js subscribes unconditionally, so dashboard/tournaments screens get every `lobby:patch`
(311 B × all tabs per room change; 187 KB per game setup @200 tabs) and the full online list (#230).
Measured: `docs/notes/2026-10-12-socket-transfer-audit.md`.
## Scope
1. Subscribe when the rooms screen becomes visible (and tab visible), `lobby:unsubscribe` when it leaves — mirror lobby-home's `home` handling.
2. Re-subscribe on reconnect only if the rooms screen is showing (#228).
3. jsdom tests: screen switches emit subscribe/unsubscribe; snapshot on re-entry rebuilds the list.
4. Re-run `scripts/measure-socket-transfer.js` with dashboard tabs → `lobby:patch` to them = 0.
## Don't
- No server payload change. Don't drop the online count on the dashboard (it comes from `home:stats`).
## Traps
- `room:joined` auto-redirect in lobby.js must keep working on all screens (it is a per-socket emit, not lobby-room traffic — verify).
- PrivateChat's online data currently arrives via `lobby:online_users`; on non-rooms screens it would go stale → settle with #230.
## Why this way
Subscribe-only-when-visible, same as #225's `home`. Rejected: server-side filtering by screen (server doesn't know the screen).
## Done when
- Tests + `npm test` green; measurement shows no lobby traffic to dashboard tabs; real-browser screen switch pass; `?v=` bumped.
