# 2026-11-16 08:18 — #395 home/online flush fan-out: measured, no code change
## Prompt
"Do #395"
## Root cause
None in the fan-out. The 21 ms / 14 ms in the #388 storm profile are not the emit write side or the flush compute.
Isolated measurements (scratchpad scripts, real socket.io server + 500 websocket clients in room `home`):
- `io.to('home').emit('home:stats', …)` to 500 sockets: 0.4–0.8 ms per flush (first call 5 ms, JIT warm-up).
- flush compute with 500 playing rooms: `liveOf` 0.26 ms, `playingCount` 0.03 ms, `liveKey` 0.07 ms.
- socket.io encodes once per `io.to(room).emit`; `_flush` already skips emits when stats/liveKey are unchanged.
So a flush is ~1 ms unloaded; the profiled 14–22 ms were the flush landing inside an already-busy storm tick
(profiler inflation / GC / queued writes), i.e. the symptom of #396, not a cost of its own.
## Fix
None. Chunking the fan-out across ticks would add code and latency for ≈ 1 ms of work (and the Todo's Don't forbids slowing the cadence).
## Verification
Measured only (unloaded). Not re-measured inside the storm; if #396 is fixed and flush spans still show > 5 ms, reopen.
