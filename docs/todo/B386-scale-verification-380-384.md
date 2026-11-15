# B386 — Verify the #380–#384 perf work under load, on a real-sized DB
**Status:** OPEN
**Area:** `tools/perf/` (`harness.js`, `load.js`, `run.sh`), `server/scripts/slow-routes.js`, `scripts/capacity-test`
**From:** #383/#384 close-out 2026-11-15 — all five were benched in isolation only   **Depends:** #380 #381 #382 #383 #384

## Problem
Each item has a micro-bench (flush, snapshot size, socket lookup, per-route stall) but none was checked together: concurrent play + lobby viewers + a reconnect storm + the DB routes on the same thread. Not verified: real (non-sim) DB, a browser pass of lobby paging, move-ack latency under mixed load.

## Scope
1. Run `tools/perf` at a target size (agree N with the owner) with the stack as on `dev`; record move-ack p50/p99, event-loop stall, lobby bytes/s.
2. Add a reconnect storm (1 000 disconnect + reconnect in one tick) and `slow-routes.js` GETs during play.
3. Real-DB read-only pass of `slow-routes.js` (copy of prod DB, never the live file) — see `playwright-e2e-safety`.
4. Browser pass: lobby online list "more", room list "Xem thêm", reconnect.

## Don't
- Don't fix findings here; each finding becomes its own item. Don't touch the live DB.

## Traps
- `slow-routes.js` already works on a COPY; keep that. `exports/vncaro-sim.db` is synthetic: row counts and index selectivity differ from prod.

## Why this way
One verification item instead of re-opening five closed ones.

## Done when
- Table of numbers (before = pre-#380 commit `5aa0468^`, after = dev) in a fix-log/note; every miss recorded as a new item.
