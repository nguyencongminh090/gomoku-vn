# B451 — Club channel links rewrite the URL to `/#ch=…` (base href)
**Status:** OPEN — root cause known
**Area:** `client/js/club.js` (`showChannel`), `client/club.html` (`<base href="/">`), `client/tests/clubs-pages.test.js`
**From:** B450 real-browser pass, 2026-11-25   **Depends:** —

## Problem
On `/c/<slug>`, clicking a channel (or `/lich`) calls `history.replaceState(null, '', '#ch=<name>')`. `club.html` has
`<base href="/">`, so the relative URL resolves to `/#ch=<name>`: the address bar shows the lobby URL. Reload, copy the
URL, or share it → the user lands on the home page, not the club. Also on `main` (`#tab=` version, before #446).
## Scope
1. Build the URL from the page path: `location.pathname + location.search + '#ch=' + name`.
2. Grep other `replaceState` / `pushState` / `href = '#…'` on pages with `<base href="/">`.
3. Regression test (jsdom with a `<base>`) + real-browser reload check.
## Don't
- Remove `<base href="/">` (pages rely on it for assets under `/c/` and `/u/`).
## Traps
- jsdom suites load `club.html` body only, so the `<base>` in `<head>` is missing there — the test must add one.
## Done when
- Reload after picking a channel stays on `/c/<slug>#ch=<name>`.
