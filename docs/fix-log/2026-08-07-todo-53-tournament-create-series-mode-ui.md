# Fix log entry — 2026-08-07 06:40

## Prompt

TODO.md #53 (user report, 2026-08-07): "Organizer cannot set race-to-margin
or sub-game. Check Backend & front-end?" — the pairing game-series feature
(TODO.md #50) has full backend support (`TournamentManager.createTournament`
validates `seriesMode`/`seriesGameCount`/`seriesTargetScore`/`seriesMargin`,
`server/managers/tournament/series.js` implements both modes, covered by
`server/tests/series.test.js` and `TournamentManager.test.js`), but the
create-tournament modal never grew any UI for it — `readTournamentRuleSet()`
in `client/js/tournaments.js` never read those fields, so every tournament
silently created as `seriesMode: 'single'` regardless of organizer intent.

## Action

Per `docs/todo/B53-*.md`'s "Việc cần làm khi triển khai fix":

1. [client/index.html](client/index.html) — added a series-mode radio group
   (`tSeriesMode`: `single`/`fixedCount`/`raceToMargin`) to
   `#modal-create-tournament`, plus a game-count number input
   (`#t-series-game-count`) and target/margin number inputs
   (`#t-series-target`/`#t-series-margin`), each in its own `.setting-row`
   hidden by default (`style="display:none;"`) — same show/hide-by-mode
   pattern already used for the Swap2 → wall/portal interlock and the
   Blitz-only timer-increment row in this same modal.
2. [client/js/tournaments.js](client/js/tournaments.js):
   - Added a `sync()` IIFE (mirroring the existing Swap2/timer-increment
     ones) that toggles the three new rows' visibility on
     `tSeriesMode` change.
   - Extended `readTournamentRuleSet()` to read `seriesMode` and, depending
     on mode, `seriesGameCount` or `seriesTargetScore`/`seriesMargin`, and
     include them in the returned `ruleSet`.
   - Added client-side validation in the `modalConfirm` click handler
     (game count ≥ 2 for `fixedCount`; target > 0 and margin > 0 for
     `raceToMargin`) — per B53's explicit ask, since the backend's
     safe-fallback-to-`'single'` on bad input would otherwise let an
     organizer submit garbage and silently get a single-game tournament
     with no feedback about why.
3. [client/js/i18n.js](client/js/i18n.js) — added matching vi/en key pairs
   for the new labels and the two validation alert messages
   (`tournaments.series_*`).

Bumped the shared cache-bust version `?v=66 → ?v=67` across every
`client/*.html` and every `?v=` import in `client/js/*.js`, verified with
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a
single `?v=67` value.

## Decision

Implemented exactly the scope in `docs/todo/B53-*.md` — no new tournament
features, only wiring the already-approved/already-backend-supported
series-mode fields into the existing modal. Did not reopen
`features/tournament-match-series/` for design discussion, per B53's note
that this is "a bug in an already-merged feature (B50), not a new design
decision" — B50's design already specified organizer-entered `seriesMode`.

Client-side validation thresholds mirror the backend's own validation in
`TournamentManager.createTournament` (`server/managers/tournament/
TournamentManager.js:1059-1090`) exactly, except the fixed-count minimum:
backend accepts `seriesGameCount >= 1`, but the client enforces `>= 2` per
B53's explicit instruction ("số ván ≥ 2") — a 1-game "series" is
indistinguishable from `single` and is almost certainly an organizer typo,
so surfacing it as a validation error client-side is more helpful than
silently accepting it and behaving identically to `single`.

No Jest unit test added — this is a pure client-side DOM/form change in
`client/js/`, which has no test infrastructure runnable via `npm test`
(per `CLAUDE.md`'s bug-fix-workflow rule). The backend fields this UI now
populates were already covered by `server/tests/series.test.js` and
`TournamentManager.test.js` before this fix — this change adds no new
backend surface, only a client-side path to reach the already-tested
backend behavior. Verified instead with a real running server + Playwright
(Chromium), per the section below.

## Summary output

`npm test`: 809/809 passing (unchanged — no server code touched).

Playwright verification against `http://localhost:3001` (alternate port —
3000 was occupied by the user's own already-running dev server, left
untouched throughout) with a throwaway `server/db/gomoku.db` (moved aside
before starting, restored — checksum-verified identical, 3 `users` rows
intact — after):

- Opened `#modal-create-tournament`: series rows all `display:none` by
  default (single-game default preserved).
- Selected "raceToMargin": count row stays hidden, target/margin rows
  become visible (`display:block`).
- Filled target=5, margin=2, submitted → **queried the resulting row
  directly from the throwaway SQLite DB**: `rule_set` JSON contains
  `"seriesMode":"raceToMargin","seriesTargetScore":5,"seriesMargin":2` —
  confirms the field reaches the server and persists correctly end-to-end,
  not just that the DOM read it back correctly.
- Selected "fixedCount" with an invalid game count (1, below the client's
  minimum of 2): submit was blocked, the expected Vietnamese validation
  alert (`tournaments.series_validation_count`) fired, and zero additional
  WebSocket frames were sent — confirms the client-side guard actually
  prevents the request rather than just showing a cosmetic warning.
