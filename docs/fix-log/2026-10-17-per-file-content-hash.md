# 2026-10-17 06:01 — #265 Per-file content-hash `?v=` instead of one global `?v=N`
## Prompt
"Do #265" — after a 1-file change every returning player re-downloaded the whole page set (one shared `?v=389`).
## Root cause
`scripts/cache-bust.js` wrote one global counter, so any edit gave all 91 versioned URLs a new query and the CF
edge / browsers discarded every `immutable` cached asset.
## Fix
- `scripts/cache-bust.js` rewritten: `?v=` = first 8 hex of sha256 of the referenced file; files that hold refs are
  hashed after their own refs are rewritten (Merkle, Tarjan SCC order; a cycle is hashed as one unit). `./`,`../`
  resolve against the module, other refs against `client/`; unresolvable ref = FAIL. `--write` (alias `--bump`),
  no-arg = verify (rewrite would change nothing). `--set` removed (exits with a pointer).
- Tests: new `server/tests/cache-bust.test.js` (resolution, idempotency, leaf→importers only, cycle, real tree is
  up to date). Widened `\d+` → hex in 7 suites; `socket-early-connect` now asserts one hash per path (was one value
  per page); `room-profanity-lazy` expects profanity-filter.js's own hash (was room-entry's page version).
- Docs: `.claude/rules/cache-busting.md` (+assets/vendor paths), CLAUDE.md rule 4 (now "any edit under `client/`") +
  commands, knowledge notes `engineering-method-lessons`/`server-client-clock-sync`, `git-workflow` merge recipe (take either side,
  re-run `--write`), `design-workflow` bump steps.
- No server change: `staticCache.js` is path-based (non-HTML → immutable), hex queries need nothing.
## Verification
- `npm test` 181 suites / 3303 tests green; verify OK; `--write` twice → 0 files the 2nd time; 91 targets, 1 hash each.
- 1-file edit, URLs that change (was 91): `escape-utils.js` → 1; `lobby.css` → 1; `room-ui.js` → 2 (+room-entry);
  `i18n.js` → 6 (+5 entry modules).
- Real browser (Chromium, isolated server on temp `GOMOKU_DB_PATH`, real db md5 unchanged): lobby 33 / room 34 (real
  room created via #rooms UI) / settings 25 assets, every module requested once, no path with 2 queries, 0 console
  errors; chat focus → `/js/profanity-filter.js?v=ffb6ee81` 200, `window.ProfanityFilter` defined.
- e2e Chromium full run: 7 pass / 39 fail / 10 not run — all 39 are `#btn-create` hidden on lobby home
  (#195); same failure on unmodified `dev` → recorded as #267, not a #265 regression.
- Not covered (pre-existing, out of scope): `assets/brand/logo-mark.svg` favicon has no `?v=`; `diag-entry.js`
  `ASSET_VERSION = 168` template left as-is.
