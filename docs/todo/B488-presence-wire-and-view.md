# B488 — Presence: wire field `st` + client presence-view (PS-3)
**Status:** OPEN
**Area:** server payloads (friends, online list, room users), client/js/presence-view.js, i18n
**From:** features/presence-status (planning §2c/§2d tone table), 2026-11-27   **Depends:** #487
## Scope
1. Add `st` (and `graceUntil` on room members) beside existing fields; old fields stay (#498 removes).
2. `presence-view.js` UMD: `describe()`/`dot()` per the tone table; i18n `presence.*` vi+en.
3. Node tests for describe(); cache-bust --write.
## Traps
- Online-list entries are diffed by `JSON.stringify` (`_diffOnlineUsers`): `st` there must be the `public` projection only (or absent) — `k`/`r`/`t` would re-send a patch on every game start/end.
- Room `users[]`: `graceUntil` changes only on drop/return — fine.
## Done when
- Old cached clients unaffected (payload superset); describe() covers every tone-table row.
