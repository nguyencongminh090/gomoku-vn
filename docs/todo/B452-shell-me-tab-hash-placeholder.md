# B452 — Phone tab bar "Tôi" placeholder `href="#"` resolves to `/` under `<base href="/">`
**Status:** OPEN
**Area:** `client/js/platform-shell.js` (tab bar build, ~l.437; `/me` handler ~l.382), `client/tests/` shell suite
**From:** #451 grep of `<base>` pages, 2026-11-25   **Depends:** —

## Problem
For a signed-in member the phone tab bar's `me` link starts as `a.href = '#'` until `fetchMe()` answers, then gets
`/u/<name>`. On pages with `<base href="/">` (club, social, profile, settings, forum, puzzles, rankings, admin…)
`'#'` resolves to `/#` — a tap before `/me` returns (slow network) or after `/me` fails (`.catch` leaves it) opens the lobby.
## Scope
1. Make the placeholder inert instead of `'#'`: no `href` (or `aria-disabled`) until `/u/<name>` is known.
2. Keep the existing `/me` handler that sets the tab's `href` from the chip's `profile.href`.
3. Regression test (jsdom, `<base href="/">` added to head — jsdom suites load body only).
## Don't
- Remove `<base href="/">`.
- Change the desktop chip's own profile link.
## Traps
- A link without `href` loses keyboard focus/role semantics; check the tab still reads as a tab item.
- Same root cause class as #281 / #451.
## Done when
- Before `/me` answers, tapping "Tôi" does not navigate to `/`; after, it opens `/u/<name>`.
