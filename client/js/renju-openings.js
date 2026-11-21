'use strict';

/**
 * renju-openings.js — names the first three moves when they match one of the 26 RIF openings (TODO.md #425).
 *
 * UMD, pure. `detectOpening(moves, size)` → { group: 'indirect'|'direct', no, name } | null  (null = "free-open").
 * moves = [{x, y}, …] in play order, y TOP-DOWN; only the first three are read. Black 1 must be the board centre,
 * White 2 in the 3x3, Black 3 in the 5x5; the match is taken under the 8 symmetries of the square.
 * Data: docs/knowledge/renju-rif-rules.md (read from the Wikipedia RIF diagrams). Offsets are [dx right, dy UP] from H8.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RenjuOpenings = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const INDIRECT_W = [1, 1];
  const DIRECT_W = [0, 1];
  const INDIRECT = [
    ['Chosei', [2, 2]], ['Kyogetsu', [2, 1]], ['Kosei', [2, 0]], ['Suigetsu', [2, -1]], ['Ryusei', [2, -2]],
    ['Ungetsu', [1, 0]], ['Hogetsu', [1, -1]], ['Rangetsu', [1, -2]], ['Gingetsu', [0, -1]], ['Myojo', [0, -2]],
    ['Shagetsu', [-1, -1]], ['Meigetsu', [-1, -2]], ['Suisei', [-2, -2]],
  ];
  const DIRECT = [
    ['Kansei', [0, 2]], ['Keigetsu', [1, 2]], ['Sosei', [2, 2]], ['Kagetsu', [1, 1]], ['Zangetsu', [2, 1]],
    ['Ugetsu', [1, 0]], ['Kinsei', [2, 0]], ['Shogetsu', [0, -1]], ['Kyugetsu', [1, -1]], ['Shingetsu', [2, -1]],
    ['Zuisei', [0, -2]], ['Sangetsu', [1, -2]], ['Yusei', [2, -2]],
  ];

  /** [{group, no, name, w, b}] — the 26 patterns. */
  const OPENINGS = [
    ...INDIRECT.map(([name, b], i) => ({ group: 'indirect', no: i + 1, name, w: INDIRECT_W, b })),
    ...DIRECT.map(([name, b], i) => ({ group: 'direct', no: i + 1, name, w: DIRECT_W, b })),
  ];

  // The 8 symmetries of the square as [[a, b], [c, d]] applied to (dx, dy).
  const SYMS = [
    [[1, 0], [0, 1]], [[0, -1], [1, 0]], [[-1, 0], [0, -1]], [[0, 1], [-1, 0]],
    [[-1, 0], [0, 1]], [[1, 0], [0, -1]], [[0, 1], [1, 0]], [[0, -1], [-1, 0]],
  ];
  const apply = (m, [x, y]) => [m[0][0] * x + m[0][1] * y, m[1][0] * x + m[1][1] * y];
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];

  /** Indirect (White diagonal to Black 1) and direct (orthogonal) never overlap, so a match is unique. */
  function detectOpening(moves, size) {
    if (!Array.isArray(moves) || moves.length < 3) return null;
    const c = Math.floor(size / 2);
    const [m1, m2, m3] = moves;
    if (!m1 || m1.x !== c || m1.y !== c) return null;
    const w = [m2.x - c, c - m2.y]; // dy UP
    const b = [m3.x - c, c - m3.y];
    if (Math.max(Math.abs(w[0]), Math.abs(w[1])) !== 1 || Math.max(Math.abs(b[0]), Math.abs(b[1])) > 2) return null;
    for (const o of OPENINGS) {
      for (const s of SYMS) {
        if (same(apply(s, o.w), w) && same(apply(s, o.b), b)) return { group: o.group, no: o.no, name: o.name };
      }
    }
    return null;
  }

  /**
   * Board symmetries (about the centre) that map every stone in `stones` onto a stone of the same colour.
   * stones = [{x, y, color}], y TOP-DOWN (the group is closed under the y-flip, so no conversion needed).
   * Returns functions (x, y) → {x, y}; the identity is always included. (#427 "no symmetric 5th offers")
   */
  function fixingSymmetries(stones, size) {
    const c = Math.floor(size / 2);
    const key = (x, y) => x + ',' + y;
    const at = new Map(stones.map((s) => [key(s.x, s.y), s.color]));
    const out = [];
    for (const m of SYMS) {
      const f = (x, y) => { const [dx, dy] = apply(m, [x - c, y - c]); return { x: c + dx, y: c + dy }; };
      if (stones.every((s) => { const p = f(s.x, s.y); return at.get(key(p.x, p.y)) === s.color; })) out.push(f);
    }
    return out;
  }

  /** True when `cand` equals an offer in `offers`, or is mapped onto one by a symmetry fixing `stones`. */
  function isSymmetricOffer(cand, offers, stones, size) {
    const syms = fixingSymmetries(stones, size);
    return offers.some((o) => syms.some((f) => { const p = f(cand.x, cand.y); return p.x === o.x && p.y === o.y; }));
  }

  return { OPENINGS, detectOpening, fixingSymmetries, isSymmetricOffer };
}));
