# Fix log entry — 2026-08-15 13:00

## Prompt

Do #123.

## Action

Added `<link rel="preload" as="font" type="font/woff2" href="..." crossorigin />` to the `<head>` of
6 real pages, immediately before each page's matching `<link rel="stylesheet" href="vendor/phosphor/
.../style.css">`, per `docs/instruction/B123-*.md`:

- `index.html`, `login.html`: only `Phosphor.woff2` (bold dropped since B108(a); grep-confirmed
  neither page loads `bold/style.css`).
- `room.html`, `tournament.html`, `tournament-match.html`, `history.html`: both `Phosphor.woff2` and
  `Phosphor-Bold.woff2` (all four load `bold/style.css`).

`href` values checked against the real files on disk (`ls client/vendor/phosphor/regular/*.woff2
client/vendor/phosphor/bold/*.woff2`) before writing, per the instruction's "don't guess the
filename" note. Did not touch `vendor/phosphor/*/style.css` (kept `@font-face`/`font-display: swap`
as-is) and did not add `modulepreload` (separate item, #126).

Bumped `?v=126` → `?v=127` across all `client/*.html` and every `client/js/*.js` (the two frozen
mockups, `tournament-detail-mockup.html`/`tables-tournaments-mockup.html`, deliberately excluded per
`CLAUDE.md`). Verified with the cache-busting grep from `CLAUDE.md`
(`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup`) — exactly one distinct value
(`127`) remains.

## Decision

Followed `docs/instruction/B123-*.md` verbatim — no deviation. Branching: `TODO.md #123`'s entry is
absent on `main` (`git show main:TODO.md | grep '#123'` empty), so per the `git-workflow` skill's
exception rule this fix branches off `dev` and merges back into `dev` only, not `main`.

Did not perform the manual DevTools Network/Console verification (no Jest coverage exists for
`<head>` HTML in this repo) — left as an explicit open item in `docs/todo/B123-*.md` rather than
silently claiming it was checked.

## Summary output

No server-side tests affected (no `.test.js` under `server/tests/` touches `<head>` markup); ran
`npm test` to confirm no regression. `?v=` 126→127. `fix/preload-phosphor-woff2` off `dev`.
