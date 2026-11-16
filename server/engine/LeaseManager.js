'use strict';
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { ERR, END, EngineError } = require('./constants');

const DEFAULTS = Object.freeze({
  tokenTtlMs: 10 * 60 * 1000,      // file-download token; minutes, never hours (design §3)
  readyTimeoutMs: 90 * 1000,       // grant → engine:ready (mobile download of ~1.5 MB + compile)
  idleTtlMs: 30 * 60 * 1000,       // no event from the owner for this long → revoke
  sweepMs: 15 * 1000,
  maxLeases: 200,                  // global cap
  maxPerUser: 2,                   // across purposes; same user+purpose always replaces
});

const STATE = Object.freeze({ GRANTED: 'granted', READY: 'ready', DEAD: 'dead' });

/**
 * Lease / resource pool (design §3, state diagram). In-memory, single process.
 * Lease = { id, userId, socketId, purpose, gameId, state, createdAt, lastSeen, tokenExp, endReason }.
 * Token = `<leaseId>.<exp>.<mac>`; mac = HMAC-SHA256(key, leaseId.exp). verifyToken() also requires the lease
 * to be live, i.e. the live-lease map is the denylist: a revoked lease's unexpired token is refused at once.
 * Events: 'end' (lease, reason) — exactly once per lease.
 */
class LeaseManager extends EventEmitter {
  constructor({ secret, now = Date.now, ...opts } = {}) {
    super();
    if (!secret) throw new Error('LeaseManager: secret required');
    // Domain-separated key: a JWT secret leak path never doubles as a file token and vice versa.
    this._key = crypto.createHmac('sha256', String(secret)).update('engine-files').digest();
    this._now = now;
    this.opts = { ...DEFAULTS, ...opts };
    this._leases = new Map();
    this._timer = null;
  }

  startSweeper() {
    if (this._timer) return;
    this._timer = setInterval(() => this.sweep(), this.opts.sweepMs);
    if (this._timer.unref) this._timer.unref();
  }

  stopSweeper() { clearInterval(this._timer); this._timer = null; }

  get size() { return this._leases.size; }

  get(id) { return this._leases.get(id) || null; }

  list() { return [...this._leases.values()]; }

  /** Grant a lease; replaces the user's live lease for the same purpose. → { lease, token } | throws EngineError. */
  grant({ userId, socketId, purpose, gameId = null }) {
    if (!userId || !socketId || !purpose) throw new EngineError(ERR.BAD_REQUEST, 'grant');
    for (const l of this.list()) {
      if (l.userId === userId && l.purpose === purpose) this.revoke(l.id, END.REPLACED);
    }
    const mine = this.list().filter((l) => l.userId === userId).length;
    if (mine >= this.opts.maxPerUser || this._leases.size >= this.opts.maxLeases) {
      throw new EngineError(ERR.LIMIT, mine >= this.opts.maxPerUser ? 'user' : 'global');
    }
    const t = this._now();
    const lease = {
      id: crypto.randomUUID(), userId, socketId, purpose, gameId,
      state: STATE.GRANTED, createdAt: t, lastSeen: t, tokenExp: t + this.opts.tokenTtlMs, endReason: null,
      timeouts: 0,
    };
    this._leases.set(lease.id, lease);
    return { lease, token: this._sign(lease.id, lease.tokenExp) };
  }

  /** Owner check: the lease exists, is live and belongs to this socket. → lease | null. */
  owned(leaseId, socketId) {
    const l = this._leases.get(leaseId);
    return l && l.socketId === socketId && l.state !== STATE.DEAD ? l : null;
  }

  touch(leaseId) {
    const l = this._leases.get(leaseId);
    if (l) l.lastSeen = this._now();
  }

  markReady(leaseId) {
    const l = this._leases.get(leaseId);
    if (!l || l.state === STATE.DEAD) return null;
    l.state = STATE.READY;
    l.lastSeen = this._now();
    return l;
  }

  /** Idempotent. Emits 'end' once. → true if a live lease was ended. */
  revoke(leaseId, reason = END.REVOKED) {
    const l = this._leases.get(leaseId);
    if (!l) return false;
    this._leases.delete(leaseId);
    l.state = STATE.DEAD;
    l.endReason = reason;
    this.emit('end', l, reason);
    return true;
  }

  revokeWhere(pred, reason) {
    let n = 0;
    for (const l of this.list()) if (pred(l) && this.revoke(l.id, reason)) n++;
    return n;
  }

  revokeBySocket(socketId, reason = END.DISCONNECT) { return this.revokeWhere((l) => l.socketId === socketId, reason); }

  revokeByGame(gameId, reason = END.GAME_OVER) {
    if (gameId == null) return 0;
    return this.revokeWhere((l) => l.gameId === gameId, reason);
  }

  sweep() {
    const t = this._now();
    for (const l of this.list()) {
      if (l.state === STATE.GRANTED && t - l.createdAt > this.opts.readyTimeoutMs) this.revoke(l.id, END.READY_TIMEOUT);
      else if (t - l.lastSeen > this.opts.idleTtlMs) this.revoke(l.id, END.IDLE);
    }
  }

  _mac(leaseId, exp) {
    return crypto.createHmac('sha256', this._key).update(`${leaseId}.${exp}`).digest('base64url');
  }

  _sign(leaseId, exp) { return `${leaseId}.${exp}.${this._mac(leaseId, exp)}`; }

  /** → lease | null. Constant-time mac compare; expired, malformed or revoked → null. */
  verifyToken(token) {
    if (typeof token !== 'string' || token.length > 200) return null;
    const m = /^([0-9a-f-]{36})\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!m) return null;
    const [, leaseId, expStr, mac] = m;
    const exp = Number(expStr);
    const want = Buffer.from(this._mac(leaseId, exp));
    const got = Buffer.from(mac);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    if (exp <= this._now()) return null;
    const l = this._leases.get(leaseId);
    return l && l.state !== STATE.DEAD ? l : null;
  }
}

module.exports = { LeaseManager, LEASE_STATE: STATE, LEASE_DEFAULTS: DEFAULTS };
