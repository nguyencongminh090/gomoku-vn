# B383 — `findSocketsByUserId` scans every socket on each disconnect / kick
**Status:** OPEN
**Area:** `server/socket/state.js` (`findSocketsByUserId`), `server/socket/handlers/DisconnectHandler.js:46`, `RoomHandler.js:214`, `TournamentMatchHandler.js:255`
**From:** perf review 2026-11-15   **Depends:** —

## Problem
O(connected sockets) per disconnect → O(n²) in a mass drop / reconnect storm (not measured). `sessions` (userId → socket) already exists.

## Scope
1. Measure: 10 000 sockets, 1 000 disconnects in one tick.
2. Keep a userId → Set<socket> index maintained at connect/disconnect (a user can briefly hold 2 sockets: old one draining), or prove `sessions` is enough per call site.

## Don't
- Don't change eviction / grace semantics (#367).

## Traps
- `sessions` holds only the newest socket; DisconnectHandler asks "does this user have ANY other live socket" — the draining old socket matters there.

## Why this way
Index lookup is O(1); note `docs/knowledge/be-realtime.md`.

## Done when
- Regression test for the two-socket case; bench before/after.
