# Fix log entry — 2026-08-09 09:23

## Prompt

TODO.md #79 (user report, 2026-08-09): "Time sometimes run on wrong sides" —
in tournament matches, the clock panel's name label (`clock-black-name`/
`clock-white-name`) sometimes showed the wrong player next to the wrong
color dot.

## Action

Root cause (confirmed via `codegraph_explore` and filed in
`docs/todo/B79-*.md`/`docs/instruction/B79-*.md` before touching code):
`renderHeader()` in `client/js/tournament-match.js` assigned the two clock
panels by fixed seat position — `gameState.players[0]` → black panel,
`players[1]` → white panel — but which seat actually holds which stone
color is decided dynamically by two independent server-side mechanisms that
don't respect that fixed seat order:

1. **Swap2 opening** (`GameEngine._assignColors`, `server/managers/GameEngine.js:375-378`)
   can leave `players[0].color === 'WHITE'` whenever the second player
   chooses "black" during the Swap2 choice step.
2. **Multi-game series seat rotation** (`startMatch()`,
   `server/socket/handlers/TournamentMatchHandler.js:218-220`) swaps which
   entry sits in seat 0 every game (`gameIndex % 2`), while `TimerManager`
   keeps its black/white time slots pinned to `player1EntryId`/
   `player2EntryId` for the whole series (`PairingLifecycle.markReady`,
   deliberately — see instruction file). From game 2 onward the name label
   (seat-based, now flipped) stopped matching the time value next to it
   (entryId-based, unchanged).

Fix implemented exactly as scoped in `docs/instruction/B79-*.md` — look up
the color-holding player directly instead of trusting seat position:

```js
const black = gameState.players.find(p => p.color === 'BLACK');
const white = gameState.players.find(p => p.color === 'WHITE');
document.getElementById('clock-black-name').textContent = black ? black.displayName : '—';
document.getElementById('clock-white-name').textContent = white ? white.displayName : '—';
```

`matchTitleEl`/`slot1NameEl`/`slot2NameEl` were left untouched — they still
use seat order `p1`/`p2` on purpose, since neither has a color dot next to
it and neither claims to represent "the Black/White player." Checked the
rest of `tournament-match.js` for other `players[0]`/`players[1]` array-
position assumptions (`grep -n "players\[0\]\|players\[1\]"`) — the only
other hit is that same intentional `p1`/`p2` line, so no further fix was
needed.

Bumped the shared cache-bust version `?v=89 → ?v=90` across every
`client/*.html` and every `?v=` import in `client/js/*.js` (already applied
before this verification pass); confirmed with
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a
single `?v=90` value.

## Decision

No server-side change — `TimerManager`/`PairingLifecycle`'s fixed
entryId-based black/white slots and `startMatch()`'s per-game seat rotation
are both deliberate designs per the instruction file's explicit "Đừng làm"
list; only the client's panel-to-player lookup was wrong. No Jest unit test
added — this is a pure `client/js/` DOM-rendering change, which `CLAUDE.md`
notes has no test infrastructure runnable via `npm test`. Verified instead
with a real running server and Playwright (Chromium), per the DB-safety
protocol (real `server/db/gomoku.db` moved aside, fresh throwaway db
created by starting the server on `PORT=3001` with
`CORS_ORIGIN=http://localhost:3001` as a shell env override, restored
afterward — row counts `7 users / 31 games / 3 tournaments` identical
before and after).

Both scenarios named in the instruction file's "Đừng làm" section were
tested independently, not just one:

- **Swap2**: player 2 chose "black" during the Swap2 choice step, leaving
  `players[0].color === 'WHITE'`.
- **Series rotation**: a 2-game `fixedCount` series, verified at game index
  1 (2nd game) where `startMatch()` has rotated the seat order.

Setup for both used a plain `socket.io-client` connection (guest signup via
`POST /api/auth/guest`, then `tournament:create`/`register`/`start`/
`report_time`/`confirm_time`/`ready` and `tmatch:swap2_place`/
`tmatch:swap2_choice`/`tmatch:resign`) rather than driving the create-
tournament UI — faster and deterministic for reaching a specific game state.
The actual bug verification then used two independent real Playwright
browser contexts (session cookie + `gvn_user` seeded) loading
`tournament-match.html` for both players, reading the live DOM.

## Summary output

`npm test`: 948/948 passing (unchanged — no server code touched).

Playwright verification against a throwaway server on `http://localhost:3001`
(port 3000 was the user's own dev server; not stopped by any command this
session ran — see note below) with a fresh throwaway `server/db/gomoku.db`
(moved aside before starting; restored after — row counts `7 users / 31
games / 3 tournaments` identical before and after):

- **Swap2 scenario**: player 2 (`RedBull`) chose "black"; engine ended up
  with `players[0]` (`SoftLark`) = WHITE, `players[1]` (`RedBull`) = BLACK.
  Both browser contexts (Player A's and Player B's) showed
  `#clock-black-name` = "RedBull" and `#clock-white-name` = "SoftLark",
  matching actual color, not seat position. Zero console errors, zero page
  errors, zero HTTP 4xx/5xx on either page.
- **Series rotation scenario**: game 1 (`SageLark`=BLACK, `SoftFly`=WHITE)
  ended by resignation; both players re-readied and game 2 started with
  seats rotated (`SoftFly`=BLACK, `SageLark`=WHITE). Both browser contexts
  showed `#clock-black-name` = "SoftFly" / `#clock-white-name` = "SageLark",
  with the adjacent time values (`4:56`/`5:00`) correctly paired to the same
  panel as the name — confirming the actual regression (name/time panel
  pairing) is fixed. Zero console errors, zero page errors, zero HTTP
  4xx/5xx on either page.

**Environment note, not a new bug**: partway through verification, the
user's own dev server on port 3000 was found to have stopped (no longer
listed in `ss -ltnp`, no matching `node server/index.js` process). This
session never issued a command targeting that process or port — the only
process killed was this session's own throwaway server on port 3001
(confirmed by PID before killing it). `dmesg`/`journalctl` showed no OOM
kill around that time. Cause unconfirmed; flagged to the user rather than
silently restarting a server this session didn't start.
