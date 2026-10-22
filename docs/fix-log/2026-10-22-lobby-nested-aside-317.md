# 2026-10-22 15:45 — #317 lobby `<aside class="hstack">` nested in a landmark (axe)
## Prompt
"Do #317"
## Root cause
`client/index.html` right column was an `<aside>` inside the lobby `<section>` landmark → axe `landmark-complementary-is-top-level`.
## Fix
index.html: `<aside class="hstack">` → `<div class="hstack">` (same classes). shell.css: `.psplit > aside` container-type rule → `.psplit > .hstack:last-child` (platform.css `.psplit > aside` left for other pages; `body.zen-lobby .hstack` already sets the flex column). Cache-bust written (?v= OK).
## Verification
New client/tests/lobby-no-nested-aside.test.js; `npm test` 191 suites green. NOT verified: axe re-run / visual at 375px in a real browser.
