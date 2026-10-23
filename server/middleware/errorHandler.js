'use strict';

/**
 * errorHandler.js — Centralized Express error handling middleware.
 *
 * Usage:
 *   In route handlers, replace inline res.status(500).json(...) with next(err).
 *   Mount this middleware LAST in server/index.js (after all routes).
 *
 * Per @backend-patterns:
 *   All operational errors (validation, not-found, auth) should use AppError.
 *   Unexpected errors are logged and return a generic 500 response.
 */

const logger = require('../utils/logger');

/**
 * Operational error with an HTTP status code.
 * Route handlers throw this (or pass it to next()) for known error conditions.
 */
class AppError extends Error {
  /**
   * @param {number} statusCode — HTTP status code (e.g. 400, 404, 500)
   * @param {string} message    — Vietnamese user-facing error message
   */
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const BODY_PARSER_ERRORS = {
  'entity.too.large':    { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn.' },
  'entity.parse.failed': { status: 400, code: 'BODY_INVALID',      message: 'Dữ liệu gửi lên không hợp lệ.' },
};

/**
 * Express 4-argument error handler.
 * Catches errors passed via next(err) from any route.
 *
 * @type {import('express').ErrorRequestHandler}
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    // Known operational error — return structured response
    return res.status(err.statusCode).json({ error: err.message });
  }

  // body-parser (express.json) failures are the client's fault: carry err.type, not statusCode.
  const bodyErr = BODY_PARSER_ERRORS[err && err.type];
  if (bodyErr) {
    logger.warn(`[Express] ${bodyErr.code} on ${req.method} ${req.path}`);
    return res.status(bodyErr.status).json({ error: bodyErr.message, code: bodyErr.code });
  }

  // Unexpected error — log full stack, return generic message
  logger.error(`[Express] Unhandled error on ${req.method} ${req.path}:`, err);
  return res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.', code: 'SERVER_ERROR' });
}

module.exports = { AppError, errorHandler };
