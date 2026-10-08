---
paths:
  - "client/*.html"
  - "client/css/**"
  - "client/js/**"
---

# Cache-busting `?v=N`

All CSS/JS assets share ONE `?v=N`. Any edit under `client/css/` or `client/js/` → bump everywhere:

```
node scripts/cache-bust.js --bump     # N → max+1 across client/*.html + client/js/** (mockups skipped)
node scripts/cache-bust.js            # verify: must print "OK: single ?v=N"
```

Why it covers `client/js/**` and not only `*-entry.js`: ES modules import each other as
`import '...?v=N'`, and the browser treats each distinct query string as a **separate module
instance** — one stale cross-import re-executes a module's top level a second time (shipped a
duplicate-socket / false "logged in on another device" kick twice).

- Frozen, never bump: `client/tournament-detail-mockup.html`, `client/tables-tournaments-mockup.html`
  (the script skips `*mockup*`).
- After a merge/rebase: `node scripts/cache-bust.js --set $(( max(dev,main) + 1 ))` — always compute
  `max+1` fresh, even if the incoming branch's number looks lower (precedent 2026-08-21: kept `133`
  after merging changed bytes → stale cache served new content under an old URL).
- `scripts/cache-bust.js` only rewrites digit-suffixed `?v=`; `?v=${ASSET_VERSION}` templates and
  prose mentions are left alone.
