# Play3CR (gomoku-vn)

Play3CR is a real-time multiplayer Gomoku platform built on Express, Socket.IO, and a Vite-bundled vanilla-JS client. Two custom mechanics set it apart from standard Gomoku: WALL, which drops obstacle cells onto the board, and PORTAL, which teleports pieces between paired cells.

## Features

Matches run over WebSockets via Socket.IO, and each room supports both players and guest spectators. WALL places three obstacle cells under configurable distance rules; PORTAL adds two teleport pairs that change how pieces land. Board size (15, 17, 19, or 20) and timer mode are configurable per room, and players can request extra time with a limited number of free "Xin Time" bonuses before needing the opponent's permission. Sessions are JWT-authenticated, room creation is rate-limited per IP, idle rooms get reclaimed automatically, and the server shuts down gracefully without dropping active connections. On the client, players get in-room chat and a move history tree for reviewing past games.

## Tech stack

**Server:** Node.js, Express, Socket.IO, better-sqlite3, JWT (jsonwebtoken), bcrypt, helmet, express-rate-limit
**Client:** Vanilla JavaScript (ES modules), built and served via Vite
**Testing:** Jest for unit tests, Playwright for end-to-end tests

## Prerequisites

- Node.js 18.0.0 or later

## Installation

```bash
git clone <repo-url>
cd gomoku-vn
npm install
```

All environment variables below are optional and fall back to sensible defaults, so this step can be skipped for local development.

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `JWT_SECRET` | Secret used to sign auth tokens (required in production) | dev-only fallback |
| `CORS_ORIGIN` | Allowed Socket.IO CORS origin | `*` in dev, disabled in production |
| `MAX_ROOMS` | Max concurrent rooms | `50` |
| `MAX_ROOMS_PER_IP` | Max rooms a single IP can create | `3` |
| `MAX_USERS_PER_ROOM` | Max occupants per room | `40` |
| `EMPTY_ROOM_GRACE_MS` | Grace period before an empty room is destroyed | `20000` |
| `LISTEN_BACKLOG` | TCP listen backlog | `4096` |

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

Unit tests run on the server with Jest:

```bash
npm test
npm run test:watch
```

End-to-end tests run with Playwright:

```bash
npm run test:e2e
npm run test:e2e:headed   # run with a visible browser
npm run test:e2e:ui       # interactive UI mode
npm run test:e2e:report   # view the last HTML report
```

## Project structure

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

## Contributing

Contributions are welcome, whether that's a bug fix, a new feature, or a documentation improvement. To get started:

1. Fork the repository and create a branch off `main` for your change.
2. Run `npm install` and confirm `npm test` passes before you start.
3. Make your change, add or update tests for it, and keep `npm test` green.
4. Open a pull request describing what changed and why.

If you're planning something larger than a small fix, open an issue first so the approach can be discussed before you invest the time.

## Roadmap

Planned for a future release:

- **Tournament mode**: bracket-style competitions with multiple players, seeding, and match progression, building on the existing room and matchmaking system.

## License

No license file is currently present in this repository.
