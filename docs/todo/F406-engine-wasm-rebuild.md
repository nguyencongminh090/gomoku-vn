# F406 — Rebuild WASM engine (Caro + rect), pick hosting
**Status:** OPEN
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
