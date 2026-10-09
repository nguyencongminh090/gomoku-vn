# 2026-10-09 15:56 — #188 remove the Playwright scaffold spec that hit playwright.dev
## Prompt
"next #188"
## Root cause
`tests/example.spec.ts` was Playwright's generated sample (from `163eb33`). It tested nothing in this app and needed
the internet, so in #185's verification run 2 both cases timed out on `page.goto('https://playwright.dev/')`.
## Fix
Deleted it (`tests/` had nothing else) and dropped `tests/**/*.spec.ts` from `playwright.config.ts` testMatch.
Jest's `**/tests/**/*.test.js` is unrelated and untouched. Branch `fix/188-remove-pw-scaffold` off dev.
## Verification
`npx playwright test --list`: 56 tests in 33 files, none from `tests/`; grep shows no external URL in `e2e/`.
Full e2e suite not re-run.
