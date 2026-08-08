# Fix log entry — 2026-08-08 19:04

## Prompt

TODO.md #76 (user report, 2026-08-08): "Tournament -> Pair -> Sẵn sàng -> Vào
trận. Tôi thấy logic ở đây chưa tốt. Cải thiện: Khi 2 bên nhấn Sẵn sàng ->
Tự động vào trận. Hiện tại: Nhấn sẵn sàng -> nhấn vào trận, người vào trận
trước, người kia chưa vào nhưng đã đếm thời gian -> sai time. Vì vậy: Sẵn
sàng -> Vào trận." User then explicitly asked to implement it now ("Do #76").

## Action

Confirmed root cause via `codegraph_explore` before writing any code: the
match clock starts **server-side** the instant both players check in ready
(`TournamentManager.markPairingReady()` → `result.timer.start()`,
`server/managers/tournament/TournamentManager.js:505`), but the client
(`client/js/tournament-detail.js`) only showed a manual "Vào trận" button on
`InProgress` and waited for a click (`handlePairingAction` case `'enter'` →
`goToMatch()`). The click delay between the two players ate unevenly into
whoever clicked later.

Implemented exactly as scoped in `docs/instruction/B76-*.md`:

1. Added `isMinePairing(pairing)` helper (factored out of the inline
   check already in `renderPairingCard`) in
   [client/js/tournament-detail.js](client/js/tournament-detail.js).
2. Added `checkAutoEnterMatch()`: scans `pairingsById` for any pairing where
   `state === 'InProgress' && isMinePairing(pairing)` and calls
   `goToMatch(pairingId)` immediately — guarded by a single
   `navigatingToMatch` flag so it never fires twice (moot anyway since
   `goToMatch` unloads the page via `location.href`).
3. Wired `checkAutoEnterMatch()` into both the `tournament:detail` handler
   (covers a page load/F5 landing mid-`InProgress`, per the instruction
   file's explicit call-out that this case should ALSO auto-enter, not just
   the live-update path) and the `tournament:pairings_patch` handler (covers
   the live both-ready transition).
4. Left the spectator "Xem trận" (`btn_watch_match`) path untouched —
   `isMinePairing` is false for a spectator, so `checkAutoEnterMatch` never
   fires for them; they still click through manually as before.
5. Bumped the shared cache-bust version `?v=87 → ?v=88` across every
   `client/*.html` and every `?v=` import in `client/js/*.js`, verified with
   `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a
   single `?v=88` value.

## Decision

Implemented only what `docs/todo/B76-*.md` / `docs/instruction/B76-*.md`
specified — did not touch `TimerManager`'s clock accounting or add any
network-latency compensation (explicitly out of scope in the instruction
file). Branched off `dev`, not `main`, per `CLAUDE.md`'s exception rule:
`TODO.md #76` does not exist on `main` (`git show main:TODO.md | grep '#76'`
→ empty), and the affected file (`tournament-detail.js`) is itself
`dev`-only feature code from the still-unmerged tournament feature line.

No Jest unit test added — this is a pure client-side `client/js/` change,
which `CLAUDE.md` notes has no test infrastructure runnable via `npm test`.
Verified instead with a real running server and Playwright (Chromium),
following the DB-safety protocol (real `server/db/gomoku.db` moved aside,
fresh throwaway db created by starting the server on an alternate port,
restored — checksum/row-count-verified identical afterward).

One environment wrinkle surfaced during verification and is noted here for
future reference, not filed as a new TODO item: the throwaway server refused
the test browser's socket handshake ("bad origin") because `.env`'s
`CORS_ORIGIN=https://play3cr.dpdns.org` applies globally regardless of port,
so `http://localhost:3001` no longer gets the no-`CORS_ORIGIN`-configured
localhost bypass (`server/middleware/auth.js`'s `isAllowedOrigin`). Fixed for
this run by passing `CORS_ORIGIN=http://localhost:3001` as a shell-level env
override (dotenv doesn't overwrite an already-set process.env variable), not
by touching `.env` itself.

## Summary output

`npm test`: 931/931 passing (unchanged — no server code touched).

Playwright verification against a throwaway server on `http://localhost:3001`
(port 3000 was the user's own already-running dev server, left untouched
throughout) with a fresh throwaway `server/db/gomoku.db` (moved aside before
starting; restored after — row counts `3 users / 31 games / 23 tournaments`
identical before and after):

- Two guest sessions set up a `round_robin` tournament (create, register both,
  start, report+confirm a time) via a plain `socket.io-client` connection —
  deliberately NOT through the browser, since a second socket for the same
  user inside a browser tab that also runs `index.html`'s own lobby
  `SocketClient` triggers the (unrelated, existing) single-session-per-user
  eviction kick and would make the test flaky for reasons unrelated to #76.
- Two real browser contexts (session cookie + `gvn_user` seeded, matching
  how a real signed-in tab looks) loaded `tournament.html?id=...` for both
  players.
- Player A clicked "Sẵn sàng" alone: page stayed on `tournament.html` for
  1.5s (no premature navigation with only one side ready).
- Player B then clicked "Sẵn sàng": **both** pages auto-navigated to
  `tournament-match.html?...&pairingId=<the pairing>` within 10s, with zero
  clicks on any "Vào trận"/"enter" button — confirms the fix.
- Zero console errors, zero page errors, zero HTTP 4xx/5xx observed on
  either page throughout.
