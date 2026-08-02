# Play3CR (gomoku-vn)

Real-time multiplayer Gomoku platform with two custom mechanics — **WALL** and **PORTAL** — built on Express, Socket.IO, and a Vite-bundled vanilla-JS client.

## Features

- Real-time multiplayer Gomoku over WebSockets (Socket.IO), with spectators/guests supported per room
- **WALL** mechanic — obstacle cells placed on the board under configurable distance rules
- **PORTAL** mechanic — paired teleport cells that alter piece placement
- Configurable board sizes (15/17/19/20) and timer modes (per-move timers with "Xin Time" bonus requests)
- JWT-authenticated sessions, room quotas per IP, idle-room reclamation, and graceful shutdown handling
- In-room chat and move history/tree view on the client

## Tech Stack

**Server:** Node.js, Express, Socket.IO, better-sqlite3, JWT (jsonwebtoken), bcrypt, helmet, express-rate-limit
**Client:** Vanilla JavaScript (ES modules), built/served via Vite
**Testing:** Jest (unit/server), Playwright (end-to-end)

## Prerequisites

- Node.js >= 18.0.0

## Installation

```bash
git clone <repo-url>
cd gomoku-vn
npm install
```

Configure environment variables as needed (all optional, sensible defaults are used otherwise):

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `JWT_SECRET` | Secret used to sign auth tokens (**required in production**) | dev-only fallback |
| `CORS_ORIGIN` | Allowed Socket.IO CORS origin | `*` in dev, disabled in production |
| `MAX_ROOMS` | Max concurrent rooms | `10` |
| `MAX_ROOMS_PER_IP` | Max rooms a single IP can create | `3` |
| `MAX_USERS_PER_ROOM` | Max occupants per room | `20` |
| `EMPTY_ROOM_GRACE_MS` | Grace period before an empty room is destroyed | `20000` |
| `LISTEN_BACKLOG` | TCP listen backlog | `4096` |

Set these in a `.env` file at the project root — it's loaded automatically on startup (real environment variables always take precedence).

## Development

Run the server and client dev servers:

```bash
npm run dev          # server with --watch (auto-restart on file changes)
npm run client:dev   # Vite dev server for the client
```

Or run the server without `--watch`:

```bash
npm run dev:stable
```

Build the client for production:

```bash
npm run build
```

Run the production server (serves `client/` in dev, `dist/` when `NODE_ENV=production`):

```bash
npm start
```

## Testing

Unit tests (Jest, server-side):

```bash
npm test
npm run test:watch
```

End-to-end tests (Playwright):

```bash
npm run test:e2e
npm run test:e2e:headed   # run with a visible browser
npm run test:e2e:ui       # interactive UI mode
npm run test:e2e:report   # view the last HTML report
```

## Project Structure

```
client/               Vite-built vanilla-JS frontend
  index.html           Lobby
  room.html            Game room
  login.html           Auth
  history.html         Match history
  js/                   ES modules (board, room-socket, game-ui, chat-ui, i18n, ...)
  css/, assets/

server/                Express + Socket.IO backend
  index.js              App entry point (HTTP server, middleware, socket wiring)
  config.js              Centralized configuration/env vars
  routes/                REST endpoints (/api/auth, /api/games)
  socket/                Socket.IO connection handling and event handlers
  managers/               Core game logic (GameEngine, RoomManager, TimerManager, ChatHandler)
  middleware/             Auth and error-handling middleware
  db/                     SQLite database, migrations, backups
  scripts/                Admin/maintenance CLI scripts
  tests/                  Jest unit tests

e2e/                    Playwright end-to-end tests
docs/                   Project documentation (including fix-log.md)
scripts/                Utility scripts (e.g. capacity-test load harness)
```

## License

No license file is currently present in this repository.
