'use strict';

/**
 * presence-view.js — the ONE client renderer of player status (#488, features/presence-status §2c/§2d).
 *
 * UMD like escape-utils.js: `require()`-able from Node (unit tests, no DOM) and loaded as a classic
 * <script> in the browser, where it attaches to `globalThis.PresenceView`. Every page that shows a
 * status (social, pickers, lobby, DM window, room seats) asks this module for the label key, tone and
 * glyph, so the same person in the same state reads the same everywhere.
 *
 * Inputs:
 *   - the server's wire `st` (outside the room): { c: 'on'|'re'|'off', a?: 1, k?: kind, r?, t? }
 *   - a room member (inside the room): { presence: 'active'|'away'|'disconnected', graceUntil? }
 *     with ctx { inRoom: true, roomState } — the room keeps the user's own words (#113/#114).
 *
 * Tone → colour token (#114 semaphore) and glyph → shape, so colour is never the only cue (Q8 A):
 *   ok   = --c-success   idle = --c-border   warn = --c-warning   bad = --c-error   off = --c-border (hollow)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PresenceView = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var BY_KIND = {
    play: { key: 'presence.playing', glyph: 'core' },
    tour: { key: 'presence.tournament', glyph: 'core' },
    watch: { key: 'presence.watching', glyph: 'ring' },
    search: { key: 'presence.searching', glyph: 'dotted' },
    idle: { key: 'presence.online', glyph: 'fill' },
  };

  function out(state, key, tone, glyph) {
    return { state: state, key: key, tone: tone, glyph: glyph };
  }

  /** A room member, as the room shows it (seat dot, spectator list). */
  function describeMember(m, ctx) {
    var p = m && m.presence;
    if (p === 'disconnected') return out('disconnected', 'room.status_disconnected', 'bad', 'gap');
    if (p === 'away') return out('away', 'room.status_away', 'warn', 'half');
    if (ctx && ctx.roomState === 'playing') return out('playing', 'room.status_active', 'ok', 'fill');
    return out('waiting', 'room.status_waiting', 'idle', 'fill');
  }

  /** The wire `st` (friends, pickers, lobby, DM window). Unknown or missing → offline. */
  function describeStatus(st) {
    var c = st && st.c;
    if (c === 're') return out('reconnecting', 'presence.reconnecting', 'bad', 'gap');
    if (c !== 'on') return out('offline', 'presence.offline', 'off', 'hollow');
    var kind = BY_KIND[st.k] ? st.k : 'idle';
    if (st.a) {
      // Away wins over the activity (Q4 A); a game keeps its own wording so friends still see it.
      return kind === 'play' || kind === 'tour'
        ? out('away', 'presence.playing_away', 'warn', 'half')
        : out('away', 'presence.away', 'warn', 'half');
    }
    return out(kind === 'idle' ? 'online' : kind, BY_KIND[kind].key, 'ok', BY_KIND[kind].glyph);
  }

  /**
   * @param {object} input wire `st`, or a room member when ctx.inRoom
   * @param {{ inRoom?: boolean, roomState?: string }} [ctx]
   * @returns {{ state: string, key: string, tone: 'ok'|'idle'|'warn'|'bad'|'off', glyph: string }}
   */
  function describe(input, ctx) {
    return ctx && ctx.inRoom ? describeMember(input, ctx) : describeStatus(input);
  }

  /**
   * A person row's wire status: the server's `st` (#488), or — for a row without it (an online-list entry the
   * page marked `online: true` itself) — plain online/offline. Friend rows carry only `st` since #498.
   */
  function stOfRow(row) {
    if (!row) return { c: 'off' };
    if (row.st && typeof row.st === 'object') return row.st;
    return row.online ? { c: 'on', k: 'idle' } : { c: 'off' };
  }

  /**
   * "Online" for lists, sorting and the challenge picker (#372): connected and active, not away — the same
   * fact the server's isVisiblyOnline gave as the removed friend-row `online` field (#498).
   */
  function isOnline(row) {
    var st = stOfRow(row);
    return st.c === 'on' && !st.a;
  }

  /** Seconds left of a grace deadline (server ms) for a countdown; null when none. */
  function secondsLeft(graceUntil, now) {
    if (typeof graceUntil !== 'number') return null;
    return Math.max(0, Math.ceil((graceUntil - (typeof now === 'number' ? now : Date.now())) / 1000));
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * The status dot: a shape per state plus a text label for hover and screen readers.
   * @param {object} desc from describe()
   * @param {string} label translated desc.key
   * @param {string} [extraClass]
   */
  function dotHtml(desc, label, extraClass) {
    var cls = 'pres-dot pres-dot--' + desc.tone + ' pres-dot--' + desc.glyph + (extraClass ? ' ' + extraClass : '');
    return '<span class="' + escapeAttr(cls) + '" role="img" aria-label="' + escapeAttr(label) + '" title="' + escapeAttr(label) + '"></span>';
  }

  return { describe: describe, stOfRow: stOfRow, isOnline: isOnline, secondsLeft: secondsLeft, dotHtml: dotHtml };
});
