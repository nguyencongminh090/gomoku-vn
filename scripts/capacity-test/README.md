# Capacity test harness

Permanent, repeatable version of the one-off stress test in
`docs/stress-test-report.md`. See `TODO.md` #26 and `instruction.md` §B26 for
why this exists and what it fixes versus the earlier scratchpad scripts
(single-process load generation and a compressed 400ms/move pace both
understated real concurrency / weren't human-realistic).

**Not part of `npm run test:e2e`.** This creates real rooms and sockets
against a running server and is resource-destructive — it must not run mixed
into the normal functional test suite.

## Usage

1. Start the server (`npm start`, or `MAX_ROOMS=... npm start` to test above
   the real production cap — see below).
2. Run:
   ```
   node scripts/capacity-test/orchestrator.js [options]
   ```

### Options (all optional, shown with defaults)

| Flag | Default | Meaning |
|---|---|---|
| `--rooms=3` | `3` | Total rooms to create, spread across workers |
| `--workers=3` | `3` | Number of forked OS processes generating load |
| `--serverUrl=http://localhost:3000` | | Target server |
| `--moveDelayMinMs=1200` / `--moveDelayMaxMs=3500` | | Randomized per-move pacing (human-like, not the compressed 400ms used in the earlier one-off tests) |
| `--maxMovesPerGame=30` | | Cap on moves played per room before moving on |
| `--maxP95LatencyMs=800` | | Pass/fail threshold for move round-trip latency |
| `--minRoomSuccessRate=1.0` | | Pass/fail threshold for room-creation success rate |

### Default run (real production caps)

```
npm start
node scripts/capacity-test/orchestrator.js --rooms=3
```

**Important:** all workers on one test machine share a single source IP, so
against real caps this harness is bounded by `MAX_ROOMS_PER_IP` (default 3),
not the higher `MAX_ROOMS` (default 50, raised from 10 — see TODO.md #31) —
confirmed empirically: a `--rooms=10` run against real caps from one machine
reliably creates exactly 3 rooms and rejects the rest with the real "quá
nhiều phòng" quota message (this matches the already-verified TODO.md #25
finding, it is not a harness bug). Default is set to `3` for exactly this
reason. To exercise the full `MAX_ROOMS` capacity, see below.

### Testing above the real cap / total-room capacity (not per-IP quota)

`server/config.js` reads `MAX_ROOMS` / `MAX_ROOMS_PER_IP` / `MAX_USERS_PER_ROOM`
from the environment (falling back to the real production defaults if unset).
To measure total-room capacity — or capacity beyond production limits —
without ever touching the tracked source file, raise `MAX_ROOMS_PER_IP` (not
just `MAX_ROOMS`) so the single test-machine IP isn't the bottleneck:

```
MAX_ROOMS=100 MAX_ROOMS_PER_IP=100 npm start
node scripts/capacity-test/orchestrator.js --rooms=100 --workers=10
```

Never set these env vars for a real deployment — only for a throwaway local
server started specifically for this test.

## Output

Prints room-creation success rate, moves completed, move-latency p50/p95/p99,
and any errors, then a `PASS`/`FAIL` verdict with exit code 0/1 based on the
`--maxP95LatencyMs` / `--minRoomSuccessRate` thresholds (also fails on any
in-play error, e.g. an unexpected `game:error`).

## What this intentionally does not do

- Does not test the guest-auth endpoint's own rate limiting (identities are
  minted JWTs, same bypass as `e2e/flood-protection.spec.ts` — see that
  file's header comment for why).
- Does not exercise Wall/Portal/Swap2 rules — default room settings only,
  since the point is socket/room/game-loop capacity, not rule coverage
  (that's `e2e/*.spec.ts`).
