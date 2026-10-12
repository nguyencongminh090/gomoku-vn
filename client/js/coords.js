'use strict';

/**
 * coords.js — move-coordinate notations for puzzles (TODO.md #203).
 *
 * UMD, pure (no DOM): `require()`-able from Node and attaches to `globalThis.Coords` in the browser.
 * Ported from GomokuBoardSite/js/coords.js (`label`, `sequence`). Cells are {x, y}, y TOP-DOWN.
 *
 *   letter   `H8`   column letter A.. + row number, row 1 at the BOTTOM  (y = size - row)
 *   number   `122`  reading order, each row starting at the next multiple of 10 + 1
 *                   (size 15: 1-15, 21-35, 41-55 …; tens digit = row), row 1 at the TOP
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Coords = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /** Letter label of a cell, e.g. (7, 7, 15) → 'H8'. */
  function label(x, y, size) {
    return LETTERS[x] + (size - y);
  }

  const stride = (size) => Math.ceil(size / 10) * 10;

  /** Number of a cell in `sequence` order, e.g. (1, 6, 15) → 122. */
  function number(x, y, size) {
    return y * stride(size) + x + 1;
  }

  /** @returns {{x:number,y:number}|null} null when the text is not a cell of a size×size board. */
  function parse(text, size) {
    const s = String(text == null ? '' : text).trim().toUpperCase();
    let m = /^([A-Z])\s*(\d{1,2})$/.exec(s);
    if (m) {
      const x = LETTERS.indexOf(m[1]);
      const row = parseInt(m[2], 10);
      if (x < 0 || x >= size || row < 1 || row > size) return null;
      return { x, y: size - row };
    }
    m = /^(\d{1,4})$/.exec(s);
    if (m) {
      const n = parseInt(m[1], 10) - 1;
      if (n < 0) return null;
      const y = Math.floor(n / stride(size));
      const x = n % stride(size);
      if (x >= size || y >= size) return null;
      return { x, y };
    }
    return null;
  }

  /**
   * Parse a list of cells separated by commas, semicolons or whitespace ("H8, J9" / "122 133").
   * @returns {Array<{x:number,y:number}>|null} null if empty or any item is invalid.
   */
  function parseList(text, size) {
    const parts = String(text == null ? '' : text).split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return null;
    const out = [];
    for (const p of parts) {
      const c = parse(p, size);
      if (!c) return null;
      out.push(c);
    }
    return out;
  }

  const KEYWORDS = [
    [/^(black|đen|den|b|x)$/i, 'BLACK'], [/^(white|trắng|trang|w|o)$/i, 'WHITE'],
    [/^(wall|walls|tường|tuong)$/i, 'WALL'], [/^(portal|portals|cổng|cong)$/i, 'PORTAL'],
  ];

  /**
   * Free-form setup text → stones / walls / portals. Any text works as long as it holds coordinates
   * ("h8", "H 8", "(i9)", "1. h8 i9 h10"). A keyword (black/white/x/o/b/w, wall/tường, portal/cổng)
   * sets the kind of the coordinates after it; with no keyword stones alternate black, white, …
   * Portals pair up consecutive cells. Coordinates off the board are listed in `bad`.
   * @returns {{stones:Array, walls:Array, portals:Array, bad:string[]}}
   */
  function parseSetup(text, size) {
    const out = { stones: [], walls: [], portals: [], bad: [] };
    const seen = new Set();
    let kind = null;      // null = alternate
    let alt = 0;
    let pending = null;
    const re = /([A-Za-zÀ-ỹ]+)(\s*)(\d{1,2})?/g;
    const src = String(text == null ? '' : text);
    let m;
    while ((m = re.exec(src))) {
      const [, word, gap, digits] = m;
      const kw = KEYWORDS.find(([rx]) => rx.test(word));
      // "h8" is always a cell; "h 8" is a cell unless the letter is a keyword (b/w/x/o); longer words are keywords or noise.
      const isCell = word.length === 1 && digits !== undefined && (gap === '' || !kw);
      if (!isCell) {
        if (kw) { kind = kw[1]; pending = null; }
        continue;
      }
      const label = word.toUpperCase() + digits;
      const c = parse(label, size);
      if (!c) { out.bad.push(label); continue; }
      const key = c.x + ',' + c.y;
      if (seen.has(key)) continue;
      seen.add(key);
      if (kind === 'WALL') out.walls.push(c);
      else if (kind === 'PORTAL') {
        if (pending) { out.portals.push({ a: pending, b: c }); pending = null; } else pending = c;
      } else {
        out.stones.push({ x: c.x, y: c.y, color: kind || (alt++ % 2 === 0 ? 'BLACK' : 'WHITE') });
      }
    }
    if (pending) out.bad.push(LETTERS[pending.x] + (size - pending.y));
    return out;
  }

  return { LETTERS, label, number, parse, parseList, parseSetup };
}));
