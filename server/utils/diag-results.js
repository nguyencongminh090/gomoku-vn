'use strict';

/**
 * diag-results.js — persistence for the diagnostic latency page (TODO.md #168).
 *
 * The JSONL file is the SOURCE OF TRUTH (planning.md OQ4):
 * `server/data/diag-results/YYYY-MM-DD.jsonl`, one line per submitted run,
 * gitignored. The `[DiagResult]` logfmt line emitted alongside it is a
 * convenience for the existing grep pipeline (same shape as `[MoveLag]`,
 * #164/#167) and is explicitly NOT relied on — anything that must survive
 * goes in the JSONL.
 *
 * Everything crossing this boundary is attacker-controlled: the namespace is
 * unauthenticated by design (R1), so `name`, `feedback` and every number in
 * `run` arrive from an anonymous socket. Two rules follow, and both are load
 * bearing:
 *
 *   1. Control characters are stripped before `JSON.stringify`. A raw newline
 *      inside a value would split one record across two physical lines and
 *      corrupt the file for every reader — JSONL has no escape for that at the
 *      file level, only at the value level.
 *   2. Non-finite numbers are dropped, not coerced. `JSON.stringify(NaN)` and
 *      `Infinity` both emit the bare token `null`... but only for numbers that
 *      reached the object; a `NaN` that slipped into an average would silently
 *      poison an aggregate later. Dropping the key says "not measured", which
 *      is the truth.
 *
 * Retention (R6): files older than DIAG_RETENTION_DAYS are deleted on write.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const logger = require('./logger');
const config = require('../config');

const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'diag-results');

/** Where results are written. Env override exists so tests never touch the real folder. */
function resultsDir() {
  return config.DIAG_RESULTS_DIR || DEFAULT_DIR;
}

/** `YYYY-MM-DD` in UTC — the file is named for the day the row was recorded. */
function dayStamp(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------------

/**
 * Collapse a free-text field to something safe to put in one JSONL line.
 *
 * Strips C0/C1 control characters (newlines and tabs among them) rather than
 * escaping them: this text is read by a human scanning a log, and a literal
 * "\n" mid-sentence is noise. Truncation is applied after stripping so the
 * length limit describes what is actually stored.
 *
 * @param {*} value
 * @param {number} maxLen
 * @returns {string} always a string, possibly empty — never null/undefined
 */
function sanitizeText(value, maxLen) {
  if (value === null || value === undefined) return '';
  // C0 (which includes \n, \r and \t), DEL, and C1. Replaced with a space
  // rather than deleted, so "line1\nline2" reads as "line1 line2" instead of
  // the misleading "line1line2". Written as escapes on purpose: literal
  // control bytes in the source are invisible to review and easy to mangle.
  // eslint-disable-next-line no-control-regex
  const stripped = String(value).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLen ? collapsed.slice(0, maxLen) : collapsed;
}

/** A finite number, or `undefined` so the key is omitted entirely. */
function finiteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  // Round to 3 decimals: these are milliseconds and percentages, and full
  // float precision only makes the line harder to read.
  return Math.round(value * 1000) / 1000;
}

/**
 * Keep only the named numeric keys of a stats bag, each of which must be
 * finite. Returns `undefined` when nothing survived, so an all-garbage bag
 * omits its key rather than storing `{}`.
 */
function numericBag(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  const out = {};
  let kept = 0;
  for (const k of keys) {
    const n = finiteNumber(obj[k]);
    if (n !== undefined) { out[k] = n; kept++; }
  }
  return kept ? out : undefined;
}

/** Shape of `run` as specified in features/diagnostic-latency-page/planning.md. */
const RUN_SHAPE = {
  halfRttMs:      ['p50', 'p90', 'p99', 'min', 'max', 'jitter'],
  clockOffsetMs:  ['p50', 'driftMsPerMin'],
  inputPaintMs:   ['p50', 'p90'],
  moveConfirmMs:  ['p50', 'p90', 'p99'],
  timerHandoffMs: ['p50', 'p90', 'p99'],
  spentFloorMs:   ['p50'],
};
const RUN_SCALARS = ['durationMs', 'transportSamples', 'boardMoves', 'packetLossPct'];

/** Whitelist + finite-check the measurement bag. Unknown keys are dropped. */
function sanitizeRun(run) {
  if (!run || typeof run !== 'object') return {};
  const out = {};
  for (const k of RUN_SCALARS) {
    const n = finiteNumber(run[k]);
    if (n !== undefined) out[k] = n;
  }
  for (const [k, fields] of Object.entries(RUN_SHAPE)) {
    const bag = numericBag(run[k], fields);
    if (bag) out[k] = bag;
  }
  return out;
}

const VERDICT_VALUES = new Set(['green', 'yellow', 'red']);

/** Only the three known axes, only the three known values. */
function sanitizeVerdict(verdict) {
  if (!verdict || typeof verdict !== 'object') return {};
  const out = {};
  for (const axis of ['connection', 'clock', 'stability']) {
    const v = verdict[axis];
    if (typeof v === 'string' && VERDICT_VALUES.has(v)) out[axis] = v;
  }
  return out;
}

/** `navigator.connection` snapshot — advisory, so every field is optional. */
function sanitizeNet(net) {
  if (!net || typeof net !== 'object') return undefined;
  const out = {};
  const et = sanitizeText(net.effectiveType, 12);
  if (et) out.effectiveType = et;
  const downlink = finiteNumber(net.downlink);
  if (downlink !== undefined) out.downlink = downlink;
  const rtt = finiteNumber(net.rtt);
  if (rtt !== undefined) out.rtt = rtt;
  if (typeof net.saveData === 'boolean') out.saveData = net.saveData;
  return Object.keys(out).length ? out : undefined;
}

/** Client build/environment context: asset version, timezone, viewport. */
function sanitizeClient(client) {
  if (!client || typeof client !== 'object') return undefined;
  const out = {};
  const assetVersion = finiteNumber(client.assetVersion);
  if (assetVersion !== undefined) out.assetVersion = assetVersion;
  const tz = sanitizeText(client.tz, 64);
  if (tz) out.tz = tz;
  // "390x844" and nothing else — a free-form string here would be a place to
  // smuggle length past the individual field caps.
  const viewport = sanitizeText(client.viewport, 16);
  if (/^\d{1,5}x\d{1,5}$/.test(viewport)) out.viewport = viewport;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Build the record that gets written. Pure — no I/O, so the shape is testable
 * on its own.
 *
 * @param {object} input  attacker-controlled submission
 * @param {object} meta   server-derived context {ip, geo, ua}
 * @param {Date}   [now]
 */
function buildRecord(input, meta = {}, now = new Date()) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    id: crypto.randomUUID(),
    ts: new Date(now).toISOString(),
    name: sanitizeText(src.name, config.DIAG_MAX_NAME_LEN),
    feedback: sanitizeText(src.feedback, config.DIAG_MAX_FEEDBACK_LEN),
    ip: meta.ip || '-',
    geo: meta.geo || '-',
    ua: sanitizeText(meta.ua, 256),
    net: sanitizeNet(src.net),
    client: sanitizeClient(src.client),
    run: sanitizeRun(src.run),
    verdict: sanitizeVerdict(src.verdict),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD.jsonl` filenames only — never touch anything else in the dir. */
const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * Delete result files older than the retention window.
 *
 * Runs on write (see the module header). Failures are logged and swallowed:
 * losing a prune is a privacy-retention miss to fix later, but throwing here
 * would lose the player's submission, which is the thing we actually cannot
 * get again.
 *
 * @returns {string[]} names of the files removed
 */
function pruneOldFiles(now = new Date(), dir = resultsDir(), retentionDays = config.DIAG_RETENTION_DAYS) {
  const removed = [];
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return removed; // no directory yet — nothing to prune
  }
  const cutoff = new Date(now).getTime() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of entries) {
    const m = FILE_RE.exec(name);
    if (!m) continue;
    // Compare by the date IN THE NAME, not mtime: appending a line to today's
    // file must never make an old file look fresh, and copying the folder
    // around must not reset everything's age.
    const fileDay = Date.parse(`${m[1]}T00:00:00.000Z`);
    if (Number.isNaN(fileDay) || fileDay >= cutoff) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
      removed.push(name);
    } catch (err) {
      logger.warn('[DiagResult] prune failed', { file: name, err: err.message });
    }
  }
  if (removed.length) {
    logger.info('[DiagResult] pruned expired result files', {
      count: removed.length, retention_days: retentionDays,
    });
  }
  return removed;
}

/** Flatten the nested record into the one-level field bag the logger wants. */
function toLogFields(record) {
  const r = record.run || {};
  const half = r.halfRttMs || {};
  const off = r.clockOffsetMs || {};
  const handoff = r.timerHandoffMs || {};
  const confirm = r.moveConfirmMs || {};
  return {
    id: record.id,
    name: record.name || undefined,
    ip: record.ip,
    geo: record.geo,
    samples: r.transportSamples,
    moves: r.boardMoves,
    duration_ms: r.durationMs,
    half_rtt_p50: half.p50,
    half_rtt_p90: half.p90,
    half_rtt_p99: half.p99,
    jitter_ms: half.jitter,
    clock_offset_p50: off.p50,
    drift_ms_per_min: off.driftMsPerMin,
    loss_pct: r.packetLossPct,
    move_confirm_p90: confirm.p90,
    timer_handoff_p50: handoff.p50,
    timer_handoff_p90: handoff.p90,
    spent_floor_p50: r.spentFloorMs ? r.spentFloorMs.p50 : undefined,
    verdict_connection: record.verdict ? record.verdict.connection : undefined,
    verdict_clock: record.verdict ? record.verdict.clock : undefined,
    verdict_stability: record.verdict ? record.verdict.stability : undefined,
    feedback: record.feedback || undefined,
  };
}

/**
 * Sanitize, persist and log one submitted run.
 *
 * @param {object} input attacker-controlled submission
 * @param {object} meta  {ip, geo, ua}
 * @returns {{ok: true, id: string, file: string}}
 * @throws if the JSONL append itself fails — the caller must tell the player,
 *   because a silent success would lose a sample we cannot ask for twice.
 */
function recordResult(input, meta = {}, now = new Date()) {
  const record = buildRecord(input, meta, now);
  const dir = resultsDir();
  const file = path.join(dir, `${dayStamp(now)}.jsonl`);

  fs.mkdirSync(dir, { recursive: true });
  // `JSON.stringify` cannot emit a raw newline (control chars inside strings
  // are escaped, and sanitizeText already removed them), so exactly one line
  // is appended. Append mode so concurrent submissions cannot truncate.
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');

  logger.info('[DiagResult]', toLogFields(record));

  // After the write, so a prune failure can never cost us the submission.
  try {
    pruneOldFiles(now, dir);
  } catch (err) {
    logger.warn('[DiagResult] prune pass failed', { err: err.message });
  }

  return { ok: true, id: record.id, file };
}

module.exports = {
  resultsDir,
  dayStamp,
  sanitizeText,
  finiteNumber,
  sanitizeRun,
  sanitizeVerdict,
  sanitizeNet,
  sanitizeClient,
  buildRecord,
  pruneOldFiles,
  toLogFields,
  recordResult,
};
