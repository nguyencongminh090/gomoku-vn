# F406 — Rebuild WASM engine (Caro + rect), pick hosting
**Status:** BUILT 2026-11-16 (Node-verified; real-browser pass + hosting decision pending)
**Area:** `Rapfi_V3_PTR/dev/rapfi` build only; output to a scratch dir then `server/engine-files/<hash>/`
**From:** features/rapfi-engine (2026-11-16)   **Depends:** —

## Problem
Site WASM (2026-10-08) lacks `RULE 8` and `RECTSTART`. Native `build*/` also stale; current = `gomoku-portal-ui-distribute/pbrain-rapfi` (10-30).
Recipe: [integration §7](../../features/rapfi-engine/engine-integration.md).

## Scope
1. Back up `Rapfi_V3_PTR/.../Networks/`; run `GOMOKU_ENGINE_DIR=<scratch> engine/build.sh <rapfi>` (single first, multi optional).
2. Test in a browser worker: `RULE 8`, `RECTSTART`, `STYLE_TROLL_FLOOR`, wall/portal board, bench hash; record the new baseline.
3. Record source tarball hash + `ENGINE_SCALING_FACTOR` from the model file.
4. Decide hosting: Express vs Cloudflare gate; GPL source offer.

## Don't
- Never run build.sh with defaults (overwrites `../GomokuEngineFiles` and `Networks/config.toml`).

## Done when
- Files built, smoke-tested in a real browser, hash recorded in the todo; hosting decision noted.

## Result (2026-11-16)
- Output: `server/engine-files/d0373e3738fd/` (id = sha256 of wasm+js+data, 12 chars; untracked, not committed). `Networks/` backed up first, build used scratch `GOMOKU_ENGINE_DIR`.
- Engine `0.43.02`, Rapfi source tree hash (Rapfi/ *.cpp/h/txt/js) `840db974…f751e`; model `Model20260727-V0-FreshValue.bin` sha `43df37ed…4713` (unchanged) → `ENGINE_SCALING_FACTOR = 131.3979` still valid.
- wasm sha256: single `0b4ba6a0…0510`; multi `81ff1536…75a1`.
- Node smoke (single): `INFO RULE 8` accepted (old build: Unknown rule id), `RECTSTART 15,10` + BEGIN → `7,5`, `INFO WALL` x2 + BEGIN → move, `BENCH` (rule 0) Nodes 18712809 / Hash `75ecdf2d` = new baseline (old 16202773 / d5f0a710).
- Note: syntax is `RECTSTART w,h` (comma). `.data` loads relative to cwd in Node.
- NOT done: real-browser worker pass (multi build, portals, `STYLE_TROLL_FLOOR` effect); hosting decision (rec: Express route, token-gated, + GPL source offer page) — owner call.
