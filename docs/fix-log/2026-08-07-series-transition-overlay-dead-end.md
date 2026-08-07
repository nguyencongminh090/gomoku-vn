# Fix log entry — 2026-08-07 10:28

## Prompt

User: "'Đang chuẩn bị ván tiếp theo...' Took too long and not move to next game. Case: User finishe
their first game in sub-game. But Server not move it to second game."

## Action

Not a server bug — the server behaves exactly as designed
(`PairingLifecycle.startNextGame`, called from `TournamentManager.recordPairingResult` when
`evalResult.seriesComplete` is false): it deliberately resets the pairing back to the `Ready` state
with an **empty** `readyPlayers` set after every non-final game in a series, requiring both players
to call `tournament:ready` again on the tournament detail page before the next game starts. This is
intentional — see `startNextGame`'s own doc comment — it reuses the same Ready-state
check-in/deadline machinery so a mid-series no-show can still be caught by the existing
`resolveDeadline()` walkover branch (planning.md decision 3 / instruction.md B50: "don't write a new
walkover mechanism"). Removing that requirement would remove the only way to detect a player who
disappears between games 1 and 2 of a series.

The actual bug was client-side: `#series-transition-overlay` (`client/tournament-match.html`) is a
`position: fixed; inset: 0` overlay that covers the entire viewport — including the page header's
`#back-to-tournament` link underneath — and previously only showed a passive
"Đang chuẩn bị ván tiếp theo..." message with **no way to leave the page**. A player had no way to
discover they needed to go back to `tournament.html` and click "Sẵn sàng" again, so the overlay just
looked permanently stuck, matching the report exactly.

Fixed in `client/tournament-match.html` + `client/js/tournament-match.js`:
- Replaced the passive text with an explicit instruction ("Cả hai người chơi cần quay lại trang giải
  đấu và bấm 'Sẵn sàng' để bắt đầu ván tiếp theo.") — new i18n keys `tmatch.series_check_in_prompt`
  (VI + EN).
- Added a working `<a id="series-transition-back">` CTA link, wired to
  `tournament.html?id=<tournamentId>` the same way `#match-result-back` and `#back-to-tournament`
  already are — new i18n key `tmatch.series_back_to_check_in` (VI + EN).
- Removed the now-unused `tmatch.series_waiting_next` i18n key (VI + EN) it replaced, rather than
  leaving it as dead entries.

## Decision

Client-side only (`client/tournament-match.html`, `client/js/tournament-match.js`,
`client/js/i18n.js`) — bumped cache-bust `?v=71` → `?v=72` across every `client/*.html`/
`client/js/*.js` location (`i18n.js` is a shared cross-page module, so the bump isn't scoped to just
`tournament-match.html`), verified with `grep -rn "?v=" client/*.html client/js/*.js | grep -v
mockup` showing a single `?v=72` value.

No new Jest unit test — pure client-side UI/copy fix, no server code touched;
`client/js`/`client/tournament-match.html` have no test infrastructure per `CLAUDE.md`'s
bug-fix-workflow rule. Verified live via Playwright instead: reproduced the exact reported scenario
(2-game fixed-count series, Player A resigns game 1), confirmed the new CTA link's `href` points at
the correct tournament detail page and that clicking it successfully navigates away from the
previously-inescapable overlay.

`tournament-match.html` only exists on `dev` (not yet merged to `main`), so this fix branches off
`dev` (`fix/series-transition-dead-end`) and merges back to `dev`, per `CLAUDE.md`'s dev-only
exception.

## Summary output

`npm test`: 809/809 passing (unchanged — no server code touched). Live Playwright verification:
the between-games overlay now shows an actionable prompt + a working link back to the tournament
detail page, instead of leaving the player stuck with no way to reach the check-in step for the
next game.
