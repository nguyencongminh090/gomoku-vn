# Fix log entry — 2026-08-07 07:28

## Prompt (mid-turn follow-up)

While the above was in progress, user sent two more observations: (1) "Fix Button Style. Why there
are some button with different style? Low UI" and (2) "Tournament room can keep: Resign, Draw, TIme
Request as Tables." Addressed (1) directly (small, same-page CSS-class fix, see Action below).
Recorded (2) as TODO.md #57 instead of implementing — it reopens `tournament-match.js`'s documented
Phase 4 scope decision to not implement draw offers/bonus-time requests, needs new
`TournamentMatchHandler.js` socket events and a real design decision (does a time-request limit reset
per series game or per whole pairing?), so it's real backend work, not a quick UI addition — matches
`CLAUDE.md`'s "stack, don't perform directly" rule for a new requirement raised without an explicit
"do this now".

## Prompt

Follow-up on TODO.md #52 (already fixed once this session with a targeted `.match-shell` CSS patch
— see `docs/fix-log/2026-08-07-todo-52-tournament-match-layout-dead-space.md`). User's explicit
direction: "I think... #52: Make as Room for user get used to is better" — i.e. don't keep
`tournament-match.html`'s own parallel layout implementation at all; fully reuse `room.html`'s
proven layout/DOM so the match screen feels like the same app the user already knows. When asked
whether to bundle #55 (click-mode setting not applied inside tournament match) and #56 (mobile
tab-content collapse, filed as a by-product of the first #52 fix) into this same refactor, user
confirmed yes, and added a concrete requirement: "connect Score count -> Result and number of
game/race-to-margin count... Room.html has score count, you can use it and write / connect backend."

## Action

Replaced `tournament-match.html`'s bespoke `.match-shell`/`.match-board-wrap`/`.ui-shell`/`.ui-core`
structure with a direct reuse of `room.html`'s DOM skeleton and CSS classes (`room.css`, no changes
needed there — it already handles the desktop/tablet/mobile breakpoints correctly):

- `<main class="room">` (was `.match-shell`) — the header strip above it (back-link, `.detail-header`,
  swap2 banner slot) moved into a new small `.match-page-header` wrapper (`tournament.css`) that just
  matches `.room`'s `max-width:1400px`/padding, replacing the old `.lobby-layout`/`.lobby` wrapper
  entirely (which is what the previous #52 fix's `.lobby-layout--single` modifier was patching around
  — no longer needed, removed).
- `.board-area-shell`/`.board-area` (unchanged ids/classes, already shared with room.css) — kept the
  match-specific `.match-clocks` bar and `.match-actions` (resign button) as its only two
  match-specific children.
- `.panel-right-shell`/`.panel-right` (was `.ui-shell`/`.ui-core`) containing:
  - `.panel-players` with two static `.slot-card`s (no sit/stand — the pairing already fixed who's
    playing) showing each player's name + color dot.
  - **`.score-panel`/`.score-table`, reused as-is from room.html** per the user's explicit note —
    connected to `TournamentMatchHandler.js`'s existing `_seriesInfo()` payload
    (`tmatch:init`/`tmatch:ended`'s `series.scores`/`seriesMode`/`seriesGameCount`/
    `seriesTargetScore`/`seriesMargin`, already implemented for TODO.md #50, just never rendered as a
    table before — only as an inline text line). Shows the series game count/race-to-margin target in
    the panel title, and each player's running score in the table body (2 columns: Tên/Điểm, not
    room.html's Win/Loss/Draw, since a series tracks one numeric "games won" score, not rematch
    outcomes). Falls back to showing both players at 0 from the moment the match starts (game 1, before
    `pairing.seriesScore` exists server-side) rather than staying hidden, so a series is visibly a
    series from the first move.
  - `.sidebar-tabs`/`.tab-content` (Nước đi/Trò chuyện/Khán giả) — unchanged content/behavior, just
    now a direct child of `.panel-right` like room.html's tabs, instead of the old bounded
    `.ui-shell`/`.ui-core` box.

[client/js/tournament-match.js](client/js/tournament-match.js): `renderHeader()` now populates
`#slot-1-name`/`#slot-2-name` and calls a new `renderScorePanel()`; `tmatch:ended` also calls it so
the score table updates immediately mid-series, not just on the next game's `tmatch:init`.

**TODO.md #55 (click-mode not synced):** `initBoard()` now passes
`clickMode: window.getClickMode()` when constructing `BoardRenderer` (was omitted entirely, silently
defaulting to `board.js`'s hardcoded `'double'`), and a new `window.addEventListener('clickmodechange', ...)`
live-syncs an already-open match, mirroring `room-ui.js:560`'s pattern exactly. Exported
`getClickMode` from [client/js/settings-panel.js](client/js/settings-panel.js) (`global.getClickMode = getClickMode`)
per instruction.md's explicit ask to reuse it instead of duplicating the `'gomoku_click_mode'`
localStorage key a 3rd time (room.js already duplicates it once).

**TODO.md #56 item 1 (mobile tab-content collapse):** resolved as a side effect of the room.css reuse
— no longer a hardcoded `max-height:480px` on an undersized flex container; `.panel-right`'s own
mobile rules (already correct, already used by room.html) apply directly. Item 2 (`tournament.html`
suspected same `.lobby-layout` issue) is unrelated to this refactor (different page) and stays open.

**Real-browser verification (Playwright/Chromium)**, backed by a live tournament match created via a
throwaway `socket.io-client` script (`tournament:create` with `ruleSet.seriesMode:'fixedCount'`,
`seriesGameCount:3`, `timerSeconds:1200` → 2 guests register → start → report/confirm time → both
ready → `InProgress`), db backed up/restored per `CLAUDE.md`'s Playwright rule:

- Desktop (1440px)/tablet (800px): confirmed against screenshots — player cards, VS badge, and score
  panel ("BẢNG ĐIỂM — ĐẤU 3 VÁN", PaleWren 0 / KindElk 0) render exactly like room.html's own
  panel-right, board canvas 774px (desktop)/400px (tablet), no dead space.
  find the same layout guarantees room.html already has instead of drifting from them again.
- Mobile (390px): found and fixed a regression introduced mid-refactor — `.match-clocks`/`.match-actions`
  inherited `.board-area-shell`'s intentional edge-to-edge mobile bleed (`width:calc(100% + 32px);
  margin-left:-16px`, meant only for the board canvas) and overflowed past the visible viewport,
  clipping the second clock's time (`20:00` cut off) under the global `body{overflow-x:hidden}`.
  Fixed with a scoped `@media (max-width:768px)` override (`align-self:flex-start; width:calc(100% -
  32px); margin-left:16px`) canceling just the bleed for these two header-like children — verified via
  `getBoundingClientRect()` (clocks now exactly `x:0, right:390` at a 390px viewport) and a follow-up
  screenshot. `.panel-right` measured 242px tall with real content after the fix (was 76px/empty).
- `window.getClickMode()` confirmed callable and returning the localStorage-backed value after the
  settings-panel.js export.

**Button style consistency (user's mid-turn item 1):** the resign button used `.btn.btn-cancel`
(a modal-dialog button class from `lobby.css`), which visually didn't match `room.html`'s actual
in-game action buttons (`.btn-game.btn-game--resign`, pill-shaped, red outline, defined in
`game.css`). Root cause: `tournament-match.html` never linked `game.css` at all — added the missing
`<link>` (matching `room.html`'s link order) and switched the button/container to
`.game-controls`/`.btn-game.btn-game--resign`, dropping the now-redundant `.match-actions{display:
flex;...}` layout rule in favor of `.game-controls`'s own (game.css). Verified via computed style
(`border-radius:100px`, red outline colors matching `.btn-game--resign` exactly) — this also fixed a
latent bug where `.board-canvas-wrap` (also game.css-only) was never actually styled on this page
either, just silently working because `board.js`'s `resize()` sizes the canvas from JS regardless of
CSS.

Bumped cache-bust `?v=68 → ?v=69` (added `i18n.js`/`settings-panel.js` string/export changes on top of
the html/css/js already touched) — verified via
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing exactly one value.

## Decision

**Superseded, not layered on top of, the earlier same-day #52 fix** (`.lobby-layout--single` +
`.match-shell { align-items: stretch }`) — that fix correctly diagnosed and solved the two root
causes of the dead space, but the user's follow-up made clear they wanted the *structural*
duplication itself gone (a second, hand-maintained layout implementation that would only re-diverge
from room.html's over time), not just this one instance of drift patched. Removed the now-dead
`.lobby-layout--single`/`.match-shell`/`.match-board-wrap`/`.ui-core` CSS entirely rather than leaving
it as unused dead code.

**Bundled #55 and #56 item 1 into this same branch/commit**, per explicit user confirmation when
asked — matches `docs/instruction/B52-*.md`'s own note that a full refactor should fold in #54
(already done separately)/#55 since they share the same root cause (`tournament-match.js`/
`tournament-match.html` not reusing room.html's structure deeply enough). #56 item 2
(`tournament.html`'s own suspected `.lobby-layout` issue) was NOT bundled — different page, not
reused/touched by this refactor, stays a separate open item.

**Kept `TournamentMatchHandler.js` as the sole session owner** — no change to server routing;
per instruction.md's explicit boundary ("không đề xuất định tuyến trận đấu giải đấu qua room
session thật"), this refactor only reused room.html's HTML/CSS/class structure and the already-existing
`series` payload fields, same pattern B50 step 7 already used for the Chat/Spectators tabs.

**Score panel shows Tên/Điểm (2 columns), not room.html's Tên/Thắng/Bại/Hòa (4 columns)** — a
tournament series tracks one running numeric score per player (`pairing.seriesScore`), not
rematch win/loss/draw counts; reusing the 4-column shape would have needed fabricating loss/draw
counts that don't exist in the data model.

**Did not touch `client/js/board.js`'s `resize()`/click handling logic** (existing instruction.md
boundary from #49, still applies) — only the constructor's `clickMode` option and the already-public
`.clickMode` property assignment (same as `room-ui.js` does).

No new Jest unit tests — this is CSS/layout/DOM-structure + a client-only settings-read fix, no
server code touched; consistent with the same reasoning in both prior #52-related fix-log entries
today (real-browser verification is the correct check for layout, not a unit test).

## Summary output

`npm test`: 809/809 passing (unchanged — no server-side code touched).

Playwright verification against a live 3-game series match:
- Desktop/tablet: player cards + score panel render identically to room.html's panel-right pattern;
  score panel title correctly reads "BẢNG ĐIỂM — ĐẤU 3 VÁN" (fixedCount) and would read
  "...ĐẤU TỚI N ĐIỂM" for raceToMargin (verified via the i18n string, not a second live match — see
  below).
- Mobile: `.panel-right` content height 242px (was 76px/empty pre-refactor) confirming TODO.md #56
  item 1 resolved; `.match-clocks` overflow regression found and fixed within the same verification
  pass (`getBoundingClientRect()` before: `x:8, right:398` clipped past `clientWidth:390` → after:
  `x:0, right:390`, flush).
- `window.getClickMode()` returns the localStorage value correctly after the settings-panel.js
  export change.

Not separately verified live: the `raceToMargin` series-mode title string and an actual completed
game updating the score table's numbers (both follow directly from already-tested code paths —
`_seriesInfo()`'s `raceToMargin` branch was already covered before this change, and
`renderScorePanel()`'s data mapping is a straight passthrough of `seriesInfo.scores`, same shape
in both series modes).
