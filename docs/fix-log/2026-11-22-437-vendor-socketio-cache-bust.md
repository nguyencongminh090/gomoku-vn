# 2026-11-22 15:25 — #437 cache-bust /vendor/socket.io bundle
## Prompt
"do #437 + update cache-bust.js"
## Root cause
The 5 pages loaded `/vendor/socket.io/socket.io.min.js` with no `?v=` (cache-bust.js only resolved files under
`client/`, the bundle lives in `node_modules/socket.io/client-dist`), served `public, max-age=86400`. After the
#436 bump Cloudflare kept serving 4.8.3 (HIT, age ~5 h) until a manual purge.
## Fix
- `scripts/cache-bust.js`: `MOUNTS` maps `vendor/socket.io/` → socket.io `client-dist`; `run(root, write, mounts)`
  reads mapped refs from there. A package bump changes the bytes → verify FAILs (also the jest real-tree test)
  until `--write`.
- index/room/tournament/tournament-match/diagnostic.html: `socket.io.min.js?v=<hash>` (written by `--write`).
- `server/config/staticCache.js` `socketIoClientOptions`: `IMMUTABLE` only when `?v=` equals the sha256[0..8] of
  the bytes served (cached per mtime/size); bare URL (old cached HTML) or mismatched `?v=` keep the 1-day policy.
- Early Hints Link header copies the versioned src automatically (derived from index.html).
## Verification
- New tests: cache-bust mount mapping + bump-in-temp-dir changes hash/verify fails; server serves matched `?v=`
  immutable, stale `?v=` 1-day; all 5 pages reference the current hash. 3 existing tests accept `?v=`.
- `npm test` 271 suites / 4657 tests pass; `node scripts/cache-bust.js` OK.
- Not done: real-browser load of index + room; post-deploy public URL check.
