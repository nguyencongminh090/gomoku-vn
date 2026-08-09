# Fix log entry — 2026-08-07 06:29

## Prompt

TODO.md #54 (user report, 2026-08-07): clicking "Quay lại danh sách giải
đấu" ("Back to tournament list") on the tournament detail page
(`tournament.html`) always lands on `index.html`'s default "Bàn chơi"
(tables) tab, instead of the "Giải đấu" (tournaments) tab the user came
from — they have to manually click the tab again every time.

## Action

Root cause confirmed in `docs/todo/B54-*.md`: the back link at
`client/tournament.html:50` pointed to plain `href="index.html"` with no
param, and `client/js/tournaments.js` had no code reading `location.search`
on load — `activateTab()` was only ever invoked from the two tab click
handlers.

Applied the fix exactly as scoped in the detail file:

1. [client/tournament.html](client/tournament.html) — changed the back
   link to `href="index.html?tab=tournaments"`.
2. [client/js/tournaments.js](client/js/tournaments.js) — added a
   `URLSearchParams(location.search)` read right after the tab
   click-handler wiring; if `tab=tournaments`, calls the existing
   `activateTab('tournaments')` (no new tab-switch logic) and then
   `history.replaceState(null, '', location.pathname)` to strip the param
   so a later manual refresh doesn't get stuck on the tournaments tab.

Bumped the shared cache-bust version `?v=65 → ?v=66` across every
`client/*.html` and every `?v=` import in `client/js/*.js` (per
`CLAUDE.md`'s cache-busting rule, both the entry-file `<script>` tags and
non-entry cross-imports like `tournaments.js`'s `import ... from
'./lobby.js?v=66'`), verified with `grep -rn "?v=" client/*.html
client/js/*.js | grep -v mockup` showing a single `?v=66` value.

## Decision

Implemented exactly what `docs/todo/B54-*.md` specified — no scope
extension. Did not touch the optional/non-mandatory UX note in that file
about deciding whether to clear the param via `history.replaceState`; did
apply it, since the detail file left it "for the implementer to decide"
and leaving the param in the URL after landing would let a manual page
refresh silently strand the user on the tournaments tab forever, which is
a worse default than clearing it.

No Jest unit test added — this is a pure client-side navigation/DOM change
in `client/js/`, which `CLAUDE.md` notes has no test infrastructure
runnable via `npm test`. Verified instead with a real running server
(`node server/index.js`, throwaway DB per the Playwright-safety rule) and
Playwright (Chromium), scripted rather than manual since no interactive
browser session was available.

## Summary output

`npm test`: 809/809 passing (unchanged — no server code touched).

Playwright verification against `http://localhost:3001` (alternate port —
port 3000 was occupied by the user's own already-running dev server,
which was left untouched throughout) with a throwaway `server/db/gomoku.db`
(moved aside before starting, restored — checksum-verified identical,
3 `users` rows intact — after):

- Guest session via `POST /api/auth/guest`, token seeded into
  `localStorage`, then `GET /index.html?tab=tournaments`:
  `#tab-tournaments` has `is-active` + `aria-selected="true"`,
  `#panel-tournaments` has `is-active`, and the URL was cleaned back to
  `http://localhost:3001/index.html` (query param stripped) — matches the
  expected behavior from the back link.
- `GET /index.html` with no query param: `#tab-tables` still `is-active`
  by default — confirms the fix doesn't change the default landing tab
  for any other entry path into the lobby.
