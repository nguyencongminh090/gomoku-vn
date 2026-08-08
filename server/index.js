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

const express      = require('express');
const helmet       = require('helmet');
const http         = require('http');
const { Server }   = require('socket.io');
const path         = require('path');

const config         = require('./config');
const { cspDirectives } = require('./config/csp');
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

// Parse JSON bodies for REST endpoints
app.use(express.json());

const clientPath = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'client');

// Serve client static files
app.use(express.static(clientPath));

// REST API routes
app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api', tournamentGamesRouter);

// Catch-all: serve login page for unknown routes (SPA-style fallback)
app.get('*', (req, res) => {
  // If not an API request, redirect to login
  if (!req.path.startsWith('/api')) {
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
