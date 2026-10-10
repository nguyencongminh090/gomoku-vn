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

  return { LETTERS, label, number, parse, parseList };
}));
