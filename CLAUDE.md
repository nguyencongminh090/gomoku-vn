# Project Rules

## Cache-busting version bump

All CSS and JS assets are cache-busted with a shared `?v=N` query string (see `client/*.html` `<link>`/`<script>` tags and the `?v=N` suffixes on ES-module `import` statements inside `client/js/index-entry.js`, `client/js/room-entry.js`, `client/js/login-entry.js`).

**Whenever you modify any file under `client/css/` or `client/js/`, bump `?v=N` to `?v=N+1` everywhere it appears** — across all HTML files (`client/index.html`, `client/room.html`, `client/login.html`, `client/history.html`) and inside the module entry files' `import` statements. All occurrences must use the same new number; do not bump some files but not others, since a mismatched/partial bump reintroduces stale-cache bugs on mobile.

Find the current version with:
```
grep -rn "?v=" client/*.html client/js/*-entry.js
```
