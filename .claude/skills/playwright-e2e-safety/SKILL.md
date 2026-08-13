---
name: playwright-e2e-safety
description: "Safety rules for running Playwright/e2e tests against gomoku-vn's server: never touch the real user database, never speculatively (re)install browser binaries, and how to actually get an authenticated session in a script. Load before running 'npx playwright test', 'npm run test:e2e', starting server/index.js yourself for verification, or writing any Playwright script that needs a logged-in page."
compatibility: claude-code-only
---

# Playwright / e2e safety

## Never run against the real user database

`server/db/database.js`'s `DB_PATH` is hardcoded to `server/db/gomoku.db` — no env override. Simply
running `node server/index.js` for Playwright's `baseURL` reads/writes the same db a real deployment
or the user's own dev session uses. Guest games completing (resign, draw, timeout, five-in-a-row)
persist rows via `database.saveGame()`.

Whenever you start `server/index.js` yourself for a Playwright run (not `npm test`/Jest, which never
touches this file, and not a server the user is already running — never restart or interfere with
that):

1. Before starting the server, move the real db aside: `mv server/db/gomoku.db
   server/db/gomoku.db.pre-e2e` (and its `-wal`/`-shm` sidecars, if present). Starting the server
   after that creates a fresh, empty db from `schema.sql` at the same path — that's what the test
   run actually writes to.
2. Run the tests against that fresh db.
3. After the run (pass or fail): stop the server, delete the throwaway db (+ sidecars), move the
   real db back. Never leave the throwaway in place or merge/copy test rows into the restored db.
4. Verify the restore worked (row counts or a checksum diff) — don't just assume the `mv` succeeded.
5. Kill every server process you started for this, including leftovers from earlier failed attempts.

## Never run `npx playwright install` speculatively

Browser binaries live at `~/.local/share/ms-playwright/` via `PLAYWRIGHT_BROWSERS_PATH` (set in
`~/.bashrc` and `/etc/environment`). `/etc/environment` only reaches shells whose session started
*after* it was set — a persistent tool/harness shell opened earlier keeps whatever it started with
and will NOT have picked it up. Don't assume propagation; check every time:

```
echo $PLAYWRIGHT_BROWSERS_PATH
```

- **Check before installing, never install as a "just in case" step**: `ls
  ~/.local/share/ms-playwright/` (or `npx playwright install --dry-run chromium`) to confirm the
  needed revision is already present. Running `install` in a shell where the env var hasn't
  propagated makes Playwright silently fall back to its default `~/.cache/ms-playwright/` and
  download a full second copy (~656MB) — this has happened before and had to be cleaned up
  manually. If `~/.cache/ms-playwright/` ever reappears, that's the signal it happened again.
- **If the var is empty in the shell you're about to use, don't install and don't ask the user to
  reboot** — just prefix the one command that needs it:
  `PLAYWRIGHT_BROWSERS_PATH=/home/ngmint/.local/share/ms-playwright node your-script.js`. This is a
  one-command workaround, not a persistent fix — check again in any *different* session.

## Authenticated pages need the real login UI flow, not just an API cookie

`client/js/session.js`'s `requireAuth()` doesn't trust the cookie alone (it's HttpOnly, unreadable
client-side) — it checks a `gvn_user` flag in `localStorage`, set only by `client/js/login.js`'s
`onAuthSuccess()` after a real login/guest click. A raw `context.request.post('/api/auth/guest')`
call gets a valid cookie but leaves `localStorage.gvn_user` unset, so every `requireAuth()`-gated
page redirects straight to `login.html` even though the cookie is valid.

Drive the actual UI instead: `page.goto('/login.html')` → `page.click('#btn-guest')` (or fill+submit
the real form) → wait for redirect away from login → then navigate to the page under test. Same
amount of code as the raw-API shortcut once you factor in the `localStorage` gap, and it's the more
faithful test regardless.

**Seeding data beyond what the UI can practically create** (e.g. 20+ rows to prove pagination): use
a small `socket.io-client` script (not the browser) once to drive the real create/register/start
flow and get real, FK-valid ids, then bulk-insert only the remaining leaf-table rows directly via
`sqlite3`/`python3 sqlite3` using those ids. Fabricating the whole parent/child graph by hand to
satisfy FKs is much more work and easy to get subtly wrong against hydration logic
(`TournamentManager._hydrateTournament()` etc.) — let the server generate the parent rows.
