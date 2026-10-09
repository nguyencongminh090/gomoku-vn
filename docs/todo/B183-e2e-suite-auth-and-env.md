# B183 — e2e suite: stale auth helpers + localhost env
**Status:** ✅ DONE 2026-10-09 — suite went 6 passed/40 failed -> 50-52 passed of 56; remaining: 2 `fixme` (#184), 3 flaky (#185)
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

## Result
- `e2e/helpers/auth.ts`: `authAsGuest` / `authAsMember` / `seedSession` / `singleTapPlacement` (cookie session + `gvn_user`); 22 specs migrated. Raw-socket probe in security-boundary now sends the session cookie.
- `e2e/helpers/fixtures.ts`: drop-in `test` whose contexts `room:leave` before closing, so finished specs stop eating the per-IP room quota (Playwright closes browser-made contexts before fixture teardown, so it hooks `ctx.close()`); `dropConnection()` opts out for kick-blocked-interrupted. `e2e/helpers/lobby.ts`: `waitForEmptyLobby()` for the two quota-sensitive specs.
- Stale specs fixed: `.room-card` -> `.room-row`; lobby-patch seeds 3 rooms (cap is 3).
- `playwright.config.ts`: workers 1, non-opening HTML report, `PW_CHROMIUM_PATH` escape hatch. `e2e/README.md`: run recipe.
- Trap hit while migrating: my first regex dropped `gomoku_click_mode=single` from 4 specs (clicks then need a confirm tap) — restored via `singleTap` option.
- Still open: #184 (topnav-minimal-mobile, 2 cases `fixme`), #185 (3 flaky). Not measured: whether the suite passed before #68 (no baseline run).
