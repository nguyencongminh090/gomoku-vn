# 2026-11-25 — #451 Club/social hash links resolve to `/#…` under `<base href="/">`
## Prompt
"do #451" — on `/c/<slug>` picking a tab/channel rewrote the URL to `/#ch=…`; reload/share landed on the lobby.
## Root cause
`history.replaceState/pushState` parse a relative URL against the document base URL. `club.html` and
`social.html` carry `<base href="/">`, so a bare `'#x'` became `/#x`. Same class as #281 (`?x` on forum/puzzles).
## Fix
- `client/js/club.js`: tab hash written as `location.pathname + location.search + '#tab=…'`.
- `client/js/social.js`: `here()` prefix for `#dm=` in `go()` (push/replace) and `openInitial()` — `/social.html#dm=x`
  previously became `/#dm=x` too (todo Scope 2 grep). Branched off `main` (bug exists there, `#tab=` form);
  on `dev` the club line is `#ch=` (after #446) — resolve the merge by keeping the `#ch=` text with the path prefix.
- Grep of other `<base>` pages: `admin.js` sets `location.hash` (not base-relative); `lobby-home.js` lives on `/`.
  `platform-shell.js` `a.href = '#'` placeholder (until /me answers) is out of scope, not reported.
## Verification
- New jsdom tests with a `<base href="/">` in head: `clubs-pages.test.js`, `social-bell.test.js` (red before, green after).
- `npm test` 4411/4411. cache-bust OK.
- Headless Chrome on a stub page with `<base href="/">` at `/c/caro`: bare hash → `/#ch=board` after reload;
  path-prefixed → `/c/caro#ch=board` after reload. Full app real-browser reload not run.
