# B183 — e2e suite: stale auth helpers + localhost env
**Status:** OPEN
**Area:** e2e/*.spec.ts (31 files), playwright.config.ts, e2e/TEST-MATRIX.md
**From:** #182 verification run, 2026-10-09   **Depends:** —

## Problem
`npm run test:e2e` gives no signal. Run 2026-10-09 (throwaway DB, 1 worker): ~40 of 56 specs failed, not from app code.
1. Specs log in via `localStorage.gvn_token` (`makeGuest()` etc.); since #68 auth is a cookie session +
   `localStorage.gvn_user`, so the server logs `Socket invalid legacy token` (720×) and the page never joins.
2. `.env` `CORS_ORIGIN` is the production domain → every localhost socket is rejected (`bad origin`, 967×).
   Needs `CORS_ORIGIN=http://localhost:3000` on the server under test.
3. Default auth limiter (20) is tripped by many guest logins from one IP (`Too many requests`).
4. Installed Playwright 1.62.1 wants chromium rev 1234; only 1243 is on disk (no install allowed per
   `playwright-e2e-safety`) → needs `launchOptions.executablePath` or a matching browser.
5. Suspected, unverified: the suite was never re-run on a pre-#68 commit, so how much failure is truly stale is not measured.

## Scope
1. One shared helper: register/guest through the real login UI (or API + set `gvn_user`) per the skill.
2. Run recipe in the todo or `e2e/README`: db aside, `CORS_ORIGIN`, `AUTH_LIMITER_MAX`, `workers: 1`.
3. Re-run; fix or delete each still-failing spec; update TEST-MATRIX statuses.

## Don't
- Don't raise `MAX_ROOMS_PER_IP` — `leave-then-create-room.spec` asserts the quota.
- Don't touch the real DB or run `npx playwright install` (see `playwright-e2e-safety`).
- Don't change app code to make a stale spec pass.

## Traps
- `pkill -f "playwright test"` inside a bash command kills its own shell; kill by PID.
- Leftover servers on :3000 poison the next run.

## Done when
- `npm run test:e2e` is green (or each skip documented) on a fresh DB with the recipe above.
