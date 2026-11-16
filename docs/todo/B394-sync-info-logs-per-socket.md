# B394 — Info logs are written synchronously on every socket connect/disconnect/grace/timer start
**Status:** OPEN
**Area:** `server/utils/logger.js`, call sites in `SocketHandler.js`, `DisconnectHandler.js`, `TimerManager.js`
**From:** #388 storm profile 2026-11-16 (`mixed.sh`, `--cpu-prof`)   **Depends:** —

## Problem
In the 1 000-socket storm `logger.info` costs ~264 ms CPU of ~1.1 s app work (≈ 25 %): Connected/Disconnected,
grace start/cancel, rejoin, `TimerManager.start`. `console.*` to a file/pipe is a blocking write. `LOG_LEVEL` is not
read by the logger (mixed.sh sets `LOG_LEVEL=warn`, info still printed). Spread over many ticks, not one long one.

## Scope
1. Decide with the owner which per-socket info lines are still needed in prod (log.txt is used to look at real users).
2. Then: honour `LOG_LEVEL`, and/or buffer stdout writes, and/or demote per-move/per-timer lines to debug.

## Don't
- Don't silence logs only in the perf harness to make numbers look better.

## Traps
- `log.txt` is gitignored (real users/IPs). Changing the line format may break whoever greps it.

## Done when
- Storm profile: logger share before/after in the fix-log; chosen prod log lines confirmed by the owner.
