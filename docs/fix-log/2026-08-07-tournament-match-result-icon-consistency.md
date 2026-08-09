# Fix log entry — 2026-08-07 10:13

## Prompt

User, after reviewing the Playwright UI/UX screenshot report (tournament feature walkthrough):
pasted a screenshot of the between-games series-transition overlay showing "Bạn đã thắng!"/"Bạn đã
thua" — both with the same orange fast-forward-looking icon — and asked to "Consider Icon used in UI
for all". Confirmed via `AskUserQuestion` to fix the outcome icons now, matching the app's existing
Phosphor icon system rather than raw emoji.

## Action

`client/tournament-match.html`'s `#series-transition-icon` was hardcoded to a static `⏭️` emoji
regardless of who won that individual game — unlike `#match-result-icon` (the final-result overlay),
which already switched between `🏆`/`😔`/`🤝` via `showResultOverlay()` in
[client/js/tournament-match.js](client/js/tournament-match.js). `showSeriesTransition()` computed the
win/lose/draw *title* text but never touched the icon, so every between-game transition looked
identical no matter the outcome.

Fixed by:
- Converting both `#match-result-icon` and `#series-transition-icon` from plain `<div>` emoji text to
  `<i>` elements using this app's existing Phosphor icon font (already used everywhere else in the UI
  — topnav, action-banner, pairing-card — emoji was the outlier, not the rest of the app).
- Added a shared `outcomeIconClass(isDraw, isWin, isSpectator)` helper in `tournament-match.js`
  mapping: draw → `ph-handshake`, win → `ph-trophy`, loss → `ph-smiley-sad`, spectator (no `mp`,
  someone else's outcome) → `ph-flag-checkered` (same glyph as the pre-outcome default state).
- `showSeriesTransition()` now calls this helper the same way `showResultOverlay()` already did,
  setting `#series-transition-icon`'s `className` per outcome instead of leaving it static.

## Decision

Client-side only (`client/tournament-match.html`, `client/js/tournament-match.js`) — bumped
cache-bust `?v=69` → `?v=70` across every `client/*.html` and `client/js/*.js` location per
`CLAUDE.md`'s cache-busting rule, verified with
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a single `?v=70` value.

No new Jest unit test — same reasoning as other tournament-match.js UI fixes in this log: pure
client-side rendering/icon-selection logic, no server code touched, and `client/js/` has no test
infrastructure per `CLAUDE.md`'s bug-fix-workflow rule. Verified live instead: ran the real
create → register → start → negotiate → confirm → check-in → resign flow via Playwright against a
throwaway DB (moved real `server/db/gomoku.db` aside first, restored + md5-verified after, per the
Playwright/e2e db-safety rule), confirmed the losing player's overlay icon class read
`match-result-card__icon ph-bold ph-smiley-sad` and the rendered glyph is a proper sad-face icon (not
the fast-forward icon from the original report).

This repo's tournament feature only exists on `dev` (not yet merged to `main`), so this fix branches
off `dev` (`fix/tournament-match-outcome-icons`) and merges back to `dev`, per `CLAUDE.md`'s
dev-only-code exception.

## Summary output

`npm test`: 809/809 passing (unchanged — no server code touched). Live Playwright verification
confirmed the fix: the losing player's result overlay now shows `ph-smiley-sad`, distinct from a win
(`ph-trophy`) or draw (`ph-handshake`), instead of the same icon for every outcome.
