# 2026-10-12 16:00 — Club Manage "Màu" swatches rendered grey
## Prompt
"Màu not load color here" (screenshot: 8 dark circles, none coloured)
## Root cause
#235 painted colours with `.pav.pav--c-<key>` (avatar tiles). The swatch buttons carry only `pswatch pav--c-<key>` — no `.pav` — so the compound selector never matched and the buttons kept the default fill. Not caused by #250; it shipped broken in #235.
## Fix
platform.css: each rule now also matches `.pswatch.pav--c-<key>`. Did not add `.pav` to the buttons (it would bring avatar size/flex/font). ?v=360.
## Verification
Regression test (clubs-pages.test.js): every rendered swatch class has a matching `.pswatch.pav--c-*` background rule in platform.css. Browser check below.
