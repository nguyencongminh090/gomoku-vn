# B228 — Lobby/tournament lists freeze after a socket reconnect
**Status:** ✅ FIXED 2026-10-12 — merged to dev (5bb0fcd); fix-log 2026-10-12-b228
**Area:** client/js/lobby.js (`lobby:subscribe`), client/js/tournaments.js (`tournament:subscribe`, `live_matches:subscribe`)
**From:** audit #226 finding F3, 2026-10-12 (code-read)   **Depends:** #227 (manual reconnect after server restart)

## Problem
The three subscribes are emitted once at page load. A reconnect is a new server socket in no rooms
(server joins `lobby` / tournament-list / live-matches rooms only on subscribe), so the room list,
online line and tournament lists stop updating until reload. `lobby-home.js:268` already re-subscribes `home` on `connect`.
## Scope
1. Reproduce first: real server copy, open lobby, force a reconnect (server restart → #227 path), create a room from another client → row does not appear.
2. Re-emit each subscribe on `connect` after the first one (snapshot comes back with it: `lobby:update`, `tournament:list`, `live_matches:list`).
3. jsdom test per module: second `connect` → subscribe emitted again; regression test kept. Fix-log entry.
## Don't
- No server change; no change to what the snapshots contain (F1/F2 are #230/#229).
## Traps
- The first `connect` may fire after the load-time emit → don't double-subscribe on first load (harmless but doubles the F1 list).
- If #229 lands first, lobby subscription is screen-dependent: re-subscribe only when the rooms screen is visible.
## Why this way
Same pattern lobby-home uses for `home`. Rejected: server auto-joining `lobby` on connect (every tab would get lobby traffic — the opposite of #229).
## Done when
- Reproduced, then fixed; jsdom tests green; `npm test`; real-browser pass across a server restart; `?v=` bumped.
