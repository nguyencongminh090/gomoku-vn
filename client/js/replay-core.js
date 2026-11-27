'use strict';

/**
 * replay-core.js — pure helpers for the replay page (TODO.md #502). UMD, no DOM: `require()`-able from Node,
 * `globalThis.ReplayCore` in the browser.
 *
 *   moveTimes(moves)                  → { has, think }      think[i] = ms since move i-1 (think[0] = null)
 *   durationMs(game)                  → ms | null           ended_at − started_at
 *   formatClock(ms)                   → '42s' | '3:07' | '1:02:03'
 *   parseMoveParam(search, total)     → 0…total | null      ?move=N, clamped; null when absent or not a number
 *   buildShareUrl(origin, id, opts)   → '/replay/<id>?[source=tournament&]move=N'
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReplayCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** Think time per move. `has` is false (show no times at all) when any move lacks a numeric timestamp. */
  function moveTimes(moves) {
    const list = Array.isArray(moves) ? moves : [];
    const has = list.length > 0 && list.every((m) => m && typeof m.timestamp === 'number' && Number.isFinite(m.timestamp));
    if (!has) return { has: false, think: [] };
    return { has: true, think: list.map((m, i) => (i === 0 ? null : Math.max(0, m.timestamp - list[i - 1].timestamp))) };
  }

  function toMs(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v !== 'string' || !v) return NaN;
    return Date.parse(v);
  }

  function durationMs(game) {
    if (!game) return null;
    const d = toMs(game.ended_at) - toMs(game.started_at);
    return Number.isFinite(d) && d >= 0 ? d : null;
  }

  function formatClock(ms) {
    const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (s < 60) return s + 's';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }

  /** ?move=N → main-line ply (0 = empty board), clamped to 0…total. */
  function parseMoveParam(search, total) {
    const raw = new URLSearchParams(search || '').get('move');
    if (raw === null || !/^\s*-?\d+\s*$/.test(raw)) return null;
    const n = parseInt(raw, 10);
    const max = Math.max(0, total | 0);
    return Math.min(max, Math.max(0, n));
  }

  /** Link to this replay; `move` null/undefined → the game start (no move param). */
  function buildShareUrl(origin, gameId, opts) {
    const o = opts || {};
    const q = [];
    if (o.source === 'tournament') q.push('source=tournament');
    if (Number.isInteger(o.move) && o.move > 0) q.push('move=' + o.move);
    return (origin || '') + '/replay/' + encodeURIComponent(gameId) + (q.length ? '?' + q.join('&') : '');
  }

  return { moveTimes, durationMs, formatClock, parseMoveParam, buildShareUrl };
}));
