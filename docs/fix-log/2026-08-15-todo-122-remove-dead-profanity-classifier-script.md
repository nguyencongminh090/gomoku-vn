# Fix log entry — 2026-08-15 11:44

## Prompt

Do #122.

## Action

Removed the dead `<script src="js/profanity-classifier-model.js?v=125"></script>` tag from
`client/room.html:202` per `docs/todo/B122-*.md` / `docs/instruction/B122-*.md`. Left
`client/js/profanity-classifier-model.js` (the file itself) and `client/js/profanity-filter.js`
untouched, per instruction scope. Bumped `?v=125` → `?v=126` across every `client/*.html` and
`client/js/*.js` (mockups excluded), verified with the `CLAUDE.md` cache-bust grep down to exactly
one distinct value.

## Decision

Followed `docs/instruction/B122-*.md` verbatim — no deviation. Branching: `TODO.md #122`'s entry is
absent on `main` (`git show main:TODO.md | grep '#122'` empty) even though the dead script tag
itself predates the `dev`/`main` split, so per `git-workflow` skill's exception rule this fix
branches off `dev` and merges back into `dev` only, not `main`.

## Summary output

Manual verification (no Jest coverage for "which script tags an HTML page loads" — client-side, no
test infra for this, per `CLAUDE.md`): started a Playwright script against the user's already-running
dev server (did not restart it, did not touch `server/db/gomoku.db`) — logged in as guest, created a
quick-match room, captured all network requests reaching `room.html`: **0** requests for
`profanity-classifier-model.js` out of 102 total, 0 console errors. Chat-through-UI couldn't be
exercised end-to-end (quick-match room waits for a second player; `#room-entry-overlay` blocks clicks
until `room:joined`, which needs two seats) — instead `require()`'d `client/js/profanity-filter.js`
directly (unchanged CommonJS/UMD module) and re-ran representative test strings (clean, diacritics,
no-diacritics, leetspeak, benign phrases prone to false-positives): output matches prior behavior,
e.g. `"đụ má mày"` → `"***** mày"`, `"cái lon nước ngọt"` → unchanged. `npm test` 1147/1147 (server
tests unaffected, no server code touched). `?v=` 125→126, `fix/remove-dead-profanity-classifier-script`
off `dev`.
