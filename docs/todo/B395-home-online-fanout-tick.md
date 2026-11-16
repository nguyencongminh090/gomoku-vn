# B395 — home-feed and online-list flushes fan out to every watcher in one tick (~20 ms each)
**Status:** OPEN
**Area:** `server/socket/home-feed.js` `_flush`, `server/socket/state.js` online-users flush (`:773`, `_diffOnlineUsers`)
**From:** #388 storm profile 2026-11-16   **Depends:** —

## Problem
With 500 watchers the online-count changes on every connect, so during the storm each 1.5 s flush emits to all
subscribers: home-feed `_flush` 21–22 ms and online flush ~14 ms, both inside the longest storm ticks (85–88 ms,
profiled). Bounded (≤ 1 flush / 1.5 s each) and not storm-scaling, but they stack with other work in one tick.

## Scope
1. Measure per-subscriber cost (encode once? `io.to(room).emit` already encodes once — check the write side).
2. If worth it, spread the fan-out (chunk sockets across ticks) or skip unchanged counts.

## Don't
- Don't slow the 1.5 s cadence for the user-visible counts.

## Done when
- Single-flush tick time before/after at 500 watchers in the fix-log.
