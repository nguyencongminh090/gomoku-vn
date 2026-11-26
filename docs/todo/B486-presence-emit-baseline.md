# B486 — Presence: emit-count baseline per transition (PS-1)
**Status:** ✅ DONE 2026-11-27 — `server/tests/presence-emit-baseline.test.js` (7 tests). Measured: room-page tab switch = 2 inbound → 1 `room:updated` + 1 `lobby:online_patch` (F1 confirmed, 2nd report is a no-op); drop mid-game = `game:interrupted` + `room:updated` + patch; reconnect = `game:resumed` + `game:init` + `room:updated` + patch; hide flip = 1 patch. F3 confirmed: socket-client.js forces `presence:set` on connect (before `room:join`), member reads away for one `room:updated`.
**Area:** server/tests/presence-emit-baseline.test.js
**From:** features/presence-status (planning §5), 2026-11-27   **Depends:** —

## Problem
planning §5 message counts are derived from code, not measured. The refactor must keep broadcast cost ≤ today.
## Scope
1. Jest + fake timers over the real handlers (state.js, RoomHandler, SocketHandler, DisconnectHandler) with a recording io.
2. Count outbound emits per event name for: room-page tab switch, lobby-page tab switch, socket drop mid-game, reconnect mid-game, hide_online flip.
3. Check F3 (fresh room-page load briefly `away`).
## Don't
- Change production code.
## Done when
- Kept test pins today's counts; later items may lower, never raise them.
