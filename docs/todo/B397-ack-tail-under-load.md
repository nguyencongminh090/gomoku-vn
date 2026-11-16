# B397 — Move-ack tail (p99 / max) under load: is it real, and what drives it?
**Status:** OPEN
**Area:** `server/socket/handlers/GameHandler.js` (move ack path), `tools/perf/mixed.sh` + `mixed-summary.sh`
**From:** #394 storm run 2026-11-16 (user: "ack p99/max cao" → separate task; #380–#384 handled this before)   **Depends:** #396

## Problem
`mixed.sh` (2 500 rooms, 500 watchers, 1k storm at 30 s, LOG_LEVEL=info), single run each:
before #394 ack p50 0.3 / p99 18.1 / max 221 ms, server CPU 44 %; after: p50 0.2 / p99 32.5 / max 326 ms, CPU 35 %.
Slow acks cluster at 29.9–30.5 s = the storm second only. Per-run storm times differ 319–2098 ms, so one run per side
cannot tell noise from regression. #386 had measured p99 106 → 9.9 ms after #380–#384; the tail is back at 18–32 ms.

## Scope
1. Re-measure: ≥ 3 runs per side (old `6a9346b` vs dev), compare median p99 / max; report spread.
2. If real: attribute the tail (storm second vs steady state: split the summary by window) and the cause.
3. Fix only what the attribution shows; likely overlaps #396 (storm poll-phase burst) — fold into it if same cause.

## Don't
- Never trade ack latency for CPU (owner rule 2026-11-16): ack/UX outranks CPU savings; a change that lowers CPU but
  raises ack p99/max, or risks a slow/stalled server, is rejected. CPU gains only count if ack is equal or better.
- Don't tune the harness (fewer sockets, LOG_LEVEL=warn) to make p99 look better.
- Don't treat the single-run p99 gap as proof either way.

## Traps
- `mixed.sh` hardcodes `LOG_LEVEL=warn`; for prod-like numbers pass info (a patched copy, not committed).
- Steady-state acks (outside the storm second) are already sub-ms; the tail is storm-only.

## Done when
- Median-of-3 p99/max before/after in the fix-log, with the storm-window split, or closed as noise with the numbers.
