'use strict';

/**
 * index.js — GomokuVN Express + Socket.io entry point.
 *
 * Responsibilities:
 *   1. Create Express app + HTTP server
 *   2. Serve static client files from /client
 *   3. Mount REST routes (/api/auth)
 *   4. Initialize Socket.io with auth middleware
 *   5. Wire SocketHandler
 *   6. Start listening
 */

const compression  = require('compression');
const express      = require('express');
const helmet       = require('helmet');
const http         = require('http');
const { Server }   = require('socket.io');
const path         = require('path');

const config         = require('./config');
const { cspDirectives } = require('./config/csp');
const { staticOptions, socketIoClientOptions, REVALIDATE } = require('./config/staticCache');
const logger         = require('./utils/logger');
const authRouter     = require('./routes/auth');
const gamesRouter    = require('./routes/games');
const tournamentGamesRouter = require('./routes/tournamentGames');
const { verifySocketToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const socketHandler  = require('./socket/SocketHandler');
const sessionManager = require('./managers/SessionManager');
const tournamentManager = require('./managers/tournament/TournamentManager');
const { db }         = require('./db/database');

// ---------------------------------------------------------------------------
// Express
// ---------------------------------------------------------------------------
const app = express();

// Trust exactly one hop: a proxy/tunnel (e.g. cloudflared) running on this
// same machine and connecting in over loopback. Without this, Express reads
// req.ip from the raw TCP peer (always loopback behind such a tunnel) and
// express-rate-limit refuses to start its key generator at all once it sees
// an X-Forwarded-For header arrive while trust proxy is unset — see
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. 'loopback' (not `true`) means the
// header is only honored when the immediate connection actually is
// loopback, so a client that could reach this port directly (bypassing the
// tunnel) can't spoof its own X-Forwarded-For to dodge the auth rate limit
// or the per-IP room quota.
app.set('trust proxy', 'loopback');

// Security headers, CSP enforced (TODO.md #65 — was `contentSecurityPolicy:
// false` because the client used to ship inline <script> IIFEs and a
// non-pinned https://unpkg.com script; both are gone now, see
// docs/fix-log.md). Directives live in ./config/csp.js so the policy itself
// is unit-testable (server/tests/csp.test.js) without booting this server.
app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
}));

// Compress text responses (TODO.md #105). Must be mounted BEFORE the static
// handler and the routes below: compression works by wrapping res.write/end,
// so anything that already wrote its response higher up would go out
// uncompressed.
//
// Scope note, so nobody "completes" this later by mistake: Cloudflare already
// applies Brotli at the edge, so end users were never receiving these assets
// uncompressed. What this fixes is the origin→CF hop — which rides the home
// connection's *upload* path through the tunnel, the narrowest link in the
// chain — plus direct-to-origin access (dev, Playwright, manual curl), where
// there is no CF to compress anything. Measured on the lobby page: 327 486 B
// of css/js/html left the origin uncompressed, 79 018 B after gzip (-76%).
//
// Defaults are kept deliberately: level 6 (not 9 — the gzip -9 table in
// TODO.md #105 measures the ceiling of the benefit, it is not a proposed
// setting), and the built-in `compressible` content-type filter, which
// already skips .woff2/.ttf/images — re-compressing compressed bytes burns
// CPU and can grow the payload. socket.io's WebSocket `perMessageDeflate` is
// a separate mechanism and is explicitly out of scope here (it costs CPU per
// move and affects realtime latency — see TODO.md #86/#20).
app.use(compression());

// Parse JSON bodies for REST endpoints
app.use(express.json());

const clientPath = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'client');

// Serve the socket.io browser client ourselves (TODO.md #111).
//
// socket.io ships its own handler for this file, but hardcodes
// `Cache-Control: public, max-age=0` (socket.io/dist/index.js) with no option
// to change it — so after #106 made every other asset immutable, this was the
// only asset still costing an origin round-trip on every page load, on all
// four pages. A 304 is still a full round-trip through the tunnel, which is
// exactly the latency #106 was about.
//
// It has to be served from a path OUTSIDE `/socket.io/`: engine.io claims
// that entire prefix at the HTTP-server level (it intercepts before Express
// is ever reached, and answers 400 for anything it doesn't recognise), so
// neither an Express route nor an express.static mount under `/socket.io/`
// can take effect. Verified empirically — see docs/fix-log for #111.
//
// socket.io's own `serveClient` is left ENABLED on purpose: the old
// `/socket.io/socket.io.min.js` URL keeps working, so any HTML still
// referencing it (a stale dist/ build — see TODO.md #109 — or a cached page)
// degrades to the previous behaviour instead of breaking with no global `io`.
const socketIoClientPath = path.join(
  path.dirname(require.resolve('socket.io/package.json')),
  'client-dist'
);
app.use('/vendor/socket.io', express.static(socketIoClientPath, socketIoClientOptions));

// Serve client static files. Cache policy (assets immutable, HTML always
// revalidated) lives in ./config/staticCache so it is unit-testable without
// booting this server — see TODO.md #106 for why the express.static default
// (`public, max-age=0`) was actively harmful here.
app.use(express.static(clientPath, staticOptions));

// REST API routes
app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api', tournamentGamesRouter);

// Catch-all: serve login page for unknown routes (SPA-style fallback)
app.get('*', (req, res) => {
  // If not an API request, redirect to login
  if (!req.path.startsWith('/api')) {
    // Same policy as express.static gives HTML — this path bypasses its
    // setHeaders hook, so set it explicitly (TODO.md #106).
    res.setHeader('Cache-Control', REVALIDATE);
    res.sendFile(path.join(clientPath, 'login.html'));
    return;
  }
  res.status(404).json({ error: 'Not found' });
});

// Centralized Express error handler — must be mounted AFTER all routes
app.use(errorHandler);

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*'),
    methods: ['GET', 'POST'],
  },
});

// Apply JWT auth middleware to ALL socket connections
io.use(verifySocketToken);

// Rebuild live/historical tournament state from SQLite (TODO.md #77) —
// before socketHandler.init() so every handler sees a warm state from the
// first connection, not an empty one that fills in only as new mutations
// happen.
tournamentManager.loadTournamentsFromDb();

// Wire up event handlers
socketHandler.init(io);

// Expired session rows do not clean themselves up the way an expired JWT did
// (TODO.md #68) — sweep once at startup, then hourly.
sessionManager.sweepExpiredSessions();
setInterval(() => sessionManager.sweepExpiredSessions(), config.SESSION_SWEEP_INTERVAL_MS).unref();

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen({ port: config.HTTP_PORT, backlog: config.LISTEN_BACKLOG }, () => {
  logger.info(`[Server] Play3CR listening on http://localhost:${config.HTTP_PORT}`);
});

// Last-resort safety net: an error that escapes every other try/catch (e.g. a
// bug in a socket handler not covered by SocketHandler.js's per-handler wrap)
// must not silently kill the whole process and drop every connected player.
process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught exception:', err.stack || err.message);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled rejection:', reason instanceof Error ? (reason.stack || reason.message) : reason);
});

const gracefulShutdown = () => {
  logger.info('[Server] Shutdown signal received. Shutting down gracefully.');
  io.emit('server:shutdown', { message: 'Server đang khởi động lại. Vui lòng chờ.', code: 'SERVER_RESTARTING' });
  
  // Force close socket connections so the HTTP server can actually close
  io.disconnectSockets();

  server.close(() => {
    try { db.close(); } catch (err) { logger.error('DB close error', err); }
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { app, server, io };
