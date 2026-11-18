# Rapfi engine backend — planning
[user_story](user_story.md) · [integration reference](engine-integration.md) · [state](diagram/state.md) · [sequence](diagram/uml_diagram/sequence-engine-job.md)
Status: design. TODO items #404–#407 written 2026-11-16 (docs/todo/F404–F407). Not authorized to implement until picked up.

## Done in this pass (step 1)
- Read the engine protocol, styles, wall/portal/torus/caro/rect docs, WASM CMake block and the GomokuBoardSite worker/client. Result: [engine-integration.md](engine-integration.md).
- Findings that change the plan: (1) only `gomoku-portal-ui-distribute/pbrain-rapfi` (2026-10-30) is current; `build*/` binaries and the **WASM (10-08) are stale** (no Caro/rect); (2) caro overline semantics differ server vs engine; (3) styles act only on wall/portal/torus boards; (4) swap2 only with freestyle; (5) `build.sh` has destructive defaults.
- No bot scaffolding exists in `server/` (only `diag-session`, unrelated).

## Decisions 2026-11-16 (user)
- Future work; backend must be **multi-purpose** (opponent/analysis/verify/hint), design patterns welcome → [backend-design.md](backend-design.md).
- Engine runs **on the client** (WASM); server leases files, drives jobs over socket, revokes at game end.
- Caro: exact-five blocked on both ends is not a win in both engine and server (agreed). Overline (6+) still differs: engine 6+ always wins, server also blocks it — rare, accepted for now; confirm when implementing.
- Bot games always on WALL/portal boards → styles act. Swap2 out of scope. Scope now: research + know-how only (no build).

## Remaining open questions
1. Rating of bot games (unrated assumed, [backend-design §5](backend-design.md)).
2. Serve engine files from Express or a Cloudflare gate (reuse `GomokuBoardSite/gate`)? Single-thread build first to avoid COOP/COEP blast radius.
3. Difficulty table (STRENGTH/MAX_NODE per level).
4. GPL: offering MINT-P source next to served WASM.
5. Step 2 of the original task was cut off.

## Superseded (kept for history)

1. **Purpose**: bot opponent, analysis/eval bar, puzzle verification, hints — which first? (changes load profile and rating rules)
2. **Where it runs**: A native pool (recommended for bot), B WASM in Node, C client WASM. See integration §6.
3. **Build WASM now?** Needed for B/C (rebuild with Caro+rect). Not built in this pass; run with `GOMOKU_ENGINE_DIR=<scratch>`.
4. **Rating**: bot games unrated? separate bot rating? exclude from integrity graph?
5. **Caro overline**: change server to "6+ never blocked" (matches engine, breaks current rule) or accept the rare engine mismatch?
6. **Unsupported combos** (swap2 × standard/caro/walls, rule sets the engine lacks): hide bot for them, or implement our own swap2 decision via engine analysis?
7. **Time**: bot thinking budget vs `TimerManager` clock (fixed node budget per difficulty vs fraction of remaining time)?
8. **Capacity**: expected concurrent bot games; cores/RAM on the host (decides pool size, threads, hash).
9. **GPL**: ship the MINT-P source with a server binary? Gate WASM to browsers as the site does?
10. **Step 2** of the task ("2. ...") was truncated — what comes next?

## Proposed sequencing (after answers)
1. Engine adapter module (spawn, serialized queue, config block, parse PV) + contract tests with a fake engine and one real-binary smoke test.
2. Rule/constraint mapper (§4 table) with tests per rule/zone/distance.
3. Pool + health/timeout/respawn + metrics.
4. Product surface (bot seat / analysis endpoint) via `design-workflow`.
5. e2e + real-browser pass (`playwright-e2e-safety`).
Each step its own item/branch.
- Output parser: any message mode + retrieval info, extensible ([backend-design §10](backend-design.md)).
- Eval/PV extraction + normalized result model: [backend-design §11](backend-design.md).
- Scale factor = 131.3979 (from model file), not 200: [backend-design §11.1](backend-design.md).
