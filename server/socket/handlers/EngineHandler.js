'use strict';
/**
 * Client-hosted engine socket protocol (#405, features/rapfi-engine/backend-design.md §3–§5).
 *
 *   engine:request {purpose, gameId?, variant}  C→S  ack {ok, leaseId, token, base, files, variant} | {ok:false, code}
 *                  variant 'multi' (#408) is granted only when the build has it; otherwise the ack says 'single'
 *   engine:ready   {leaseId, info?}             C→S  worker loaded → lease READY, jobs may flow; info.cores sizes multi threads
 *   engine:job     {leaseId, jobId, commands[]} S→C  one engine command each (a block is one '\n'-joined entry)
 *   engine:line    {leaseId, jobId, lines[]}    C→S  batched progress output
 *   engine:done    {leaseId, jobId, moveLine}   C→S  final bare move line
 *   engine:stop    {leaseId, jobId, hard|command} S→C  hard: terminate + respawn worker; command: send it (multi YXSTOP)
 *   engine:end     {leaseId, reason}            S→C  lease over: client terminates its worker
 *   engine:error   {leaseId, jobId?, code}      C→S  load failure / crash
 *
 * The client is untrusted: every C→S event is checked for lease ownership (socket id), rate-limited and
 * size-capped; jobs are built only by the server (EngineService/JobFactory). Who may lease for which purpose
 * is decided by an injected authorizer (#407 wires the bot seat); with no authorizer every request is refused.
 * A lease dies with its socket (no reconnect grace): the host re-requests after a reconnect.
 */
const config = require('../../config');
const logger = require('../../utils/logger');
const { LeaseManager } = require('../../engine/LeaseManager');
const { EngineService } = require('../../engine/EngineService');
const { ClientWasmTransport } = require('../../engine/transports/ClientWasmTransport');
const { defaultRegistry } = require('../../engine/purposes');
const { resolveBuild, ENGINE_VARIANTS } = require('../../engine/build');
const { ERR, END } = require('../../engine/constants');

const MAX_TIMEOUTS = 2;          // consecutive job timeouts before the lease is ended (slow/silent client)
const MAX_STRIKES = 3;           // oversize / malformed / over-rate events before the lease is ended
const RATE = Object.freeze({
  request: { limit: 6, windowMs: 60 * 1000 },
  output: { limit: 30, windowMs: 1000 },     // line+done+error; the global flood cap is 50/s per socket
});

const state = {
  enabled: config.ENGINE_LEASES_ENABLED,
  leases: null,
  build: undefined,
  buildOpts: { dir: config.ENGINE_FILES_DIR || undefined, buildId: config.ENGINE_BUILD_ID },
  authorizer: null,
  purposes: defaultRegistry(),
  sessions: new Map(),            // leaseId → { lease, socket, transport, service }
  readyHooks: new Set(),
  serviceOpts: {},
};

function leaseManager() {
  if (!state.leases) {
    state.leases = new LeaseManager({ secret: config.JWT_SECRET, maxLeases: config.ENGINE_MAX_LEASES });
    state.leases.on('end', onLeaseEnd);
    state.leases.startSweeper();
  }
  return state.leases;
}

function currentBuild() {
  if (state.build === undefined) state.build = resolveBuild(state.buildOpts);
  return state.build;
}

function onLeaseEnd(lease, reason) {
  const s = state.sessions.get(lease.id);
  state.sessions.delete(lease.id);
  if (!s) return;
  s.transport.close();
  s.service.removeAllListeners();
  if (s.socket.connected) s.socket.emit('engine:end', { leaseId: lease.id, reason });
  logger.info('[Engine] Lease ended', { leaseId: lease.id, uid: lease.userId, purpose: lease.purpose, reason });
}

/** Fixed-window counter per socket+bucket. → true when allowed. */
function makeLimiter(now = Date.now) {
  const hits = new Map();
  return (bucket) => {
    const { limit, windowMs } = RATE[bucket];
    const t = now();
    let h = hits.get(bucket);
    if (!h || t - h.start >= windowMs) { h = { start: t, n: 0 }; hits.set(bucket, h); }
    h.n++;
    return h.n <= limit;
  };
}

function register(io, socket) {
  const user = socket.user;
  const allow = makeLimiter();
  const ackOf = (ack) => (typeof ack === 'function' ? ack : () => {});

  const strike = (s, code) => {
    s.lease.strikes = (s.lease.strikes || 0) + 1;
    logger.warn('[Engine] Client strike', { leaseId: s.lease.id, uid: user.userId, code, strikes: s.lease.strikes });
    if (s.lease.strikes >= MAX_STRIKES) leaseManager().revoke(s.lease.id, END.ABUSE);
  };

  /** Owner session for a C→S payload, or null (foreign socket, dead lease, bad payload). */
  const own = (p) => {
    if (!p || typeof p.leaseId !== 'string') return null;
    if (!leaseManager().owned(p.leaseId, socket.id)) return null;
    const s = state.sessions.get(p.leaseId);
    if (s) leaseManager().touch(p.leaseId);
    return s || null;
  };

  socket.on('engine:request', async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      if (!state.enabled) return reply({ ok: false, code: ERR.DISABLED });
      if (!allow('request')) return reply({ ok: false, code: ERR.RATE_LIMITED });
      const p = payload || {};
      const purpose = typeof p.purpose === 'string' ? p.purpose : '';
      const gameId = p.gameId == null ? null : String(p.gameId).slice(0, 64);
      if (!state.purposes.get(purpose)) return reply({ ok: false, code: ERR.UNKNOWN_PURPOSE });
      if (p.variant !== undefined && !ENGINE_VARIANTS[p.variant]) return reply({ ok: false, code: ERR.BAD_REQUEST });
      const build = currentBuild();
      if (!build) return reply({ ok: false, code: ERR.NO_BUILD });
      const verdict = state.authorizer ? await state.authorizer({ user, purpose, gameId, socket }) : ERR.FORBIDDEN;
      if (verdict !== true) return reply({ ok: false, code: typeof verdict === 'string' ? verdict : ERR.FORBIDDEN });
      if (!socket.connected) return undefined;
      const { lease, token } = leaseManager().grant({ userId: user.userId, socketId: socket.id, purpose, gameId });
      const variant = p.variant === 'multi' && build.variants.multi ? 'multi' : 'single';
      const transport = new ClientWasmTransport({ leaseId: lease.id, variant, emit: (ev, data) => socket.emit(ev, data) });
      const service = new EngineService({ transport, purposes: state.purposes, ...state.serviceOpts });
      service.on('job:done', () => { lease.timeouts = 0; });
      service.on('job:error', ({ error }) => {
        if (error.code !== ERR.TIMEOUT) return;
        lease.timeouts++;
        if (lease.timeouts >= MAX_TIMEOUTS) leaseManager().revoke(lease.id, END.SLOW);
      });
      state.sessions.set(lease.id, { lease, socket, transport, service });
      logger.info('[Engine] Lease granted', { leaseId: lease.id, uid: user.userId, purpose, gameId });
      return reply({
        ok: true, leaseId: lease.id, token, variant,
        base: `/engine/${build.buildId}/`, files: { ...build.variants[variant] },
      });
    } catch (e) {
      return reply({ ok: false, code: e && e.code && String(e.code).startsWith('ENGINE_') ? e.code : ERR.ENGINE_ERROR });
    }
  });

  socket.on('engine:ready', (payload) => {
    const s = own(payload);
    if (!s || s.transport.ready) return;
    leaseManager().markReady(s.lease.id);
    s.transport.setReady(payload.info);
    for (const fn of state.readyHooks) {
      try { fn({ leaseId: s.lease.id, lease: s.lease, service: s.service }); } catch (e) {
        logger.warn('[Engine] ready hook failed', { err: e && e.message });
      }
    }
  });

  // A rejected batch must never vanish silently: a dropped line corrupts the PV reducer and a dropped move
  // turns into a TIMEOUT. So any cap/rate violation fails the in-flight job explicitly (ENGINE_ERROR → caller
  // fallback) and counts a strike. engine:done skips the rate bucket: inFlight already allows one per job.
  const output = (fn, { limited = true } = {}) => (payload) => {
    const s = own(payload);
    if (!s) return;
    let r = limited && !allow('output') ? ERR.RATE_LIMITED : null;
    if (!r) r = fn(s, payload);
    if (r === 'ok' || r === 'stale') return;
    s.transport.deliverError(payload.jobId);
    strike(s, r);
  };

  socket.on('engine:line', output((s, p) => s.transport.deliverLines(p.jobId, p.lines)));
  socket.on('engine:done', output((s, p) => s.transport.deliverDone(p.jobId, p.moveLine), { limited: false }));
  socket.on('engine:error', output((s, p) => {
    if (!s.transport.ready) { leaseManager().revoke(s.lease.id, END.CLIENT_ERROR); return 'ok'; }
    return s.transport.deliverError(p.jobId);
  }));

  socket.on('disconnect', () => {
    if (state.leases) state.leases.revokeBySocket(socket.id, END.DISCONNECT);
  });
}

// ── Hooks for purposes wired elsewhere (#407 bot seat, analysis, …) ─────────

/** fn({user, purpose, gameId, socket}) → true | ERR code (sync or async). */
function setAuthorizer(fn) { state.authorizer = fn; }
/** fn({leaseId, lease, service}) on engine:ready. → unsubscribe. */
function onLeaseReady(fn) { state.readyHooks.add(fn); return () => state.readyHooks.delete(fn); }
function getService(leaseId) { const s = state.sessions.get(leaseId); return s ? s.service : null; }
function revokeLease(leaseId, reason = END.REVOKED) { return state.leases ? state.leases.revoke(leaseId, reason) : false; }
function revokeForGame(gameId, reason = END.GAME_OVER) { return state.leases ? state.leases.revokeByGame(gameId, reason) : 0; }
function getLeaseManager() { return leaseManager(); }

/** Test seam. */
function _configure({ enabled, buildOpts, serviceOpts, purposes, leases } = {}) {
  if (enabled !== undefined) state.enabled = enabled;
  if (buildOpts) { state.buildOpts = buildOpts; state.build = undefined; }
  if (serviceOpts) state.serviceOpts = serviceOpts;
  if (purposes) state.purposes = purposes;
  if (leases) {
    if (state.leases) state.leases.stopSweeper();
    state.leases = leases;
    leases.on('end', onLeaseEnd);
  }
}
function _reset() {
  if (state.leases) { state.leases.revokeWhere(() => true, END.REVOKED); state.leases.stopSweeper(); }
  state.leases = null;
  state.sessions.clear();
  state.readyHooks.clear();
  state.authorizer = null;
  state.enabled = config.ENGINE_LEASES_ENABLED;
  state.build = undefined;
  state.buildOpts = { dir: config.ENGINE_FILES_DIR || undefined, buildId: config.ENGINE_BUILD_ID };
  state.serviceOpts = {};
  state.purposes = defaultRegistry();
}

module.exports = {
  register, setAuthorizer, onLeaseReady, getService, revokeLease, revokeForGame, getLeaseManager,
  ENGINE_RATE: RATE, _configure, _reset,
};
