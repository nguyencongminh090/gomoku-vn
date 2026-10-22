'use strict';

/**
 * MatchQueue.js — quick-match pairing (B197, R3).
 *
 * Pure state: no sockets, no rooms, clock injected. MatchHandler owns the
 * socket events, the ticker and turning a pair into a room.
 *
 * Buckets: rule × time preset × rated × board setup (wall / portal). One entry per user (re-joining replaces it).
 * Rated pairing uses a rating window that widens with the older entry's wait;
 * casual is first-come-first-served. Oldest waiter is served first.
 */

const RULES = ['freestyle', 'standard', 'caro'];

/** Mockup time chips → the existing Fischer clock (`blitz`: total + increment per move). */
const PRESETS = {
  '1+0': { timerMode: 'blitz', timerSeconds: 60, timerIncrementSeconds: 0 },
  '3+2': { timerMode: 'blitz', timerSeconds: 180, timerIncrementSeconds: 2 },
  '5+3': { timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3 },
  '10+0': { timerMode: 'blitz', timerSeconds: 600, timerIncrementSeconds: 0 },
  '1+1': { timerMode: 'blitz', timerSeconds: 60, timerIncrementSeconds: 1 },
  '7+3': { timerMode: 'blitz', timerSeconds: 420, timerIncrementSeconds: 3 },
  // "m<s>" = per-move clock: each player gets <s> seconds per move (TimerManager 'per_move').
  m60: { timerMode: 'per_move', timerSeconds: 60 },
  m45: { timerMode: 'per_move', timerSeconds: 45 },
  m30: { timerMode: 'per_move', timerSeconds: 30 },
  m5: { timerMode: 'per_move', timerSeconds: 5 },
};

/** Human label for a preset key: "5+3" stays, "m30" → "30s/nước", auto → "Tự động". */
function timeLabel(key) {
  if (key === 'auto') return 'Tự động';
  const m = /^m(\d+)$/.exec(key);
  return m ? m[1] + 's/nước' : key;
}

/** Time "auto": pairs with anyone of the same rule/rated/board, whatever their clock. */
const AUTO = 'auto';
const AUTO_DEFAULT = 'm60'; // two autos play this

const WINDOW_START = 100;
const WINDOW_STEP = 50;
const WINDOW_STEP_MS = 5000;
const WINDOW_OPEN_MS = 30000;
const WAIT_SAMPLES = 20; // recent pairing waits kept per rule|time
const WAIT_MIN_SAMPLES = 3; // below this the lobby shows no estimate

/** ±rating window after waiting `ms`; Infinity once WINDOW_OPEN_MS has passed. */
function ratingWindow(ms) {
  if (ms >= WINDOW_OPEN_MS) return Infinity;
  return WINDOW_START + WINDOW_STEP * Math.floor(ms / WINDOW_STEP_MS);
}

/** Everything but the clock — two entries can only pair when this matches. */
function poolKey(e) {
  return `${e.rule}|${e.rated ? 'r' : 'c'}|${e.wall ? 'w' : ''}${e.portal ? 'p' : ''}`;
}

/** Same pool and clocks that agree: equal, or either side is auto (a set clock never meets a different one). */
function compatible(a, b) {
  return poolKey(a) === poolKey(b) && (a.time === AUTO || b.time === AUTO || a.time === b.time);
}

/** Clock key a pair plays: the side that picked one wins; two autos get AUTO_DEFAULT. */
function resolveTime(a, b) {
  if (a.time !== AUTO) return a.time;
  return b.time !== AUTO ? b.time : AUTO_DEFAULT;
}

function bucketKey(e) {
  return `${e.rule}|${e.time}|${e.rated ? 'r' : 'c'}|${e.wall ? 'w' : ''}${e.portal ? 'p' : ''}`;
}

class MatchQueue {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.entries = new Map(); // userId → entry (insertion order = join order)
    this.waits = new Map(); // 'rule|time' → last WAIT_SAMPLES seconds an entry waited before being paired
  }

  /** @returns {{ok:true, entry}|{error:string, code:string}} */
  join(e) {
    if (!RULES.includes(e.rule)) return { error: 'Luật không hợp lệ.', code: 'BAD_RULE' };
    if (e.time !== AUTO && !PRESETS[e.time]) return { error: 'Thời gian không hợp lệ.', code: 'BAD_TIME' };
    const rated = e.rated === true;
    if (rated && e.isGuest) return { error: 'Cần tài khoản để chơi xếp hạng.', code: 'RATED_NEEDS_ACCOUNT' };
    this.entries.delete(e.userId); // re-join → back of the line, fresh wait
    const entry = { ...e, rated, wall: e.wall === true, portal: e.portal === true, since: this.now() };
    this.entries.set(e.userId, entry);
    return { ok: true, entry };
  }

  leave(userId) {
    return this.entries.delete(userId);
  }

  get(userId) {
    return this.entries.get(userId) || null;
  }

  size() {
    return this.entries.size;
  }

  /** 'rule|time' → people waiting (rated + casual together) — the lobby's "N đang chờ" line (B210). */
  counts() {
    const out = {};
    for (const e of this.entries.values()) {
      const k = `${e.rule}|${e.time}`;
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }

  /** 'rule|time' → median recent wait in whole seconds, only once WAIT_MIN_SAMPLES pairings were seen (B210). */
  estimates() {
    const out = {};
    for (const [k, list] of this.waits) {
      if (list.length < WAIT_MIN_SAMPLES) continue;
      const sorted = [...list].sort((x, y) => x - y);
      out[k] = sorted[Math.floor(sorted.length / 2)];
    }
    return out;
  }

  _recordWait(entry, now) {
    const k = `${entry.rule}|${entry.time}`;
    const list = this.waits.get(k) || [];
    list.push(Math.max(1, Math.round((now - entry.since) / 1000)));
    if (list.length > WAIT_SAMPLES) list.shift();
    this.waits.set(k, list);
  }

  countIn(entry) {
    let n = 0;
    for (const e of this.entries.values()) if (compatible(e, entry)) n++;
    return n;
  }

  /**
   * Pair everyone who can be paired now. `canPlay(entry)` is a veto checked at
   * pairing time (e.g. the user has since joined a room); vetoed entries are dropped.
   * @returns {Array<[entry, entry]>} older entry first
   */
  pair(canPlay = () => true) {
    const now = this.now();
    const pairs = [];
    const verdict = new Map(); // userId → canPlay result, asked once per pass
    const ok = (e) => {
      if (!verdict.has(e.userId)) verdict.set(e.userId, !!canPlay(e));
      if (!verdict.get(e.userId)) { this.entries.delete(e.userId); return false; }
      return true;
    };
    for (const a of [...this.entries.values()]) {
      if (!this.entries.has(a.userId) || !ok(a)) continue; // taken earlier this pass, or vetoed
      const win = a.rated ? ratingWindow(now - a.since) : Infinity;
      let best = null;
      for (const b of [...this.entries.values()]) {
        if (b === a || b.userId === a.userId || !compatible(a, b)) continue;
        const gap = a.rated ? Math.abs((a.rating || 0) - (b.rating || 0)) : 0;
        if (gap > win || (best && gap >= best.gap) || !ok(b)) continue;
        best = { b, gap };
        if (!a.rated) break; // casual: first in line
      }
      if (!best) continue;
      this.entries.delete(a.userId);
      this.entries.delete(best.b.userId);
      this._recordWait(a, now);
      this._recordWait(best.b, now);
      pairs.push([a, best.b]);
    }
    return pairs;
  }
}

module.exports = { MatchQueue, ratingWindow, bucketKey, compatible, resolveTime, AUTO, PRESETS, RULES, timeLabel };
