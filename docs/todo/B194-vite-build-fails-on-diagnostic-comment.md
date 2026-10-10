# B194 — `vite build` fails: copy-classic-scripts reads a comment in diagnostic.html
**Status:** ✅ FIXED 2026-10-10 — scanner now strips HTML comments (scripts/classic-scripts.js); `vite build` passes, every classic script present in dist/js. `--outDir` still ignored by the plugin (not changed).
**Area:** build (`vite.config.js`), `client/diagnostic.html`
**From:** found 2026-10-09 while checking B193's bundle; fails on `dev` HEAD too (not caused by B193)

## Problem
`findClassicScripts()` regex-scans every `client/*.html`, comments included. `diagnostic.html:146` has the
prose `<script src="js/..."> tags into dist/ automatically. -->` → file `...` → `cpSync` ENOENT in
`closeBundle` → build exits non-zero. Also: the plugin copies to `resolve(__dirname,'dist/js')`, ignoring `--outDir`.

## Scope
- Strip `<!-- … -->` before scanning (root cause), not just reword the comment.
- Regression test: scanner ignores scripts inside comments; real classic scripts still found.
## Don't
- Don't change which scripts are classic vs module.
