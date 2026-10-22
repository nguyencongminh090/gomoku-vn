# 2026-10-22 12:10 — #306 lobby chips/links still 38px: unclosed brace in shell.css
## Prompt
"Run Test for #306-#314. Close if it Done" → real-browser re-measure showed #306 had no effect; user chose "Fix #306 bug".
## Root cause
`client/css/shell.css:276`: `body.zen-lobby .hp-about { order: 7;` was never closed, so the next rule (B306 `min-height: 44px` for `.link-action`, `.hp-qm .pchip`, …) was nested in `.hp-about` and never matched. 108bd32 was a code-only audit; jsdom does not evaluate media queries, so `npm test` stayed green.
## Fix
shell.css: close `.hp-about { order: 7; }`, drop the stray extra `}`. Branch fix/306-lobby-chip-touch-target (off dev). `node scripts/cache-bust.js --write` (5 html), check OK. Nothing else touched.
## Verification
New `client/tests/shell-css-braces.test.js` (balanced braces, no style rule nested in a style rule, 44px rule sits directly in the 860px @media): 2 of 3 fail without the fix, 3/3 pass with it. Other `client/css/*.css` scanned for nested style rules: none.
Real browser (Chromium 1243, own DB, guest, 360/375/414): 0 console errors, 0 4xx/5xx, no h-scroll; controls under 44px: only the `.pnav__brand` text logo (23px high). Before: 19 chips/links at 38–40px.
NOT verified/fixed: #307 — 67 text nodes still <14px at 375 (12px `.hstat__l`, `.muted`, `.qm-grp`, `.filter-pill`; 10.5px `.setting-label` in the settings modal), not covered by the calc(10–13px) rewrite; dark/light screenshots not reviewed; full `npm test` not re-run after the cache-bust.
