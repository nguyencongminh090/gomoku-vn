'use strict';

/**
 * accessLog.js — opt-in one-line-per-request HTTP access log.
 *
 * Off by default. Enable with `LOG_HTTP=true` (or `1`) in the environment.
 * Emitted through the shared logger, so `LOG_FORMAT` controls the shape
 * (logfmt in production, pretty in a dev terminal). Includes the
 * Cloudflare-resolved client IP + geo label so request traffic can be
 * traced back to a source without correlating against socket logs.
 */

const logger = require('../utils/logger');
const { clientInfoFromReq } = require('../utils/geo');

function httpEnabled() {
  const v = String(process.env.LOG_HTTP || '').toLowerCase();
  return v === 'true' || v === '1';
}

function accessLog(req, res, next) {
  if (!httpEnabled()) return next();

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    const { ip, geo } = clientInfoFromReq(req);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('[HTTP]', {
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      dur_ms: durMs.toFixed(1),
      ip,
      geo,
      ua: req.headers['user-agent'] || '-',
    });
  });

  next();
}

module.exports = { accessLog };
