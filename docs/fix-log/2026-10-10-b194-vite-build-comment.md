# 2026-10-10 16:50 — #194 vite build fails on a script tag inside an HTML comment
## Prompt
"Okay, #194"
## Root cause
`findClassicScripts()` regex-scanned raw HTML, so the prose `<script src="js/..."> tags` in a diagnostic.html comment became file `...` → `cpSync` ENOENT in `closeBundle`.
## Fix
Scanner moved to `scripts/classic-scripts.js` (CommonJS, Jest-testable) and strips `<!-- … -->` (unterminated comment hides the rest, like a browser) before matching; `vite.config.js` imports it. Classic-vs-module rules and the dist/js destination untouched. Branch `fix/vite-build-html-comment-194`; no client change, no ?v= bump.
## Verification
`server/tests/classic-scripts-scan.test.js` (4: strip ?v=/skip modules, comments ignored, unterminated comment, every real result exists in client/js). `npx vite build` exits 0; all classic scripts found are present in dist/js (0 missing). Not verified: serving dist/ in a browser; `--outDir` is still ignored by the plugin (separate, out of scope).
