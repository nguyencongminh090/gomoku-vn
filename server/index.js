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
const logger         = require('./utils/logger');
const authRouter     = require('./routes/auth');
const gamesRouter    = require('./routes/games');
const { verifySocketToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const socketHandler  = require('./socket/SocketHandler');
const { db }         = require('./db/database');

// ---------------------------------------------------------------------------
// Express
// ---------------------------------------------------------------------------
const app = express();

// Security headers. CSP is left off for now — the client ships inline
// <script>/style="" (theme/mode-init IIFEs, run before first paint) that
// helmet's default CSP would block; see docs/fix-log.md for the verification.
app.use(helmet({ contentSecurityPolicy: false }));

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

// Wire up event handlers
socketHandler.init(io);

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
  io.emit('server:shutdown', { message: 'Server đang khởi động lại. Vui lòng chờ.' });
  
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
