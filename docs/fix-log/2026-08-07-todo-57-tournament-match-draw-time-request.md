# Fix log entry — 2026-08-07 10:58

## Prompt

User: "Do #57" — TODO.md #57, an item recorded earlier the same day from a user request made mid-#52
full-refactor: "Tournament room can keep: Resign, Draw, Time Request as Tables." (Tables = room.html's
normal casual-room gameplay). The detail file
(`docs/todo/B57-tournament-match-them-draw-offer-va-time-request-nhu-phong-thuong.md`) had left three
open design questions unresolved ("chưa có quyết định, cần thảo luận thêm trước khi implement"), so
before implementing, `AskUserQuestion` was used to resolve them:
1. Bonus-time-request quota: per-game (resets every new game in a series) — chosen over per-series.
2. Quota value: reuse `config.TIME_REQUEST_FREE`/`TIME_REQUEST_BONUS` as-is — no tournament-specific
   config.
3. Draw offers: self-agreed between the two players (`GameEngine.offerDraw/acceptDraw/declineDraw`,
   already `RoomManager`-independent) — no organizer approval step.

These were written up as `docs/instruction/B57-*.md` before any code was touched, per the
"read/write the matching instruction.md entry" rule.

## Action

- `server/socket/handlers/TournamentMatchHandler.js`: added `tmatch:draw_offer`/`draw_accept`/
  `draw_decline` (thin wrappers over the existing `GameEngine` methods — no new engine logic needed)
  and `tmatch:request_time`/`time_accept`/`time_decline` (ported from `GameHandler.js`'s
  `game:request_time` family, since `GameEngine` has no bonus-time concept — the per-game
  `_timeRequestsUsed`/`_timeRequestPending` bookkeeping was added directly onto the `match` object in
  `tournamentState.tournamentGameMap`, initialized fresh in `startMatch()`, which already recreates
  that object every new game — no extra reset code needed for the "per-game not per-series" decision).
  A `_timerSlotForUser()` helper resolves the FIXED black/white `TimerManager` slot (tied to
  `pairing.player1EntryId`/`player2EntryId` for the whole series) from a `userId`, since that's
  distinct from `engine.players[].color` (which alternates every game) — same distinction the
  pre-existing `tmatch:move` handler already had to make.
- `client/tournament-match.html` + `client/js/tournament-match.js`: added `#btn-draw`/`#btn-time`
  buttons next to the existing `#btn-resign`, and `#draw-prompt-area`/`#time-prompt-area` containers.
  Reused `game.css`'s `.btn-game--draw`/`.btn-game--time`/`.draw-prompt`/`.btn-draw-action` classes
  (already loaded on this page since the #52 refactor) and the existing `game.*` i18n keys
  (`game.btn_draw`, `game.draw_offer`, `game.time_offer`, etc.) as-is — no new CSS or `tmatch.*`
  translation keys. `renderDrawPrompt()`/`renderTimePrompt()` are a small self-contained port (not a
  reuse of `game-ui.js`'s versions, which are coupled to `window.RoomState`), matching this file's
  existing pattern for `renderSwap2Banner()`/chat.
- `?v=` cache-bust bumped 72 → 73 across every `client/*.html` and `client/js/*.js` occurrence
  (verified with the grep command in `CLAUDE.md` — exactly one value, `73`, across all matches).

## Decision

Branched off `dev`, not `main` — `TournamentMatchHandler.js` only exists on `dev` (the B48/B50
tournament-match-series feature branches haven't merged to `main` yet), matching the documented
`fix/*`-off-`dev` exception (precedent: `fix/tournament-match-board-size`).

Wrote 21 new Jest unit tests in `server/tests/TournamentMatchHandler.test.js` covering: draw
offer/accept/decline happy path + every rejection (non-participant, already-pending, self-accept,
self-decline, no-offer-to-accept/decline); bonus-time auto-grant within quota, the free→pending
transition, self-accept/self-decline rejection, no-pending-request rejection, and the
per-game-not-per-series quota reset across a resign→new-game transition.

Also verified live in a real browser (not just Jest) per the "Feature completion checklist" rule,
since this touches both `server/` and `client/`: a throwaway `socket.io-client` script drove two
guest accounts through create→register→start→negotiate-time→check-in to get a real pairing to
`InProgress`, then two Playwright browser contexts (real tokens injected into `localStorage`) loaded
the actual `tournament-match.html` and clicked the real buttons. Confirmed: both new buttons render;
offering a draw shows the correct "waiting" state for the offerer and offer+accept/decline for the
opponent; accepting ends the match with a "Ván đấu hoà" result overlay; 3 free time requests
auto-grant `+30s` each with no opponent involvement; the 4th correctly requires the opponent's
accept, after which the bonus is still applied to the requester's clock. Zero console/page errors in
either browser context across both flows. `server/db/gomoku.db` was moved aside before starting the
throwaway verification server (run on port 3901, not 3000, to avoid touching the user's own
already-running dev server on 3000) and restored afterward — checksum-verified identical
(`ae5c75df861d0bd0d3d9e2b645ad45e2`) before and after.

## Summary output

`npm test`: 827/827 passing (806 baseline + 21 new). Manual/live-browser verification: draw
offer/accept/decline and bonus-time auto-grant/opponent-approval both work end-to-end in a real
tournament match with zero console errors.
