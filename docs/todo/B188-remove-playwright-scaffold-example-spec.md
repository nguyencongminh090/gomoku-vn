# B188 — tests/example.spec.ts is the Playwright scaffold and needs the internet
**Status:** OPEN
**Area:** tests/example.spec.ts, playwright.config.ts (testMatch includes tests/**)
**From:** #185 5x full-suite verification, 2026-10-09 (run 2: both cases timed out on page.goto playwright.dev)   **Depends:** —

## Problem
`npm run test:e2e` also runs Playwright's generated sample (`page.goto('https://playwright.dev/')`), which
tests nothing in this app and fails whenever the external site is slow/unreachable.

## Scope
1. Confirm nothing else lives in `tests/**/*.spec.ts`; delete the scaffold and drop `tests/**` from `testMatch` if empty.

## Done when
- Suite count drops by 2 and no spec touches an external host.
