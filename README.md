# Play3CR (gomoku-vn)

Play3CR is a real-time multiplayer Gomoku (Caro) platform built on Express, Socket.IO, and a Vite-bundled vanilla-JS client. Beyond standard Gomoku it adds two custom mechanics — **WALL** (obstacle cells) and **PORTAL** (teleporting pairs) — plus a full **tournament system** (Swiss, round-robin, and double-elimination) for running organized competitions on top of the same room infrastructure.

## Features

**Real-time play.** Matches run over WebSockets via Socket.IO. Each room supports two players plus guest spectators (up to `MAX_USERS_PER_ROOM`), with in-room chat (bilingual VI/EN profanity filtering) and a move-history tree for reviewing past games. Board size (15, 17, 19, or 20) and timer mode are configurable per room; players can request extra time with a limited number of free "Xin Time" bonuses before needing the opponent's permission.

**Custom mechanics.** WALL places three obstacle cells on the board under configurable edge-distance and spacing rules; PORTAL adds two teleport pairs that change how pieces land — both are seeded per-room with retry limits to guarantee a fair, valid layout.

**Tournaments.** Organizers can run Swiss, round-robin, or double-elimination brackets, with automatic pairing generation, Buchholz–Sonneborn–Berger tiebreaks, per-pairing scheduling deadlines, multi-game match series, live-match tracking, and a full standings/results view — all built on the same room/socket infrastructure as casual play.

**Operational resilience.** Idle rooms are reclaimed automatically, room creation is rate-limited per IP (with a separate cap for rooms still in their empty-room grace window to close a repeated-create-and-abandon loophole), and the server shuts down gracefully — notifying connected clients and closing sockets cleanly — without dropping active games mid-restart.

## Security

Security has been treated as an ongoing hardening effort (see `docs/fix-log.md` for the full history), not a one-time pass. Current posture:

- **Session-based auth, not tokens in `localStorage`.** Identity is backed by server-side session rows (`sessions` table), referenced by an **HttpOnly, `SameSite=Lax`** cookie — JavaScript cannot read the credential, and the cookie is not sent cross-site. `Secure` is set automatically whenever the request actually arrived over HTTPS. The project migrated off client-readable JWTs for this exact reason; a short legacy-JWT verification path remains only for in-flight session upgrades during the transition and does not read `localStorage` on the server.
- **Password hashing** via bcrypt at 12 rounds; no plaintext or reversibly-encrypted passwords are ever stored.
- **Content-Security-Policy** enforced through Helmet (`server/config/csp.js`, unit-tested independently of the running server): `script-src 'self'` with no inline scripts and no third-party script origins, `object-src 'none'`, `frame-ancestors 'self'`.
- **CSWSH protection**: every Socket.IO handshake's `Origin` header is checked against an explicit allow-list (`CORS_ORIGIN`, or `localhost`/`127.0.0.1` in dev) before a connection is accepted.
- **Abuse-resistant rate limiting** at multiple layers: `express-rate-limit` on auth endpoints, a per-IP cap on concurrent room creation, and a per-socket event-flood guard that force-disconnects clients exceeding a sustained events/second threshold.
- **Correct proxy trust.** `trust proxy` is scoped to `'loopback'` (matching the project's Cloudflare Tunnel deployment) rather than blanket-trusting `X-Forwarded-For` — a client that could reach the port directly cannot spoof its IP to dodge rate limits or room quotas.
- **Client-side chat is escaped on the wire and only decoded at the render site** (`textContent`, never `innerHTML`) — the project's one historical XSS finding was fixed here after multiple earlier attempts patched the wrong layer; see `docs/fix-log.md` for the full trace.
- **Expired sessions are actively swept** (hourly, plus once at startup) rather than left to passively expire, since a revoked/expired session row does not clean itself up the way a self-expiring JWT would.
- Dependencies are checked with `npm audit`; known transitive findings are tracked and triaged rather than silently ignored (see `docs/fix-log.md`).

Security reports and hardening proposals are welcome — see [Contributing](#contributing) below.

## Tech stack

**Server:** Node.js, Express, Socket.IO, better-sqlite3, bcrypt, Helmet (CSP), express-rate-limit, jsonwebtoken (legacy session-upgrade path only)
**Client:** Vanilla JavaScript (ES modules), built and served via Vite; lightweight VI/EN i18n and a bundled profanity filter, no client framework
**Testing:** Jest for server-side unit tests, Playwright for end-to-end browser tests
**Admin tooling:** An interactive CLI (`server/scripts/admin.js`) for direct database maintenance (user/game/tournament inspection and deletion), with confirmation prompts, automatic backups, and an audit log for every destructive action

## Prerequisites

- Node.js 18.0.0 or later

## Installation

```bash
git clone https://github.com/nguyencongminh090/gomoku-vn.git
cd gomoku-vn
npm install
```

All environment variables below are optional and fall back to sensible defaults for local development.

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `JWT_SECRET` | Secret for the legacy session-upgrade path (must be set outside `NODE_ENV=test`) | none — startup fails without it |
| `CORS_ORIGIN` | Allowed Socket.IO/session-cookie origin(s), comma-separated | `*` in dev, `localhost`/`127.0.0.1` only otherwise — **must be set to your real origin(s) in any non-localhost deployment**, or every socket handshake is silently rejected |
| `MAX_ROOMS` | Max concurrent rooms | `50` |
| `MAX_ROOMS_PER_IP` | Max rooms a single IP can create | `3` |
| `MAX_GRACE_ROOMS_PER_IP` | Max IP-owned rooms still in their empty-room grace window that still count toward the quota | `3` |
| `MAX_USERS_PER_ROOM` | Max occupants per room | `40` |
| `EMPTY_ROOM_GRACE_MS` | Grace period before an empty room is destroyed | `20000` |
| `LISTEN_BACKLOG` | TCP accept-queue depth | `4096` |

Put these in a `.env` file at the project root. It loads automatically on startup, and any variable already set in the real environment takes precedence over it.

## Development

Run the server and client dev servers side by side:

```bash
npm run dev          # server with --watch (auto-restart on file changes)
npm run client:dev   # Vite dev server for the client
```

To run the server without file watching:

```bash
npm run dev:stable
```

To build the client for production:

```bash
npm run build
```

To start the production server (it serves `client/` in development and `dist/` once `NODE_ENV=production`):

```bash
npm start
```

## Testing

Unit tests run on the server with Jest (40+ test files):

```bash
npm test
npm run test:watch
```

End-to-end tests run with Playwright (20+ spec files):

```bash
npm run test:e2e
npm run test:e2e:headed   # run with a visible browser
npm run test:e2e:ui       # interactive UI mode
npm run test:e2e:report   # view the last HTML report
```

## Project structure

```
client/               Vite-built vanilla-JS frontend
  index.html            Lobby
  room.html              Game room
  login.html              Auth
  history.html            Match history
  tournament.html         Tournament lobby/listing
  tournament-match.html    Live tournament match view
  js/                       ES modules (board, room-socket, game-ui, chat-ui, i18n, tournaments, ...)
  css/, assets/

server/                Express + Socket.IO backend
  index.js              App entry point (HTTP server, middleware, socket wiring)
  config.js              Centralized configuration/env vars
  config/csp.js           Content-Security-Policy directives (unit-tested)
  routes/                REST endpoints (/api/auth, /api/games, tournament games)
  socket/                Socket.IO connection handling and event handlers
  managers/               Core game logic (GameEngine, RoomManager, TimerManager, ChatHandler, SessionManager)
  managers/tournament/     Tournament lifecycle, pairing generation, standings/tiebreaks
  middleware/             Auth and error-handling middleware
  db/                     SQLite database, schema, migrations, backups
  scripts/                Admin CLI and maintenance scripts
  tests/                  Jest unit tests

e2e/                    Playwright end-to-end tests
docs/                   Project documentation, fix-log, and per-item tracking detail files
features/               Pre-implementation feature design discussions (user stories, diagrams)
scripts/                Utility scripts (e.g. capacity-test load harness)
```

## Contributing

Contributions are welcome — bug fixes, new features, documentation improvements, and security findings alike. To get started:

1. Fork the repository and create a branch off `dev` for your change (active development happens on `dev`; `main` is the stable/deployed branch and is merged into periodically).
2. Run `npm install` and confirm `npm test` passes before you start.
3. Make your change, add or update tests for it, and keep `npm test` green.
4. Open a pull request against `dev` describing what changed and why.

If you're planning something larger than a small fix, or have found a bug you're not ready to fix yourself, please **open an issue on the [Issues tab](https://github.com/nguyencongminh090/gomoku-vn/issues)** first — for a proposed change, this lets the approach get discussed before you invest the time; for a bug report, it gives visibility even if you can't submit a fix. Security-relevant findings are just as welcome there as functional bugs.

## License

No license file is currently present in this repository.
