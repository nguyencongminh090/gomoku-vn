'use strict';

/**
 * logger.js — Enhanced leveled logger utility.
 *
 * Replaces console.log everywhere in the codebase.
 * Levels: debug (optional), info, warn, error.
 *
 * Two output shapes, chosen by LOG_FORMAT (env):
 *   - `pretty`  — human view, ANSI colors: `[INFO ] [HH:MM:SS] message key=val`
 *   - `logfmt`  — one machine-parseable line per record:
 *                 `ts=<ISO> level=info msg="message" key=val ...`
 *   - `auto`    — (default) `pretty` when stdout is a TTY (e.g. `bash start.sh`
 *                 in a terminal), `logfmt` otherwise (piped to a file / log
 *                 shipper / systemd journal).
 * LOG_COLOR=false force-disables ANSI even in pretty mode.
 *
 * Structured fields: pass a plain object as the LAST argument and its
 * key/value pairs are appended as `key=value` (logfmt-quoted). Everything
 * before it is joined with spaces into `msg` (Error args contribute their
 * stack). Example:
 *
 *   logger.info('[Auth] Login', { user: 'bob', ip: '1.2.3.4', geo: 'VN' });
 *   → ts=2026-08-28T10:00:00.000Z level=info msg="[Auth] Login" user=bob ip=1.2.3.4 geo=VN
 */

// ANSI Color Codes
const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

const LEVEL_META = {
  debug: { label: 'DEBUG', color: COLORS.cyan,   method: 'debug' },
  info:  { label: 'INFO ', color: COLORS.green,  method: 'info'  },
  warn:  { label: 'WARN ', color: COLORS.yellow, method: 'warn'  },
  error: { label: 'ERROR', color: COLORS.red,    method: 'error' },
};

function resolveFormat() {
  const raw = String(process.env.LOG_FORMAT || 'auto').toLowerCase();
  if (raw === 'pretty' || raw === 'logfmt') return raw;
  return process.stdout && process.stdout.isTTY ? 'pretty' : 'logfmt';
}

function colorEnabled() {
  if (String(process.env.LOG_COLOR).toLowerCase() === 'false') return false;
  return true;
}

function shortTime() {
  return new Date().toTimeString().slice(0, 8);
}

/** A plain `{}` object — not null, not an array, not an Error, not a Date. */
function isFieldBag(v) {
  return (
    v != null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    !(v instanceof Error) &&
    !(v instanceof Date)
  );
}

/** Split trailing field-bag off the argument list. */
function splitArgs(args) {
  if (args.length && isFieldBag(args[args.length - 1])) {
    return { parts: args.slice(0, -1), fields: args[args.length - 1] };
  }
  return { parts: args, fields: null };
}

/** Render the non-field args into a single message string. */
function buildMessage(parts) {
  return parts
    .map((p) => {
      if (p instanceof Error) return p.stack || p.message;
      if (isFieldBag(p) || Array.isArray(p)) {
        try { return JSON.stringify(p); } catch { return String(p); }
      }
      return String(p);
    })
    .join(' ');
}

/** logfmt-quote a single scalar value. */
function fmtVal(v) {
  if (v == null) return '';
  let s;
  if (typeof v === 'object') {
    try { s = JSON.stringify(v); } catch { s = String(v); }
  } else {
    s = String(v);
  }
  if (s === '') return '""';
  if (/[\s"=]/.test(s)) return '"' + s.replace(/(["\\])/g, '\\$1') + '"';
  return s;
}

/** Render a field bag to ` k=v k2=v2` (leading space, or '' when empty). */
function fmtFields(fields) {
  if (!fields) return '';
  const out = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out.push(`${k}=${fmtVal(v)}`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

function emit(level, args) {
  const meta = LEVEL_META[level];
  const { parts, fields } = splitArgs(args);
  const msg = buildMessage(parts);

  if (resolveFormat() === 'logfmt') {
    const line = `ts=${new Date().toISOString()} level=${level} msg=${fmtVal(msg)}${fmtFields(fields)}`;
    console[meta.method](line);
    return;
  }

  // pretty
  if (colorEnabled()) {
    const tail = fields ? `${COLORS.gray}${fmtFields(fields).slice(1)}${COLORS.reset}` : '';
    console[meta.method](
      `${meta.color}[${meta.label}]${COLORS.reset} ${COLORS.gray}[${shortTime()}]${COLORS.reset} ${msg}${tail ? ' ' + tail : ''}`,
    );
  } else {
    console[meta.method](`[${meta.label}] [${shortTime()}] ${msg}${fmtFields(fields)}`);
  }
}

const logger = {
  debug(...args) {
    if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') emit('debug', args);
  },
  info(...args) { emit('info', args); },
  warn(...args) { emit('warn', args); },
  error(...args) { emit('error', args); },
};

// Exposed for unit tests (formatting is pure and worth asserting directly).
logger._internals = { fmtVal, fmtFields, buildMessage, splitArgs, resolveFormat };

module.exports = logger;
