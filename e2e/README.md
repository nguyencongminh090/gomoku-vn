# e2e (Playwright) — how to run on localhost

Read the `playwright-e2e-safety` skill first. The server has **no DB path override**
(`server/db/database.js` → `server/db/gomoku.db`), so a run must use a throwaway DB.

## Recipe
1. Port 3000 must be free (`ss -ltn | grep :3000`). Never kill a server you didn't start.
2. Move the real DB aside: `mv server/db/gomoku.db server/db/gomoku.db.pre-e2e` (+ `-wal`/`-shm` if present).
3. Start the server under test with a localhost origin and a roomy auth limiter:
   `CORS_ORIGIN=http://localhost:3000 AUTH_LIMITER_MAX=5000 node server/index.js`
   - `.env` sets `CORS_ORIGIN` to the production domain → without the override every localhost
     socket is rejected (`Socket handshake rejected: bad origin`).
   - Default `AUTH_LIMITER_MAX` is 20 per window; the suite mints far more guests.
   - Do **not** raise `MAX_ROOMS_PER_IP` — `leave-then-create-room.spec.ts` asserts the quota.
4. `npx playwright test --project=chromium` (one worker is the config default; rooms/guests all come from one IP).
   If the installed Chromium revision ≠ the one this Playwright wants, do **not** `playwright install`;
   point at the existing binary: `PW_CHROMIUM_PATH=~/.local/share/ms-playwright/chromium-<rev>/chrome-linux64/chrome`.
5. Stop the server, delete the throwaway DB (+ sidecars), move the real one back, compare its checksum
   with the one taken before step 2.

## Writing specs
- Log in with `e2e/helpers/auth.ts` (`authAsGuest`, `authAsMember`, `seedSession`). Auth is a cookie
  session (#68); the client guard reads `localStorage.gvn_user`. The old `gvn_token` /
  `gvn_display_name` keys are ignored (the server logs `invalid legacy token`).
- Raw `socket.io-client` probes authenticate with the session cookie: pass the guest response's
  `Set-Cookie` as `extraHeaders: { cookie }` (see `security-boundary.spec.ts`).
- Two sessions of the *same* user need two browser contexts (own cookie jars); logging in again
  through the first page's `request` would overwrite its cookie.
- Shell gotcha: `pkill -f "playwright test"` inside a bash command also matches (and kills) that
  shell. Kill by PID.

## Known state (2026-10-09)
Chromium, fresh DB, recipe above: 54-56 of 56 pass (5 runs; #187 room-lifecycle, #188 scaffold needs internet). **Restart the server between suite runs**:
`lobby-patch-incremental-render` leaves a room of disconnected viewers that the server keeps for 10 min
(TODO #186), so a second run against the same server times out in `waitForEmptyLobby()`.
`kick-blocked-interrupted` deliberately leaves an "interrupted" room for 60 s; specs that need the whole quota
call `waitForEmptyLobby()`.
