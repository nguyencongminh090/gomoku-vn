# Fix log entry — 2026-08-12 00:07

## Prompt

User asked to check `git status` and pointed out that the uncommitted
`client/js/i18n.js` change sitting in the working tree looked related to
`feature/wall-second-move-chebyshev-distance` (already merged into `dev`
as TODO.md #103), not unrelated in-progress work as previously assumed.

## Action

Confirmed by inspection:

- `dc94b8f` (`feat(game): enforce WALL rule — P1's 2nd move min Chebyshev
  distance 4`, TODO.md #103, merged into `dev` at `31ffe88`) added a
  server-side check in `GameEngine.js`'s `makeMove()` that rejects an
  invalid second move with `code: 'WALL_SECOND_MOVE_MIN_DISTANCE'`. It
  touched only `server/`, `TODO.md`, and `docs/todo|instruction/B103-*.md`
  — no client-side change.
- `room-socket.js`'s `serverMessage()` (and every other error-alert call
  site in `client/js/*.js`) resolves server error codes via
  `t('err.' + data.code.toLowerCase())`.
- `client/js/i18n.js` had no `err.wall_second_move_min_distance` key in
  either the `vi` or `en` dictionary. `t()`'s fallback chain
  (`dict[key] || TRANSLATIONS['vi'][key] || key`) returns the *raw key
  string* when both dictionaries miss — so a player hitting this new WALL
  rule would see the literal text `err.wall_second_move_min_distance`
  instead of a real error message, in both languages.

The uncommitted `i18n.js` diff already in the working tree (found via
`git status`, not authored fresh this turn) was exactly the missing piece
— someone/some prior session had drafted it but never committed it as
part of #103's merge.

## Decision

Treated as a direct bug fix (a shipped, `✅`-marked feature emitting a
raw i18n key to real users), not new tracked work — implemented now
rather than filed to `TODO.md`. TODO.md #103's tracking only exists on
`dev` (confirmed: `git show main:TODO.md | grep '#103'` → nothing), so
per `CLAUDE.md`'s dev-only-tracking exception this fix branches off `dev`
and merges back to `dev`, not `main`.

Added a jsdom unit test (`client/tests/i18n-wall-second-move-error.test.js`)
asserting `t('err.wall_second_move_min_distance')` resolves to a real
message (not the raw key) in both `vi` and `en` — verified it actually
catches the regression by deleting the two dictionary lines and
re-running (2/2 tests failed as expected), then restored the fix.
`npm test`: 50 suites / 1070 tests passing.

Did not touch `docs/todo/B103-*.md`'s `Trạng thái` marker — the feature
itself still works as designed; this closes a translation gap in its
error path, not a functional regression in the rule.

## Summary output

- `client/js/i18n.js`: added `err.wall_second_move_min_distance` to both
  `vi` and `en` dictionaries.
- `client/tests/i18n-wall-second-move-error.test.js`: new file, 2 tests.
- `?v=102` → `?v=103` across all `client/*.html` and `client/js/*.js`
  (excluding the frozen `*-mockup.html` files).
- `docs/todo/B103-wall-rule-nuoc-thu-2-manhattan-khoang-cach-4.md`: added
  a short addendum note pointing at this fix-log entry.
