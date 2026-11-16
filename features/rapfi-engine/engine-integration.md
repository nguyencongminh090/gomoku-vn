# Rapfi engine — integration reference (backend)
Verified 2026-11-16 against `Rapfi_V3_PTR/dev/rapfi` (`R/`), `Rapfi/docs/protocol*.md`, and live runs of the binaries.
Links: [user_story](user_story.md) · [planning](planning.md) · [state](diagram/state.md) · [sequence](diagram/uml_diagram/sequence-engine-job.md)

## 1. What the engine is
Rapfi = C++ Gomoku engine (alpha-beta + optional MCTS, classical or NNUE eval). Our fork (MINT-P) adds WALL cells, portal pairs,
torus, rect boards, Free Caro, playing styles (Normal/Aggressive/Defensive/Troll), `YXPLAYSELF`/`YXOPPDIST`. It is a **separate process
speaking a text protocol on stdin/stdout** (Piskvork/Gomocup + Yixin + Rapfi extensions). Licence GPLv3 (see §9).

## 2. Binaries — what exists and what is stale (measured)
| Artifact | Date | RULE 8 (caro) | RECTSTART | Verdict |
|---|---|---|---|---|
| `R/gomoku-portal-ui-distribute/pbrain-rapfi` | 2026-10-30 | OK | OK | **Current native binary** (loads `config.toml` beside it, 8 threads default) |
| `R/build-release/pbrain-rapfi`, `R/build/pbrain-rapfi` | 2026-10-08 | `ERROR Unknown rule id: 8` | — | stale |
| `R/Rapfi/build/wasm-{multi,single}-simd128/*.wasm` | 2026-10-08 | no | no | **stale, rebuild needed** |
| `GomokuBoardSite/engine` (deployed WASM, gate-served) | ~2026-10-08 | no | no | stale: no Caro, no rect, no `STYLE_TROLL_FLOOR` check |
The deployed site WASM therefore cannot play gomoku-vn's `caro` rule. Any WASM path needs a rebuild (§7). Build trees `build*/` are untracked; no git in `R/` (not a checkout), so record the source tarball hash with each build.

## 3. Protocol subset the backend needs (full: `R/Rapfi/docs/protocol.md`, `protocol-wall.md`, `protocol-style.md`)
- Coordinates: 0-based `x,y`, column then row. gomoku-vn `board[y][x]` ↔ `x,y` directly (no flip; `ioCoordMode` = none).
- `START n` (square) / `RECTSTART w,h` (rect, classical eval only, no torus/portal). Both clear walls/portals/torus. `n` ≤ **22** (`MAX_BOARD_SIZE`); gomoku-vn `VALID_BOARD_SIZES = [15,17,19,20]` fits.
- Position: `YXBOARD … DONE` (no search) or `BOARD … DONE` (search → move). Lines `x,y,c`: **1 = side of the first stone, 2 = other, 3 = WALL**. Walls first, then stones **in move order**; the engine inserts a pass when the declared side ≠ side to move. A block wipes the position **including walls**.
- Portals: `INFO CLEARPORTALS` (also clears walls) → `INFO YXPORTAL x,y x,y` per pair → then the `YXBOARD` block (re-sets walls). Torus: `INFO TORUS 1` (not with Renju).
- Search: `YXNBEST n` (top-n lines, still plays/returns best; style ⇒ max(n,4) lines), `TURN x,y`, `BEGIN`, `YXPLAYSELF d`, `YXOPPDIST d`, `YXBLOCK … DONE` (exclude our own root candidates), `STOP`.
- Reply: bare `x,y` = the move. With `INFO SHOW_DETAIL 2` also `INFO PV…EVAL/WINRATE/BESTLINE/DEPTH…INFO PV DONE` per PV (needed for analysis, eval bar, move quality). Mate values `+M<n>`/`-M<n>`.
- **Engine only accepts `STOP`/`END` while thinking; every other command is silently dropped.** ⇒ one serialized queue per process; a job's end = the move line (a stopped search still emits one move line in the site's experience — confirm in test).
- `INFO` parameters are session-persistent; **`START`/`RESTART` do not reset `STYLE*`**. Send the full config on every job.

## 4. Rule mapping gomoku-vn → engine (the doc's main risk table)
| gomoku-vn | Engine | Note / gap |
|---|---|---|
| `winningRule=freestyle` | `INFO RULE 0` | 5+ wins both. OK |
| `standard` | `INFO RULE 1` | exactly 5 wins. OK |
| `caro` ("Luật 2 đầu") | `INFO RULE 8` | Exact five blocked both ends: not a win in both (agreed). **Residual gap (overline only):** server `_checkWin` blocks any length ≥5; engine: **6+ always wins**. Decide: change server (breaking) or accept engine mis-evaluating overline-blocked lines (rare) — see planning Q5. Caro is classical-eval, alpha-beta only, **no swap2** (`SWAP2BOARD` → ERROR). Edge/wall/portal count as open in both: consistent. |
| Renju | `RULE 2/4` | not offered by gomoku-vn |
| walls (`-1`) | `YXBOARD` colour 3 | classical eval used, NNUE never sees walls |
| portals (`-2`) | `INFO YXPORTAL` | pair cells unplayable, ≥3 apart (server already enforces) |
| torus | `INFO TORUS 1` | not in gomoku-vn today (verify) |
| rect boards | `RECTSTART` | not in gomoku-vn today (VALID_BOARD_SIZES square) |
| swap2 opening | `INFO RULE 6` + `SWAP2BOARD` | **freestyle only.** Server swap2 is a different state machine (`GameEngine.swap2Choice`, `placeOpeningStone`); the engine is asked via `SWAP2BOARD` for proposals/decisions. Combinations swap2 × standard/caro/walls are **unsupported** → bot must refuse or the server must map manually (planning Q6). |
| `firstMoveZones` (walls: 1st move adjacent to a wall) | none | engine unaware. For a bot's 1st move send `YXBLOCK` of every cell outside the zone, then `YXBLOCKRESET`. |
| WALL rule: P1's 2nd move Chebyshev ≥ 4 from 1st (`makeMove` ~l.208) | `YXPLAYSELF 4` / `YXOPPDIST 4` | the site uses exactly this (`FORCED_DISTANCE = 4`): depth 2 → `YXPLAYSELF`, depth 1 → `YXOPPDIST`. Always **re-validate the engine move through `GameEngine.makeMove`**; on rejection retry with `YXBLOCK` of the rejected cell. |
Server remains the single source of truth: an engine move is a *proposal* submitted via the same path as a human move.

## 5. Features usable for product
- **Strength**: `STRENGTH 0..100`, `MAX_DEPTH`, `MAX_NODE` (deterministic, best for CPU budgeting), `TIMEOUT_TURN`/`TIMEOUT_MATCH`, `CAUTION_FACTOR 0..5` (candidate range; rebuilds board+clears TT). `STRENGTH<100` disables style.
- **Styles** `INFO STYLE 0..3` (+`STYLE_MARGIN` 0–6000 def 60, `STYLE_CONTEMPT` 0–6000 def 30, Troll: `STYLE_TROLL_TARGET` 0–1000 def 500, `STYLE_TROLL_FLOOR` −6000..1000 def 150). **Only act on boards with a wall, portal pair or torus**, alpha-beta, `STRENGTH 100`, no balance mode; on plain boards the engine silently plays Normal (UI must say so). Changing style/contempt clears TT. Played move may not be PV line 1. Cost: style costs ~4 pts of strength (4 PV lines in budget). Send `STYLE 0` for analysis jobs.
- **Analysis** (`YXNBEST n` + `SHOW_DETAIL 2`): eval, win rate, depth, best line per candidate → eval bar, hints, move-quality labels in replay (`features/learn` placeholder), puzzle verification (`PuzzleVerifier`).
- **Opening book/database**: `USEDATABASE` + `YXQUERYDATABASE*` exist; **no database file shipped for our rules** → ignore for v1.
- **Evaluator**: `config.toml` `[model] binary_file = Model20260727-V0-FreshValue.bin` — classical-only model bundled in WASM. Native Networks/ also holds only this model; NNUE weights are not bundled for plain boards in our distribution (verify before promising "NNUE strength").
- **Pondering** `INFO PONDERING 1`: off for server (wasted CPU).

## 6. Deployment options (DECIDED 2026-11-16: C, client WASM server-driven; A is future via the same Transport interface — see [backend-design](backend-design.md))
| | A. Native process pool (server `child_process`) | B. WASM in Node `worker_threads` | C. Client-side WASM (as GomokuBoardSite) |
|---|---|---|---|
| Server authority (rated/bot games) | yes | yes | **no** (client can lie) → analysis/hints only |
| Speed | best (AVX2/AVX512, NNUE-ready, 8+ threads) | ~2–3× slower, SIMD128 | same as B on user's device |
| Ops | ship binary + config per OS/CPU; sandbox, `nice`/cgroup limit | one portable artifact | none server-side |
| CPU/RAM per game | `THREAD_NUM × hash` per process; cap pool (e.g. N cores) | same, worker memory; multi build needs `SharedArrayBuffer` | user's device |
| STOP | works (native multi) | multi build: workers; **single build can't receive STOP while thinking** → use `MAX_NODE`/`TIMEOUT_TURN` or terminate worker | page terminates worker |
| Build flags | none | `-s ENVIRONMENT` unset ⇒ default includes `node` ✓; `MODULARIZE=1 EXPORT_NAME=Rapfi` ✓; `PROXY_TO_PTHREAD` + `-pthread` need Node ≥ 16 `worker_threads`; `--preload-file` data works via Emscripten FS in Node (verify) | existing recipe |
| GPLv3 | separate process over a text protocol: fine; **offer source** if binary shipped | same | **serving WASM to browsers = distribution** (site gates files by key — owner decision) |
Pre-mortems: A — pool exhaustion under N concurrent bot games ⇒ queue + per-game node budget, health-check/restart on crash, kill on game end; B — Node/Emscripten pthread quirks, 2–3× slowdown erodes strength-per-CPU; C — cheating, no rating, cannot support bot-with-rating.
Recommendation (not a decision): **A for bot opponents/rated analysis, C unchanged for client hints**, so the server needs no WASM. B only if native binaries cannot be deployed.

## 7. WASM rebuild recipe (do NOT run with defaults)
`GomokuBoardSite/engine/build.sh <rapfi repo> [model dir]` — needs `~/emsdk` (present, `emcc` at `~/emsdk/upstream/emscripten/emcc`), CMake, Ninja. Per variant: `emcmake cmake -S Rapfi -B Rapfi/build/wasm-<v>-simd128 -G Ninja -DCMAKE_BUILD_TYPE=Release -DNO_COMMAND_MODULES=ON -DUSE_WASM_SIMD=ON [-DNO_MULTI_THREADING=ON]`, target `rapfi`; outputs `rapfi-{multi,single}-simd128.{js,wasm,data}`.
**Traps:** the script (1) **overwrites `../GomokuEngineFiles`** (only copy of the deployed engine besides the Worker) unless `GOMOKU_ENGINE_DIR` is set; (2) **rewrites `R/Networks/config.toml` and `wasm_preloads.txt`**; (3) uses `--clean-first`. Always `GOMOKU_ENGINE_DIR=<scratch>`, back up `Networks/`. Output name is fixed by CMake; preamble (`Rapfi/emscripten/preamble.js`) defines `Module.sendCommand` (one call = run until the command is consumed; single build blocks during search), `onReceiveStdout`, `terminate`.
Must-test after rebuild: `RULE 8`, `RECTSTART`, `STYLE_TROLL_FLOOR`, bench hash (`Nodes 16202773 / Hash d5f0a710` at 4a0e8bc — moves legitimately after CARO/RECT; record the new baseline).

## 8. Per-job sequence (what the backend wrapper does)
1. `INFO` config block: `RULE`, `THREAD_NUM`, `HASH_SIZE` (KB, **not** `MAX_MEMORY`), `MAX_DEPTH`/`MAX_NODE`, `STRENGTH`, `TIMEOUT_MATCH 0`, `TIMEOUT_TURN`, `SHOW_DETAIL 2`, `STYLE` (+ margin/contempt/target/floor).
2. Board shape: `START n` or `RECTSTART`, then `INFO TORUS`, portals (`CLEARPORTALS` first), then `YXBOARD` block.
3. Optional constraint: `YXBLOCK` / `YXPLAYSELF` / `YXOPPDIST`.
4. Search command; read lines until the move line; parse PV block(s).
5. Validate via `GameEngine.makeMove` (turn, cell, zone, distance); on failure retry once with the cell blocked, then fall back to a legal random/centre move + log.
6. Timeout/crash: kill process, respawn, resubmit once.
The job key = full command text (site's `jobKey`) to discard stale results after takeback/undo.

## 9. Licence and security
GPLv3: running the binary as a separate process and talking over a text protocol keeps the rest of gomoku-vn under its own licence; shipping/serving binaries requires offering the corresponding source (MINT-P fork). Spawn with fixed argv (no user data in argv), `cwd` = engine dir, no shell, resource limits (ulimit/cgroup), stderr to log. Never pass user strings into protocol lines: only integers built from validated state.
