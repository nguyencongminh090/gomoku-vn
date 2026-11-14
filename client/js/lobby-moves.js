'use strict';

/**
 * lobby-moves.js — the `moves` delta of a lobby room entry (TODO.md #377).
 *
 * A lobby entry's `moves` is the live game as a flat [x0,y0,x1,y1,…] (#364 mini boards). Sending the
 * whole array for every moved room on every 2.5 s flush cost ~110 KB/s per lobby viewer at 500 rooms,
 * so `lobby:patch` upserts carry only the tail: `{ movesFrom, moves }` = "keep my first `movesFrom`
 * numbers, then append these" — and, when nothing else changed, nothing else (`{ roomId, startedAt,
 * movesFrom, moves }`; the other fields are merged from the entry held). Snapshots (`lobby:update`)
 * are unchanged: full `moves`, no `movesFrom`.
 *
 * UMD, pure (no DOM): the server (state.js) and the lobby share this one file, so the cut and the
 * splice cannot drift. Browser: attaches to `globalThis.LobbyMoves`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LobbyMoves = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * Server side: how many leading numbers of `prev` still hold in `next`, rounded down to a whole
   * move (x,y pair). Undo shrinks the history, so this is a common prefix, not `prev.length`.
   * 0 when either side has no game.
   */
  function sharedPrefix(prev, next) {
    if (!Array.isArray(prev) || !Array.isArray(next)) return 0;
    const n = Math.min(prev.length, next.length);
    let i = 0;
    while (i < n && prev[i] === next[i]) i++;
    return i - (i % 2);
  }

  /**
   * Client side: merge an upsert into the entry already held. Returns the entry to store, or null
   * when the held entry cannot take the delta (no entry, another game, fewer than `movesFrom`
   * numbers) — the caller then needs a fresh snapshot. Splices by index, never appends blindly:
   * a snapshot taken between flushes may hold MORE than `movesFrom` (#377 trap). Idempotent.
   */
  function applyDelta(held, entry) {
    if (!entry || typeof entry.movesFrom !== 'number') return entry;
    if (!held || !Array.isArray(held.moves) || ('startedAt' in entry && held.startedAt !== entry.startedAt)
        || held.moves.length < entry.movesFrom || !Array.isArray(entry.moves)) return null;
    // A board-only upsert is just { roomId, startedAt, movesFrom, moves }: every other field comes from `held`.
    const merged = Object.assign({}, held, entry);
    delete merged.movesFrom;
    merged.moves = held.moves.slice(0, entry.movesFrom).concat(entry.moves);
    return merged;
  }

  return { sharedPrefix: sharedPrefix, applyDelta: applyDelta };
}));
