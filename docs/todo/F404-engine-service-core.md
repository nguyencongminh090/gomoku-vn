# F404 — Engine service core (jobs, purposes, rule mapper, output parser)
**Status:** BUILT 2026-11-16 on feature/404-engine-service-core (uncommitted; awaiting commit/merge)
**Area:** new `server/engine/**` (EngineService, JobFactory, RuleMapper, purposes/*, EngineOutputParser, EngineTransport + FakeTransport), `server/tests/engine-*.test.js`
**From:** features/rapfi-engine (user, 2026-11-16: "write TODO")   **Depends:** —

## Problem
No engine layer exists. Need one multi-purpose pipeline (opponent/analysis/verify/hint) that is transport-agnostic.
Design: [backend-design](../../features/rapfi-engine/backend-design.md) §2, §6, §10, §11.

## Scope
1. `EngineTransport` interface + `FakeTransport` (scripted lines) for tests.
2. `RuleMapper`: gomoku-vn settings → engine commands (integration §4): RULE 0/1/8, walls, portals, torus, firstMoveZone via YXBLOCK, YXPLAYSELF/OPPDIST 4.
3. `Job` (Command) + `JobFactory`; one job in flight per engine; job `key` for stale-drop.
4. `EngineOutputParser` (stateful line reducer, matcher registry, all 4 message modes) + golden fixtures captured per mode.
5. Normalizer: eval/winrate to Black's view, mate parse, dedupe repeated first PV cell, `ENGINE_SCALING_FACTOR = 131.3979` (§11).
6. `Purpose` strategies: opponent, analysis, verify, hint; `EngineService` facade; move validation via `GameEngine.makeMove` with one YXBLOCK retry + fallback.

## Don't
- No socket/lease/client code (F405), no WASM build (F406), no bot seat UI (F407). No rating changes.

## Traps
- Eval/winrate are from the side to move; derive side from stone parity, not output.
- Style acts only on wall/portal/torus boards and prints ≥4 PVs; analysis must send STYLE 0.
- Commands sent while thinking are dropped; `ERROR Unknown command: <n>` = desync.

## Why this way
Facade/Strategy/Command/Adapter/Factory ([backend-design §2]); knowledge: none matched (checked INDEX).

## Done when
- Contract tests pass with FakeTransport for each purpose; parser gives identical results for all 4 modes and random chunk splits.
- One real-binary smoke script (`tools/engine-smoke.js`, native pbrain-rapfi) proves protocol code; not shipped.

## Built — verified against native binary (tools/engine-smoke.js) — corrections to design
- `YXNBEST n` is itself the **search command**; `YXPLAYSELF d` / `YXOPPDIST d` are alternative search commands (single PV), not config. Sending them as config triggers a search + `ERROR Unknown command: 0` desync. `RuleMapper.searchCommand` picks one (opponent/hint only).
- `YXBLOCK` cannot confine the **first move to firstMoveZones** (all root candidates blocked ⇒ engine falls back to all candidates). First move on a wall board is picked server-side (`source:'zone'`). YXBLOCK retry works for later moves.
- PV blocks are `INFO PV <0-based>` … `INFO PV DONE`; result = last COMPLETE iteration (last one may hold only PV 0).
- Added `EngineTransport.reset()` (called after error/timeout; leftover lines leak into the next job otherwise) — F405 transport must implement it.
- Fixtures: `server/tests/fixtures/engine/*.txt` are real output (ucilike mode); brief/normal modes are synthetic from the §10 table — re-capture when F406 WASM (`message_mode brief`) exists.
- Unchecked: Troll style fixture, `+M*`, torus board, `I`-label on boards > 15.
