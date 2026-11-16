# Engine backend — architecture (multi-purpose, client-hosted engine)
Decisions 2026-11-16 (user): engine runs on the **client** (WASM). When a user starts a game vs AI the server grants access to the engine files, **drives** the engine remotely, and **revokes** access when the game ends. The service must serve any purpose (opponent, analysis, puzzle check, hints, …). Swap2 is out of scope. Bot games always use a WALL/portal board (styles work). Caro rule: engine and server agree on blocked-both-ends exact five.
Links: [integration reference](engine-integration.md) · [planning](planning.md) · [state](diagram/state.md) · [sequence](diagram/uml_diagram/sequence-engine-job.md)

## 1. Shape
```
Server (Node)                                   Client (browser)
┌───────────────────────────────┐   socket.io   ┌──────────────────────────────┐
│ EngineService (Facade)        │◄─────────────►│ EngineHost (Adapter)         │
│  ├ LeaseManager (grant/revoke)│  job / result │  ├ worker (rapfi-*.js/.wasm) │
│  ├ JobFactory → Job (Command) │               │  └ relays protocol lines     │
│  ├ Purpose strategies         │   HTTPS       │ fetches engine files with    │
│  │   Opponent|Analysis|Verify │◄──────────────│ lease token                  │
│  ├ RuleMapper (Strategy)      │  engine files └──────────────────────────────┘
│  └ EngineTransport (interface)│
│      ├ ClientWasmTransport  ← now
│      └ NativeProcessTransport ← future (same Job/Protocol code)
└───────────────────────────────┘
```
The **protocol logic lives on the server** (builds command text, parses result, validates move). The client is a dumb pipe: `{leaseId, jobId, lines[]}` in, `{jobId, outputLines[]}` out. Benefits: engine upgrades/config need no client release; one codebase serves every purpose; native transport later is a drop-in.

## 2. Patterns (why each)
| Pattern | Where | Reason |
|---|---|---|
| **Facade** | `EngineService.submit(purpose, input)` | one entry point for GameHandler, replay, PuzzleVerifier |
| **Strategy** | `Purpose` (Opponent / Analysis / Verify / Hint) | each purpose = its own config (strength, style, multiPV, budget) + result mapper |
| **Command** | `Job` = ordered protocol lines + `parse(lines)` + `key` | queue, cancel, stale-discard, replay in tests |
| **Adapter** | `EngineTransport` (`ClientWasmTransport`, later `NativeProcessTransport`, `FakeTransport` for tests) | hide where the engine runs |
| **Factory** | `JobFactory.create(purpose, gameState)` → uses `RuleMapper` | one place maps gomoku-vn rules → engine commands |
| **Lease / Resource pool** | `LeaseManager` | grant, heartbeat, TTL, revoke; max leases per user/IP |
| **State machine** | per-lease session (see [state](diagram/state.md)) | idle/thinking/stopping/dead transitions explicit |
| **Observer** | `EngineService` emits `result`, `progress` (PV lines), `lease:end` | UI eval bar streaming, logging, metrics |
| **Chain of responsibility** | result validation: parse → rule validation (`makeMove` dry-run) → distance/zone constraint → accept/retry | clear failure handling |

Interfaces (JS, documentation-level):
```
EngineTransport { open(lease), send(jobLines), onLine(cb), stop(), close() }
Purpose         { config(ctx) -> INFO map, search(ctx) -> command, parse(lines) -> result }
Job             { id, key, lines[], purpose, deadlineMs }
```

## 3. Lease lifecycle ("open the door, then revoke")
1. Client: `engine:request {purpose, gameId}` (needs a seat in that game, or analysis permission).
2. Server `LeaseManager.grant`: checks limits, creates `lease {id, userId, gameId, purpose, exp}`, signs a **short-TTL token** (HMAC like the site's gate: `<exp>.<mac>`), returns `{leaseId, token, files base URL, variant: multi|single}`.
3. Client downloads files from `GET /engine/<file>?t=<token>`: either our Express (`express.static` behind a token check) or a Cloudflare Worker gate (the site's `gate/` is reusable: HMAC token, ALLOWED_ORIGINS, COEP `Cross-Origin-Resource-Policy: cross-origin`). Files are large (`.wasm` + `.data` ≈ MBs) → long cache by content hash; the token only gates *download*, so revoke = stop issuing tokens + end the lease.
4. Client starts the worker, sends `engine:ready`. Server marks lease READY and sends jobs.
5. End: game over / leave / disconnect-grace expiry / TTL → `LeaseManager.revoke`: send `engine:end` (client terminates worker, frees memory), invalidate leaseId, refuse further tokens. **Token already issued stays valid until its expiry** (same limitation as the site: HMAC not revocable) → keep TTL short (minutes) and have the client refetch per lease; for hard revoke keep a server-side denylist checked by the file route.
Honest limit: files already downloaded cannot be "taken back"; revocation means the *server stops driving it and stops serving*. It is control, not DRM.

## 4. Socket protocol (new namespace/events; do not touch room clock events)
| Event | Dir | Payload |
|---|---|---|
| `engine:request` | C→S | `{purpose, gameId}` → ack `{leaseId, token, base, variant}` or `{code}` |
| `engine:ready` | C→S | `{leaseId, version}` (engine `ABOUT`/capabilities) |
| `engine:job` | S→C | `{leaseId, jobId, lines: string[], stopAfterMs}` |
| `engine:line` | C→S | `{jobId, text}` batched (≤ 50 ms) — progress/PV |
| `engine:done` | C→S | `{jobId, moveLine}` |
| `engine:stop` | S→C | `{jobId}` (client sends `YXSTOP`, or terminates worker for single build) |
| `engine:end` | S→C | `{leaseId, reason}` |
| `engine:error` | C→S | `{jobId?, text}` load failure, crash |
Rules: error codes (not Vietnamese strings) per `i18n-and-server-message-codes`; per-event rate limit; reject events from a socket that doesn't own the lease; max line count/size per job and per result (client is untrusted); exactly **one job in flight per lease** (engine drops commands while thinking).

## 5. Trust model (client-hosted engine)
- The client can send *any* move line. **Server validates every engine move** via `GameEngine.makeMove` for `botUserId`; an illegal move ⇒ retry once with `YXBLOCK`, then server fallback (random legal / centre) so the game never stalls.
- Strength cannot be enforced (user could replace the engine with a stronger one or a human). Therefore: bot games are **unrated**, excluded from integrity graph/achievements that imply fair play (planning Q4), and analysis results are labelled "client-computed".
- Time: the server owns the clock; bot's deadline = `min(purposeBudget, remaining clock)`; on client silence beyond deadline+grace, server plays the fallback move and ends the lease if repeated.
- Disconnect: lease dies with the socket after grace; the bot game follows the existing reconnect rules.
- Protocol injection: job lines are built only from validated integers (`x,y`, enums); no user text in lines.

## 6. Purposes (all through the same pipeline)
| Purpose | Config | Result |
|---|---|---|
| `opponent` | `STRENGTH`, `MAX_NODE`/`TIMEOUT_TURN` by difficulty, `STYLE` + margin (WALL/portal board ⇒ acts), `YXNBEST 1`, `YXPLAYSELF/OPPDIST 4` for opening moves, `PONDERING 0` | `{x,y}` → `makeMove` |
| `analysis` | `STYLE 0`, `STRENGTH 100`, `SHOW_DETAIL 2`, `YXNBEST n`, node/depth budget | per-PV `{eval, winrate, depth, bestline[]}`; move quality = eval drop vs played move |
| `verify` (puzzles) | `MAX_DEPTH`/`MAX_NODE` high, `YXNBEST 1`, `+M<n>` parse | `{forcedWin, mateIn, bestMove}` |
| `hint` | analysis with `n=1`, rate-limited, forbidden in rated human games | best move |
Adding a purpose = one `Purpose` class + registry entry; no change in transport, lease, or socket code.

## 7. Observed output (real run, current native binary, `RULE 8`, wall board, `STYLE 1`, `YXNBEST 2`, `SHOW_DETAIL 2`)
Per PV block: `INFO PV i / NUMPV / DEPTH / SELDEPTH / NODES / TOTALNODES / TOTALTIME / SPEED / EVAL / WINRATE / BESTLINE x,y x,y… / PV DONE` then the human `MESSAGE` line (`config.toml` `message_mode`; WASM uses `brief`). **Style on ⇒ `NUMPV 4` even when asking 2** (engine searches ≥ 4 lines); the played move is a separate final bare `x,y` line. Parser must take the **last bare-coordinate line** as the move and treat PV blocks as progress/analysis only.

## 8. Failure modes (pre-mortem)
| Risk | Mitigation |
|---|---|
| Client has no SIMD/SharedArrayBuffer (COOP/COEP, old browser) | capability probe → single build; else refuse bot with a code and offer fallback |
| WASM download slow / mobile data | content-hash cache, show progress, `engine:ready` timeout → cancel lease |
| Tab hidden/throttled → slow search | budget by `MAX_NODE` not wall time; server deadline + fallback move |
| Single build can't STOP | per-job node/time budgets; terminate worker on stop |
| Many tabs/leases per user | one active lease per user+purpose; global cap |
| Engine bug/crash | `engine:error` → respawn once → fallback move |
| Stale result after undo/takeback | job `key` = hash of lines; server drops results whose key ≠ current |
| COEP breaks other pages (`Cross-Origin-Embedder-Policy`) | multi-thread build needs cross-origin isolation site-wide → **big blast radius on gomoku-vn** (avatars/CDN/ads); start with the **single-threaded build** and check CSP/headers first (`static-assets-caching-csp-build`) |

## 9. How to implement (recipe, no code yet)
1. Rebuild WASM (single first) with Caro+rect: `GOMOKU_ENGINE_DIR=<scratch> engine/build.sh <rapfi>` (back up `Networks/` first; see integration §7). Store under `server/engine-files/<contentHash>/`.
2. Server modules: `server/engine/{EngineService,LeaseManager,JobFactory,RuleMapper,transports/ClientWasmTransport,purposes/*}.js`, socket handler `server/socket/handlers/EngineHandler.js`, file route `server/routes/engine-files.js` (token check, `Cache-Control: immutable`).
3. Client: `client/js/engine/engine-host.js` (worker + relay; reuse `GomokuBoardSite/engine/engine.worker.js`), no protocol logic.
4. Tests (kept): fake transport contract tests for each purpose, RuleMapper table tests, lease TTL/revoke, illegal-move fallback, stale-job drop, jsdom host test; real-browser pass for the WASM load.
5. Optional dev script (separate, not shipped): `tools/engine-smoke.js` spawns the **native** binary through the same `Job`/`Purpose` classes to prove protocol code without a browser.

## 10. Output parser (EngineOutputParser) — accepts every message mode, extensible
Decision 2026-11-16: the parser must take **any** `message_mode` and any retrieval info, and be easy to extend. Measured on the 2026-10-30 binary (`RELOADCONFIG` per mode, `SHOW_DETAIL 1`, `MAX_NODE 3000`; `INFO` input via `INFO SHOW_DETAIL 2` adds the structured `INFO …` block from §7):

| Source line | Appears when | Shape | Parsed to |
|---|---|---|---|
| bare `x,y` / `x,y x,y` / `SWAP` | always, last line of a job | `8,6` | `move` (authoritative; protocol coords 0-based) |
| `OK`, `ERROR <text>` | any | | `ack`, `error{text}` |
| `MESSAGE Speed 1005K \| Depth 10-15 \| Eval 81 \| Node 3015 \| Time 3ms` + `MESSAGE Bestline I7 G9 …` | `brief`, `normal` | final summary | `summary{nps,depth,seldepth,eval,nodes,timeMs}`, `bestline[cells]` |
| `MESSAGE Depth 5-5 \| Eval 68 \| Time 0ms \| I7 G9 J8 K9` | `normal` | per depth | `progress{depth,seldepth,eval,timeMs,pv[]}` |
| `MESSAGE depth 5-5 ev 68 n 173 n/ms 173 tm 0 pv I7 …` (+ `multipv k`) | `ucilike` | per depth | same `progress` (+`multipv`) |
| `MESSAGE REALTIME REFRESH/BEST x,y/POS/DONE/LOST` | `SHOW_DETAIL` 1\|3 (even with `none`) | **prefixed `MESSAGE `** in MESSAGE modes, bare `REALTIME …` otherwise | `realtime{kind,x,y}` |
| `INFO PV i … INFO PV DONE` (`NUMPV DEPTH SELDEPTH NODES TOTALNODES TOTALTIME SPEED EVAL WINRATE DRAWRATE PRIOR STDEV LCBVALUE BESTLINE`) | `SHOW_DETAIL` 2\|3 | multi-line block | `pv{index,…,eval,winrate,bestline[{x,y}]}` — **preferred source for analysis** |
| `MESSAGE Rapfi <ver> (…)`, `MESSAGE INFO MAX_THREAD_NUM n`, `MESSAGE INFO MAX_HASH_SIZE n` | after `YXSHOWINFO` | | `capabilities` |
| `MESSAGE Transposition table …`, `FORBID …`, `DATABASE …`, `DEBUG …`, `MESSAGE Unknown Info Parameter` | on demand | | `misc{tag,raw}` |
| anything unmatched | | | `unknown{raw}` (kept, never throws) |

Facts to code against:
- Cell labels in MESSAGE text are **column letter + row number** (`I7` = protocol `8,6`: x→letter A…, y→number y+1; letters skip nothing observed up to 15 — verify `I` handling on ≥ 20 boards). Prefer `INFO BESTLINE x,y` or the bare move line; use labels only as fallback.
- Values: integer cp, or `+M<n>`/`-M<n>`/`+M*` (see site `parseValue`).
- The engine is line-oriented ⇒ the parser is a **stateful line reducer**: `feed(line) → events[]`, accumulating the open `INFO PV` block until `INFO PV DONE`. A job ends at the first bare move line / `SWAP`.
- **Piped-ahead commands are lost**: in a test, `INFO SHOW_DETAIL 0` sent right after `YXNBEST` was dropped while thinking and its argument `0` came back as `ERROR Unknown command: 0`. The queue must wait for the move line (already the one-in-flight rule) and treat such `ERROR` as a protocol-desync signal ⇒ restart the engine.
- Mode-independence: the job's *result* must never depend on `MESSAGE` text. Move = bare line; analysis = `INFO PV` blocks (force `SHOW_DETAIL 2` in the config block); MESSAGE modes only feed optional progress UI/logs. A different `message_mode` in `config.toml` then changes only the extras.

Extensibility (Chain of responsibility + registry):
```
LineMatcher { id, test(line, ctx) -> bool, parse(line, ctx) -> event | null }
EngineOutputParser { register(matcher, {priority}), feed(line) -> events[], reset() }
```
Built-ins registered in order: move → error/ack → pv-block (stateful) → realtime → progress-normal → progress-ucilike → summary-brief → capabilities → misc → unknown-fallback. Adding a new message or retrieval (e.g. database `DATABASE …`, `FORBID …`, a new `INFO STYLE_*` echo) = one matcher + a fixture-line test; no change to Purposes. `Purpose.parse(events)` consumes only the event kinds it cares about.
Tests: **golden fixtures** captured per mode (the four runs above, plus a wall/portal/torus board, a mate score, an `ERROR`), fed line-by-line and chunk-split at random boundaries (the client batches lines), asserting identical `result` across all modes.

## 11. Evaluation + PV extraction (normalized result model)
Needed by `analysis`, `verify`, `hint`, eval bar, move-quality labels and replay. Measured 2026-11-16 on the 2026-10-30 binary (freestyle, `SHOW_DETAIL 2`, 20k nodes):

| Position (Black stones 7,7 8,7 9,7; White 7,9 8,9 [+3,3]) | `INFO EVAL` | `WINRATE` | `BESTLINE` |
|---|---|---|---|
| Black to move, open three | `+M3` | `1` | `6,7 6,7` |
| White to move, same three | `-45` | `0.415` | `6,7 9,9 9,8 7,8 10,7 …` |
| White to move, Black already has an open four | `-M2` | `0` | `11,7 11,7` |

Findings that the extractor must encode:
1. **Eval and winrate are from the side to move**, not Black. Normalize to Black's view: `evalBlack = stm === BLACK ? eval : -eval`; `winBlack = stm === BLACK ? wr : 1 - wr`. Side to move = parity of stone count in the sent block (plus inserted passes — the engine auto-inserts a pass when declared sides disagree; send the block from real move order so parity is reliable).
2. **Mate values**: `+M<n>` = side to move wins in `n` plies, `-M<n>` = loses; `+M*` = from database. `mateIn` plies → moves = ceil(n/2). Map to a display cap (e.g. ±10000) for the eval bar; never plot raw.
3. **Win rate vs cp** — `winrate = 1 / (1 + exp(-cp / S))`, **S = ScalingFactor = 131.3979 for our model**, not 200 (see below). Use winrate for the bar, cp for move-quality deltas.
4. **BESTLINE in mate results repeats the first move** (`6,7 6,7`, `11,7 11,7`). Quirk of the engine's PV for terminal wins ⇒ normalizer drops a consecutive duplicate cell. Regression fixture required.
5. **PV length varies** (1 cell for mates, 9+ otherwise); with a style on the PV list is **≥ 4 lines** and the played move may not be PV 0 (§7): result keeps `played` separate from `pvs[]`. Multi-PV lines are sorted by value (Troll: Troll value, `EVAL` printed on the Troll scale ⇒ **do not compare Troll evals to Normal evals**; analysis always runs `STYLE 0`).
6. PV cells are 0-based `x,y` in `INFO BESTLINE`; MESSAGE labels (`I7`) are fallback only (§10). Walls/portals/torus: a PV cell is still a board cell; the client must animate portal jumps itself.
7. Depth: keep `depth` and `seldepth`; the **last completed block per PV index** is final (earlier ones are iterative-deepening history — keep optionally as `history[]` for a "thinking" graph).

Result schema (what `Purpose.parse` returns for analysis):
```
AnalysisResult {
  stm: 'BLACK'|'WHITE',            // side to move, derived by the server, not parsed
  played: {x,y}|null,              // bare move line (opponent job)
  pvs: [{ rank, depth, seldepth, nodes,
          eval: { raw:'-45'|'+M3', cp:-45|null, mateIn:3|null, side:'stm' },
          evalBlack: { cp, mateIn, winrate },
          winrate, drawrate?, line: [{x,y}], history?: [...] }],
  best: pvs[0],
  stats: { totalNodes, timeMs, nps }
}
```
Derived metrics (server-side, pure functions, unit-tested):
- **Move quality** of a played move m: run analysis on the position before m with `YXNBEST ≥ 3` (or a second job *after* m); `loss = evalBlack(best) − evalBlack(afterM)` in mover's sign; thresholds → best / good / inaccuracy / mistake / blunder; if m is in `pvs[]` use its line directly (no second job). Mate-to-no-mate = blunder regardless of cp.
- **Eval bar** per move for replay: one job per position (`YXNBEST 1`, fixed `MAX_NODE`), cache by job `key` (the position hash of lines + config) so repeated replay views are free.
- **Forced-win verify**: `eval.mateIn != null && stm wins` and `line[0]` = solution; compare to `PuzzleVerifier` expectation.
- Hint: `pvs[0].line[0]`; "explain" = show `line`.
Caching/storage: analysis results keyed by `(rule, board, walls, portals, torus, stones order, config hash)`; store in DB only when finished and size-capped (planning: schema out of scope here).
Tests: fixtures above (+ torus/portal board, `+M*`, multi-PV with style on, Troll) → `AnalysisResult`; property: `evalBlack` flips sign when only side to move changes; mate-line dedupe; same result for all four `message_mode`s.

### 11.1 Scale factor (verified)
- Engine code: `Evaluation::valueToWinRate` (`eval/scoretables.h`) = `1/(1+expf(-eval/ScalingFactor))`; `eval >= VALUE_MATE_IN_MAX_PLY` → 1, `<= VALUE_MATED_IN_MAX_PLY` → 0 (that is why mates print winrate 1/0).
- The **compiled default is 200** (`config.cpp:88`) but it is **overwritten when a model loads**: `Config::loadModel` reads a `double` as the first 8 bytes of the (LZ4-compressed) `.bin` (`config.cpp:891-897`); `config.toml` `scaling_factor` can override it too (`config.cpp:565`).
- Our model `Model20260727-V0-FreshValue.bin` stores **131.3978729…**. Cross-check on live engine output: (eval, winrate) = (126, 0.7229), (16, 0.5304), (133, 0.7334), (-45, 0.4152) all give S = 131.4–131.7 (rounding of the printed winrate). With S = 200, -45 would be 0.444, which does not match.
- So the user's "200" is the engine's built-in default; the site comment "sigmoid(value/200)" (`GomokuBoardSite/js/engine.js`, STYLE_LIMITS) is approximate for this model. A different model file ⇒ a different S.
- Backend rule: **prefer `INFO WINRATE` from the engine; compute from cp only when needed** (e.g. eval of a played move not in PV, or cached cp), with `S` taken from a config constant `ENGINE_SCALING_FACTOR = 131.3979` tied to the model file name/hash (re-extract on model change; add a test that recomputes winrate from a fixture eval within 1e-3). Do not use S = 200.
- Inverse (winrate → cp): `cp = S * ln(w / (1 - w))`, clamp to the engine's eval range.
- Draw-aware path: with NNUE/MCTS evaluators, `WINRATE`/`DRAWRATE` come from the net, not from this sigmoid; ours is classical (alpha-beta), so the sigmoid holds. `EVALUATOR_DRAW_BLACK_WINRATE` only affects draw values.
