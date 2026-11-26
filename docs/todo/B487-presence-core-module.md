# B487 — Presence: one server derivation module (PS-2)
**Status:** ✅ DONE 2026-11-27 — presence-core + adapter, per-tab beats (F2), D6/D7/D10 via core, grace `until`; tests presence-core + presence-transitions; fix-log 2026-11-27 00:22. Wiring FriendService (D4/D5) is #489 by plan.
**Area:** server/presence/presence-core.js, server/socket/state.js, server/routes/presence.js, FriendService, SocketHandler hooks
**From:** features/presence-status (planning §2), 2026-11-27   **Depends:** #486

## Problem
11 server derivations (planning §1c) each compute status their own way.
## Scope
1. `presence-core.js`: user scope {conn, attn, activity, hidden} + member scope {at, graceUntil}; `statusOf(id, audience)` → wire `st`.
2. state.js helpers (`isPresent`, `isVisiblyOnline`, `hasPresentSocket`) delegate to the core; D6/D7/D10 read core helpers.
3. activity: playing includes room `interrupted`; tournament from `tournamentGameMap`; searching from the match queue.
4. Per-tab heartbeats (`tab` id in POST body; old clients without it = one shared slot) — fixes F2.
5. Tests: one per row of planning §2e/§2f (U1-U19, M1-M11).
## Don't
- Change wire payloads (that is #488) or grace/result behaviour (#493).
## Traps
- A duplicated browser tab copies sessionStorage → both share one beat slot (pre-#487 behaviour, not a regression).
- `sessions` holds only the newest socket; evicted socket reports must stay ignored (U4).
- `setPresence` must never overwrite `disconnected` (M9).
## Why this way
- Pure core + lazy adapter (stores stay put, no require cycle with state.js); per-tab beats over a pagehide beacon (#372 rejected pagehide). Notes: features/presence-status/planning.md §2, docs/knowledge/presence-and-abandonment.md, realtime-reliability-resync.md.
## Done when
- Transition tests green; existing DisconnectHandler / SocketHandler / online-users-delta suites unchanged.
