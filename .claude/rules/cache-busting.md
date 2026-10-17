---
paths:
  - "client/*.html"
  - "client/css/**"
  - "client/js/**"
  - "client/assets/**"
  - "client/vendor/**"
---

# Cache-busting `?v=<hash>` (per-file content hash, #265)

Every `path?v=X` in `client/*.html`, `client/js/**`, `client/css/**` carries X = first 8 hex of sha256 of
the referenced file. Any edit under `client/` → re-run, never hand-edit a hash:

```
node scripts/cache-bust.js --write    # rewrite every ?v= to its target's hash (alias --bump)
node scripts/cache-bust.js            # verify: must print "OK: every ?v= matches…" (also a jest test)
```

- A file is hashed **after** its own refs are rewritten, so changing `i18n.js` also re-versions every
  module that imports it (and so on up). Unchanged files keep their URL → stay cached (`immutable`).
- Why every module needs a `?v=` on every import: the browser treats each distinct query string as a
  **separate module instance** — two URLs for one module re-execute its top level (shipped a
  duplicate-socket / false "logged in on another device" kick twice). The script gives one file one
  hash everywhere; verify fails on any stale ref.
- Resolution: `./x.js` / `../x.js` → relative to the module; everything else (`js/…`, `/js/…`,
  `assets/…` in JS strings) → relative to `client/` (pages are all at the root). Unresolvable → FAIL.
- Import cycles are hashed as one unit (all members share a hash).
- Frozen, never touched: `*mockup*` pages. `?v=${ASSET_VERSION}` templates and prose are left alone.
- After a merge/rebase with `?v=` conflicts: take either side, then `--write` — it recomputes from
  content, so there's no counter to get wrong.
