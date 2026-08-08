# Fix log entry — 2026-08-08 08:27

## Prompt

"Do #62" — TODO.md #62 / instruction.md B62: check-in "Sẵn sàng" giữa các ván trong series bắt
người chơi quay lại trang giải đấu; nên giữ họ ở lại `tournament-match.html`, tái dùng UI pattern
của Start Modal (Room, B36).

## Action

instruction.md B62 had three open questions blocking implementation (overlay layout, ready-window
deadline mechanism, opt-out during series). Resolved them with the user via AskUserQuestion before
writing code — see updated `docs/instruction/B62-*.md` "Câu hỏi mở — đã chốt" section:

- Overlay layout: reuse the existing `series-transition-overlay` (no separate modal), score already
  shown elsewhere on the page.
- Deadline: reuse the pairing's own existing `deadline`/`tournamentState` sweep mechanism
  (`PairingLifecycle.startNextGame` already sets this on every Ready-state entry, server-unchanged).
- Opt-out: none during an unfinished series — the leave link (`#back-to-tournament`) is locked
  while the pairing is undecided (playing OR waiting on check-in) and only unlocks once the
  pairing/series result is final.

Implementation (client-only, no server code touched — confirmed the existing
`tournament:ready` → `TournamentManager.markPairingReady()` → `PairingLifecycle.markReady()` path
already works from any page, it's just never had a second UI entry point):

- `client/tournament-match.html`: replaced the `series-transition-overlay`'s static "go back to the
  tournament page to check in" text/link with a "Sẵn sàng" button + waiting-state text.
- `client/js/tournament-match.js`: wired the button to `client.emit('tournament:ready', ...)`
  (same event `tournament-detail.js`'s pairing-card button already used); added `setLeaveLocked()`
  toggling a new `.detail-back--disabled` class (`client/css/tournament.css`) on
  `#back-to-tournament`, locked on `tmatch:init`/`showSeriesTransition`, unlocked only in
  `showResultOverlay` (pairing/series decided).
- `client/js/i18n.js`: replaced the now-dead `series_check_in_prompt`/`series_back_to_check_in`
  keys with `series_ready_btn`/`series_ready_waiting`/`series_ready_waiting_spectator` (vi/en).
- Cache-busting bump `?v=76` → `?v=77` across every `client/*.html` and `client/js/*.js` import site.

## Decision

No server-side changes and no new Jest test — the fix is purely a client-side UI entry point into
an already-fully-tested server code path (`markPairingReady`/`PairingLifecycle.markReady` have
existing coverage in `server/tests/TournamentManager.test.js`/`PairingLifecycle.test.js`). Per
CLAUDE.md's bug-fix workflow, `client/js/` has no unit-test infrastructure — verified via a real
two-browser-tab Playwright run instead (throwaway script, not added to the permanent `e2e/` suite):
created a `fixedCount(2)` series pairing via raw socket setup, drove the UI through resign → between-
games overlay → both "Sẵn sàng" clicks → game 2 auto-starts in place → resign again → series decided
→ leave link unlocks. Confirmed the leave link stays locked and un-clickable throughout, and the
page never navigates away. Followed the real-DB safety protocol (moved `gomoku.db` aside, ran
against a fresh throwaway db, restored the real db afterward — checksum-verified restore).

## Summary output

- `npm test`: 844/844 passed (no server code changed, existing suite as regression guard).
- Manual Playwright verification (2 tabs, real browser): passed — see Action/Decision above.
- Feature branch: `feature/tournament-series-checkin-in-place` off `dev`, merged back to `dev`.
