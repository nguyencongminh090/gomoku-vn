# 2026-10-12 — Club banner too small on mobile
## Prompt
"Banner (club) on Mobile is small."
## Root cause
`.cb-banner` is `aspect-ratio: 6/1` at every width (matches the 1200×200 upload), so a 360px phone gets ~60px of banner.
## Fix
platform.css: `@media (max-width: 600px) { .cb-banner { aspect-ratio: 3/1 } }` — 120px tall at 360px. `background-size: cover` crops the left/right of the 6:1 image; the editor stays 6:1, so keep key content centred.
## Verification
Test in clubs-pages.test.js asserts the rule. Not viewed in a real browser; 3:1 is a judgement call (tell me if you want taller).
