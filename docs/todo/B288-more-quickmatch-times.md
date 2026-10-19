# B288 — Quick-match: more time presets, per-game vs per-move labelled
**Status:** MERGED to dev 2026-10-19 (real-browser pass of m30 match still unverified)
**Area:** server/managers/MatchQueue.js (PRESETS, timeLabel), server/socket/handlers/MatchHandler.js, client/js/lobby-home.js, i18n, shell.css
**From:** user, 2026-10-19 (home "Thời gian" didn't say per game vs per move)   **Depends:** —

## Scope
1. Per-game (blitz): add `1+1`, `7+3` to `1+0 3+2 5+3 10+0`. Per-move (`per_move`): `m60 m45 m30 m5`.
2. Home chips in two labelled groups (Cả ván / Mỗi nước); per-move chip reads "30s/nước".
3. Time **Auto** (new default chip): auto+auto → `m60`; auto+X → X; X+Y (X≠Y) never pair; X+X pair. Rule/rated/board must still match (`poolKey`, `compatible`, `resolveTime` in MatchQueue). Lobby count = same clock + autos (auto pick: whole rule); ETA keyed by raw `rule|auto`.
## Don't
- Don't rename existing keys (`caro|5+3` queue/ETA keys). No queue grouping — each preset is its own bucket (user decision).
## Traps
- PRESETS is also read by ChallengeService (friend challenge) → new presets valid there too.
- 5s/move is the RoomManager minimum; server-side clock, check lag on a real browser pass.
## Done when
- jest MatchQueue + lobby-home green; ?v= bumped; real-browser pass of a `m30` match (unverified).
