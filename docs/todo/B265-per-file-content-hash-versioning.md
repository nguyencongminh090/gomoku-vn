# B265 — Per-file content-hash `?v=` instead of one global `?v=N`
**Status:** ✅ DONE 2026-10-17 — [fix-log](../fix-log/2026-10-17-per-file-content-hash.md)
**Area:** `scripts/cache-bust.js`, `client/*.html`, `client/js/**` imports, `.claude/rules/cache-busting.md`, CLAUDE.md rule 4
**From:** user question after #264, 2026-10-17   **Depends:** —

## Problem
Every deploy bumps one shared `?v=N` (now 389) on all assets, so after a 1-file change a returning player re-downloads the
whole page set (lobby ~128 KB br / 25 files, room ~145 KB br / 27) and the CF edge refetches all of it from origin
(MISS ≈ 365–575 ms, #262). Assets are `immutable` for 1 year, so per-file URLs would make unchanged files free.

## Scope
1. `cache-bust.js`: version each referenced asset by a short hash of its content (`?v=<8 hex>`); a file whose imports
   change gets a new hash too (hash after rewriting its own import URLs → bottom-up / Merkle order).
2. Verify mode: every reference to the same file uses the same hash, and the hash matches content (replaces "one value").
3. Update `.claude/rules/cache-busting.md`, CLAUDE.md rule 4, `git-workflow` skill's `max(dev,main)+1` merge recipe.
4. Measure: after a 1-file change, number of URLs that change (expect: that file + its importers only).

## Don't
- Don't introduce a bundler/minifier (user deferred minify 2026-10-17). Don't change `staticCache.js` policy.
- Don't touch frozen `*mockup*` pages.

## Traps
- Module cross-imports: one module must have exactly ONE URL everywhere, or it executes twice (duplicate socket kick).
- Import cycles break bottom-up hashing → detect and hash the cycle as a unit.
- Non-JS assets also carry `?v=` (sprite `phosphor-sprite.svg?v=` in HTML/JS, fonts CSS, CSS `url()`); `room.js`
  injects `/js/profanity-filter.js?v=` (#264); `diag-entry.js` uses `?v=${ASSET_VERSION}` templates.
- Tests asserting `?v=` shape: `modulepreload-hints-match-entry-imports`, `sprite-url-versioned`, `socket-early-connect`,
  `room-profanity-lazy`.
- Merges: hash conflicts are resolved by re-running the script, not by hand-picking a side.

## Why this way
Global `?v=N` discards the cache for unchanged files; content hashes keep the "new bytes ⇒ new URL" guarantee without a
build step. Rejected: bundling (no gain over parallel HTTP/2 HITs; toolchain change).
Knowledge: `static-assets-caching-csp-build` (see docs/knowledge/INDEX.md).

## Done when
- 1-file change rewrites only that file's URL and its importers'; verify mode green; `npm test` green; real-browser
  pass (lobby + room) shows each module requested once.
