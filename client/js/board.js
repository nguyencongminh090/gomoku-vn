/**
 * board.js — SVG board renderer + shared board-look preferences (TODO.md #216).
 *
 * Ported from GomokuBoardSite (js/board.js, settings.js, contrast.js, coords.js):
 *   - one geometry for both looks: an n×n grid of positions with pitch P;
 *     "paper" draws cells around each position (X / O symbols), "stone" draws
 *     lines through them (black / white stones on a wooden board);
 *   - colour presets chosen to meet WCAG 2.2 AA on their own background;
 *   - coordinates either on the edges (A–Z, 1–N) or as numbers inside cells.
 *
 * Every board on the site (room, tournament match, replay, puzzle, puzzle editor,
 * puzzle review, /diag) renders from ONE store, `window.BoardPrefs`, edited only
 * in Settings › Giao diện › Bàn cờ. A change fires `boardprefschange` on window
 * (and `storage` from other tabs), and every live renderer redraws.
 *
 * Public renderer API is unchanged from the canvas version, so callers did not
 * change: new BoardRenderer(el, { boardSize, onCellClick, clickMode }),
 * setState(), resize(), setOptimisticStone(), markOptimisticWarning(),
 * clearPending(), plus the fields interactive / isMyTurn / myColor / boardSize.
 * Passing a <canvas> still works: it is swapped in place for an <svg> that keeps
 * its id and class.
 *
 * Board values: 0 empty, 1 black (X), 2 white (O), -1 wall, -2 portal.
 */

'use strict';

(function (root) {
  // ─── Preferences ───────────────────────────────────────────────────────────

  const PREFS_KEY = 'play3cr_board_prefs';
  const LEGACY_THEME_KEY = 'play3cr_board_display'; // pre-#216 Paper/Stone choice; kept in sync

  // Each preset's symbol and line colours meet WCAG 2.2 AA on its own background
  // (client/tests/board-prefs.test.js audits them). Stones stay black and white.
  const PRESETS = {
    paper: [
      { id: 'white', bg: '#ffffff', grid: '#c9d3df', xColor: '#d6383a', oColor: '#2764d1' },
      { id: 'cream', bg: '#fbf8f1', grid: '#c3cedb', xColor: '#c8322f', oColor: '#1f5bc4' },
      { id: 'notebook', bg: '#eef4ff', grid: '#94b3e0', xColor: '#c21d3a', oColor: '#1e3a8a' },
      { id: 'kraft', bg: '#e7d3ad', grid: '#b39463', xColor: '#9b1c1c', oColor: '#1f3b73' },
      { id: 'chalk', bg: '#22302a', grid: '#4d6a5d', xColor: '#ffd166', oColor: '#8ecdf5' },
    ],
    stone: [
      { id: 'kaya', bg: '#dcb35c', line: '#3a2a12' },
      { id: 'pale', bg: '#ecd8a4', line: '#4a3a1c' },
      { id: 'walnut', bg: '#c38952', line: '#24160a' },
      { id: 'slate', bg: '#9ea9ae', line: '#232d33' },
      { id: 'felt', bg: '#8fc19f', line: '#16301f' },
    ],
  };
  const WALL = { paper: '#4b4f58', stone: '#3b3f46' };
  const PAPER_STYLES = ['classic', 'bold', 'hand'];
  const STONE_STYLES = ['glossy', 'flat'];
  const HEX = /^#[0-9a-f]{6}$/i;

  function presetColors(theme, id) {
    const p = PRESETS[theme].find(x => x.id === id) || PRESETS[theme][theme === 'paper' ? 1 : 0];
    const { id: _id, ...colors } = p;
    return colors;
  }

  function defaults() {
    let theme = 'paper';
    try { if (localStorage.getItem(LEGACY_THEME_KEY) === 'stone') theme = 'stone'; } catch (e) { /* private mode */ }
    return {
      theme,
      paperPreset: 'cream',
      stonePreset: 'kaya',
      paper: { ...presetColors('paper', 'cream'), style: 'classic' },
      stone: { ...presetColors('stone', 'kaya'), style: 'glossy' },
      coords: 'edge', // 'edge' | 'cell'
      showLastMove: true,
      showMoveNumbers: false,
    };
  }

  // Keeps only known keys with valid values, so a corrupt or old blob can't break a board.
  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const out = { ...d };
    if (raw.theme === 'paper' || raw.theme === 'stone') out.theme = raw.theme;
    if (raw.coords === 'edge' || raw.coords === 'cell') out.coords = raw.coords;
    if (typeof raw.showLastMove === 'boolean') out.showLastMove = raw.showLastMove;
    if (typeof raw.showMoveNumbers === 'boolean') out.showMoveNumbers = raw.showMoveNumbers;
    for (const theme of ['paper', 'stone']) {
      const key = theme + 'Preset';
      if (raw[key] === 'custom' || PRESETS[theme].some(p => p.id === raw[key])) out[key] = raw[key];
      const src = raw[theme] || {};
      const dst = { ...d[theme], ...presetColors(theme, out[key]) };
      for (const k of Object.keys(dst)) {
        if (k === 'style') continue;
        if (HEX.test(src[k] || '')) dst[k] = src[k].toLowerCase();
      }
      const styles = theme === 'paper' ? PAPER_STYLES : STONE_STYLES;
      dst.style = styles.includes(src.style) ? src.style : styles[0];
      out[theme] = dst;
    }
    return out;
  }

  let cache = null;
  function read() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) { raw = null; }
    return sanitize(raw);
  }

  const BoardPrefs = {
    PRESETS,
    PAPER_STYLES,
    STONE_STYLES,
    get() {
      if (!cache) cache = read();
      return cache;
    },
    /** Shallow patch; `paper` / `stone` sub-objects merge. Picking a preset copies its colours. */
    set(patch) {
      const cur = BoardPrefs.get();
      const next = { ...cur, ...patch };
      for (const theme of ['paper', 'stone']) {
        next[theme] = { ...cur[theme], ...(patch[theme] || {}) };
        const key = theme + 'Preset';
        if (patch[key] && patch[key] !== 'custom') Object.assign(next[theme], presetColors(theme, patch[key]));
        else if (patch[theme] && Object.keys(patch[theme]).some(k => k !== 'style')) next[key] = 'custom';
      }
      cache = sanitize(next);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(cache));
        localStorage.setItem(LEGACY_THEME_KEY, cache.theme);
      } catch (e) { /* private mode: still applies for this page */ }
      root.dispatchEvent(new CustomEvent('boardprefschange', { detail: cache }));
      return cache;
    },
    reset() {
      try { localStorage.removeItem(PREFS_KEY); } catch (e) { /* ignore */ }
      cache = null;
      root.dispatchEvent(new CustomEvent('boardprefschange', { detail: BoardPrefs.get() }));
      return cache;
    },
    /** Quiet WCAG audit of the active look: only the failing items. */
    problems(prefs) { return Contrast.audit(prefs || BoardPrefs.get()).filter(i => !i.ok && !i.advisory); },
  };

  // Another tab changed the look → same live update here. Replaces any listener from an
  // earlier evaluation of this file, so a double load never fires the event twice.
  if (root.__boardPrefsStorage) root.removeEventListener('storage', root.__boardPrefsStorage);
  root.__boardPrefsStorage = (e) => {
    if (e.key !== PREFS_KEY) return;
    cache = null;
    root.dispatchEvent(new CustomEvent('boardprefschange', { detail: BoardPrefs.get() }));
  };
  root.addEventListener('storage', root.__boardPrefsStorage);

  // ─── WCAG 2.2 contrast (port of GomokuBoardSite js/contrast.js) ────────────

  const Contrast = (function () {
    // 1.4.11 non-text (symbols, lines, walls) · 1.4.3 text (coordinates). Grid is advisory.
    const MIN = { graphic: 3, text: 4.5, grid: 1.4 };
    const SUGGEST_MARGIN = 1.15;
    const INK_ALPHA = { edge: 0.7, cellPaper: 0.72, cellStone: 0.85 };
    const BLACK_STONE = '#151515';

    const parse = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const toHex = (rgb) => '#' + rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');
    function luminance(rgb) {
      const [r, g, b] = rgb.map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function ratio(a, b) {
      const la = luminance(typeof a === 'string' ? parse(a) : a);
      const lb = luminance(typeof b === 'string' ? parse(b) : b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    const blend = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
    function ink(bgHex) {
      const bg = parse(bgHex);
      return ratio([0, 0, 0], bg) >= ratio([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
    }
    const textRatio = (bgHex, alpha) => { const bg = parse(bgHex); return ratio(blend(ink(bgHex), alpha, bg), bg); };
    function rgbToHsl([r, g, b]) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
      if (max === min) return [0, 0, l];
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [h / 6, s, l];
    }
    function hslToRgb([h, s, l]) {
      if (s === 0) return [l * 255, l * 255, l * 255];
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const hue = (t) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
      return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
    }
    // Closest colour of the same hue/saturation (lightness only) that passes `meets`.
    function suggest(hex, meets) {
      const [h, s, l] = rgbToHsl(parse(hex));
      for (let step = 1; step <= 100; step++) {
        for (const sign of [-1, 1]) {
          const l2 = l + (sign * step) / 100;
          if (l2 < 0 || l2 > 1) continue;
          const c = toHex(hslToRgb([h, s, l2]));
          if (meets(c)) return c;
        }
      }
      return null;
    }
    const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
    // [{ key: 'paper.oColor', what, ratio, min, ok, advisory, suggestion }]
    function audit(s) {
      const paper = s.theme === 'paper';
      const bgKey = paper ? 'paper.bg' : 'stone.bg';
      const bg = get(s, bgKey);
      const items = [];
      const add = (key, what, value, min, meets, advisory = false) => {
        const ok = value >= min;
        items.push({ key, what, ratio: value, min, ok, advisory, suggestion: ok ? null : suggest(get(s, key), meets(min * SUGGEST_MARGIN)) });
      };
      const against = (target) => (c) => ratio(c, bg) >= target;
      if (paper) {
        add('paper.xColor', 'x', ratio(s.paper.xColor, bg), MIN.graphic, against);
        add('paper.oColor', 'o', ratio(s.paper.oColor, bg), MIN.graphic, against);
        add('paper.grid', 'grid', ratio(s.paper.grid, bg), MIN.grid, against, true);
      } else {
        add('stone.line', 'line', ratio(s.stone.line, bg), MIN.graphic, against);
        add('stone.bg', 'blackStone', ratio(BLACK_STONE, bg), MIN.graphic, (t) => (c) => ratio(BLACK_STONE, c) >= t);
      }
      const alpha = s.coords === 'cell' ? (paper ? INK_ALPHA.cellPaper : INK_ALPHA.cellStone) : INK_ALPHA.edge;
      add(bgKey, 'labels', textRatio(bg, alpha), MIN.text, (t) => (c) => textRatio(c, alpha) >= t);
      return items;
    }
    return { MIN, INK_ALPHA, ratio, ink, textRatio, suggest, audit };
  })();

  // ─── Coordinates ───────────────────────────────────────────────────────────

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const spiralCache = new Map();
  // Numbers every cell 1..n², spiralling clockwise out from the centre. Indexed y*n+x.
  function spiral(n) {
    if (spiralCache.has(n)) return spiralCache.get(n);
    const nums = new Array(n * n).fill(0);
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let x = Math.floor((n - 1) / 2), y = x, k = 1;
    const put = () => { if (x >= 0 && y >= 0 && x < n && y < n) nums[y * n + x] = k++; };
    put();
    for (let len = 1, d = 0; k <= n * n; len++) {
      for (let leg = 0; leg < 2; leg++, d = (d + 1) % 4) {
        for (let i = 0; i < len; i++) { x += dirs[d][0]; y += dirs[d][1]; put(); }
      }
    }
    spiralCache.set(n, nums);
    return nums;
  }

  // ─── SVG primitives ────────────────────────────────────────────────────────

  const P = 40;
  const f = (n) => Math.round(n * 10) / 10;
  const PORTAL_COLORS = [[51, 179, 242], [230, 102, 153], [77, 204, 102], [242, 153, 51], [166, 89, 217], [51, 191, 179], [217, 191, 51], [217, 64, 64]];
  const portalRgb = (i, a = 1) => `rgba(${PORTAL_COLORS[i % PORTAL_COLORS.length].join(',')},${a})`;
  const LAST = '#e0342f';
  const PENDING = '#2f7d4f';
  const WIN = '#e74c3c';

  // Small deterministic PRNG so hand-drawn pieces keep their shape between renders.
  function rng(seed) {
    let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  // Smooth curve through points (Catmull-Rom as cubic Béziers).
  function smooth(pts) {
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
        `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }
  function cross(cx, cy, color, style, seed) {
    const r = P * 0.28;
    if (style === 'hand') {
      const rnd = rng(seed);
      const j = (a) => (rnd() - 0.5) * a;
      const stroke = (x1, y1, x2, y2) => {
        const bow = (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 4);
        const mx = (x1 + x2) / 2 + bow + j(3), my = (y1 + y2) / 2 - bow + j(3);
        return `M${f(x1 + j(5))} ${f(y1 + j(5))}Q${f(mx)} ${f(my)} ${f(x2 + j(6))} ${f(y2 + j(6))}`;
      };
      return `<path d="${stroke(cx - r, cy - r, cx + r, cy + r)}${stroke(cx + r, cy - r, cx - r, cy + r)}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
    }
    const w = style === 'bold' ? 6.5 : 3.6;
    return `<path d="M${f(cx - r)} ${f(cy - r)}L${f(cx + r)} ${f(cy + r)}M${f(cx + r)} ${f(cy - r)}L${f(cx - r)} ${f(cy + r)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  function ring(cx, cy, color, style, seed) {
    const r = P * 0.29;
    if (style === 'hand') {
      const rnd = rng(seed);
      const start = rnd() * Math.PI * 2, sweep = Math.PI * 2 + 0.5 + rnd() * 0.4, pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = start + (sweep * i) / 12;
        const rr = r * (1 + (rnd() - 0.5) * 0.14) * (i === 12 ? 0.9 : 1);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
      }
      return `<path d="${smooth(pts)}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
    }
    const w = style === 'bold' ? 6.2 : 3.6;
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
  }
  function stoneSvg(white, cx, cy, style, uid) {
    const r = P * 0.46;
    if (style === 'flat') {
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${white ? '#f7f7f4' : '#151515'}" stroke="#151515" stroke-width="1.6"/>`;
    }
    return `<circle cx="${f(cx + 1)}" cy="${f(cy + 2)}" r="${f(r)}" fill="#000" opacity=".28"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${white ? 'gW' : 'gB'}${uid})"${white ? ' stroke="rgba(0,0,0,.22)" stroke-width="1"' : ''}/>`;
  }
  // value: 1 black (X), 2 white (O)
  function pieceSvg(value, cx, cy, s, seed, uid) {
    if (s.theme === 'stone') return stoneSvg(value === 2, cx, cy, s.stone.style, uid);
    return value === 1 ? cross(cx, cy, s.paper.xColor, s.paper.style, seed) : ring(cx, cy, s.paper.oColor, s.paper.style, seed);
  }
  function defsSvg(s, uid) {
    const wall = s.theme === 'paper' ? WALL.paper : WALL.stone;
    return `<defs>` +
      `<radialGradient id="gB${uid}" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#6e6e6e"/><stop offset=".35" stop-color="#262626"/><stop offset="1" stop-color="#050505"/></radialGradient>` +
      `<radialGradient id="gW${uid}" cx="36%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#ececea"/><stop offset="1" stop-color="#b9b9b4"/></radialGradient>` +
      `<linearGradient id="gS${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>` +
      `<pattern id="pH${uid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${wall}"/><rect width="2.5" height="7" fill="#000" fill-opacity=".3"/></pattern>` +
      `</defs>`;
  }
  function starPoints(n) {
    if (n < 9) return [];
    const a = n >= 13 ? 3 : 2, b = n - 1 - a;
    const pts = [[a, a], [a, b], [b, a], [b, b]];
    if (n % 2) pts.push([(n - 1) / 2, (n - 1) / 2]);
    return pts;
  }

  /** A small square swatch of a look (paper or stone), for preset pickers. */
  function previewSvg(theme, colors) {
    const body = theme === 'paper'
      ? `<path d="M0 20H40M20 0V40" stroke="${colors.grid}"/>` + cross(10, 10, colors.xColor, 'classic', 1).replace(/stroke-width="3.6"/, 'stroke-width="3"') +
        `<circle cx="30" cy="30" r="6.5" fill="none" stroke="${colors.oColor}" stroke-width="3"/>`
      : `<path d="M10 0V40M30 0V40M0 10H40M0 30H40" stroke="${colors.line}"/><circle cx="10" cy="10" r="7.5" fill="#151515"/><circle cx="30" cy="30" r="7.5" fill="#f4f4f0" stroke="rgba(0,0,0,.25)"/>`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect width="40" height="40" fill="${colors.bg}"/>${body}</svg>`;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let uidSeq = 0;
  const compactScreen = () => (root.innerWidth || 1024) <= 768;

  // ─── Renderer ──────────────────────────────────────────────────────────────

  class BoardRenderer {
    /**
     * @param {SVGSVGElement|HTMLCanvasElement} el — a <canvas> is replaced by an <svg> in place
     * @param {{ boardSize?: number, onCellClick?: (x:number, y:number) => void,
     *           clickMode?: 'single'|'double', prefs?: object }} opts
     *   `prefs` pins a look (settings preview); otherwise BoardPrefs is followed live.
     */
    constructor(el, opts = {}) {
      let svg = el;
      if (!el || el.namespaceURI !== SVG_NS) {
        svg = document.createElementNS(SVG_NS, 'svg');
        if (el) {
          if (el.id) svg.id = el.id;
          if (el.getAttribute('class')) svg.setAttribute('class', el.getAttribute('class'));
          if (el.parentNode) el.parentNode.replaceChild(svg, el);
        }
      }
      svg.classList.add('gboard');
      // One tab stop; arrows move a cursor, Enter/Space selects (#326). `application` so a screen
      // reader passes the keys through instead of announcing a picture.
      svg.setAttribute('role', 'application');
      svg.style.touchAction = 'none';
      svg.style.display = 'block';
      svg.style.userSelect = 'none';
      this.svg = svg;
      this.canvas = svg; // legacy name some callers read
      this.uid = 'b' + (++uidSeq);

      this.boardSize = opts.boardSize || 17;
      this.onCellClick = opts.onCellClick || null;
      this.clickMode = opts.clickMode || 'double';
      this.clickOccupied = !!opts.clickOccupied;
      this._pinnedPrefs = opts.prefs || null;

      this.board = null;
      this.walls = [];
      this.portals = [];
      this.firstMoveZones = [];
      this.showZones = false;
      this.lastMove = null;
      this.winLine = null;
      this.moveHistory = [];
      this.isMyTurn = false;
      this.interactive = false;
      this.myColor = null;
      this.displayMode = this.prefs.theme; // read-only mirror for old callers

      this._hoverCell = null;
      this._pendingCell = null;
      this.optimisticStone = null;
      this.geo = null; // { m, n, W, vx, vy, VW, VH }

      // A page that builds a new renderer on the same element (puzzle.js, per puzzle)
      // must not leave the previous handlers attached: one click would place twice.
      if (svg.__gboard) svg.__gboard.destroy();
      svg.__gboard = this;
      this._handlers = {
        pointermove: (e) => this._onMouseMove(e),
        pointerleave: () => this._onMouseLeave(),
        click: (e) => this._onClick(e),
        touchend: (e) => this._onTouchEnd(e),
        keydown: (e) => this._onKey(e),
        blur: () => this._onBlur(),
      };
      for (const [ev, fn] of Object.entries(this._handlers)) svg.addEventListener(ev, fn);

      if (!this._pinnedPrefs) {
        this._onPrefs = () => { this.displayMode = this.prefs.theme; this._draw(); };
        root.addEventListener('boardprefschange', this._onPrefs);
      }
      // Redraw on container size changes (rAF-gated, never per move — see #90).
      if (typeof ResizeObserver === 'function' && svg.parentElement) {
        let pending = false;
        this._ro = new ResizeObserver(() => {
          if (pending) return;
          pending = true;
          requestAnimationFrame(() => { pending = false; this.resize(); });
        });
        this._ro.observe(svg.parentElement);
      }
    }

    get prefs() { return this._pinnedPrefs || BoardPrefs.get(); }

    /** Settings preview: swap the pinned look and redraw. */
    setPrefs(prefs) { this._pinnedPrefs = prefs; this.displayMode = prefs.theme; this._draw(); }

    setOptimisticStone(stone) { this.optimisticStone = stone; this._drawOverlay(); }

    markOptimisticWarning() {
      if (!this.optimisticStone) return;
      this.optimisticStone = Object.assign({}, this.optimisticStone, { warning: true });
      this._drawOverlay();
    }

    setState(s) {
      if (s.boardSize !== undefined) this.boardSize = s.boardSize;
      if (s.board !== undefined) this.board = s.board;
      if (s.walls !== undefined) this.walls = s.walls;
      if (s.portals !== undefined) this.portals = s.portals;
      if (s.firstMoveZones !== undefined) this.firstMoveZones = s.firstMoveZones;
      if (s.showZones !== undefined) this.showZones = s.showZones;
      if (s.winLine !== undefined) this.winLine = s.winLine;
      if (s.moveHistory !== undefined) this.moveHistory = s.moveHistory || [];
      if (s.lastMove !== undefined) this.lastMove = s.lastMove;
      if (s.isMyTurn !== undefined) this.isMyTurn = s.isMyTurn;
      if (s.interactive !== undefined) {
        this.interactive = s.interactive;
        if (this.interactive) this.svg.setAttribute('tabindex', '0');
        else { this.svg.removeAttribute('tabindex'); this._kbCell = null; }
      }
      if (s.myColor !== undefined) this.myColor = s.myColor;
      // s.displayMode is ignored: the look comes from BoardPrefs (#216).
      this._draw();
    }

    /**
     * Size the SVG square to its container. The container's own box decides:
     * a fixed-height container (room desktop) fits both axes; an auto-height one
     * (phones, simple pages) fits the width, capped by the viewport height on desktop.
     */
    resize() {
      const svg = this.svg;
      const parent = svg.parentElement;
      if (!parent) { this._draw(); return; }
      const prev = svg.style.display;
      svg.style.display = 'none'; // measure the container without the board inflating it
      const cs = getComputedStyle(parent);
      const w = parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      let h = parent.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      svg.style.display = prev || 'block';
      let size = w;
      if (h > 40) size = Math.min(w, h);
      else if (!compactScreen()) {
        const top = Math.max(parent.getBoundingClientRect().top, 0);
        size = Math.min(w, (root.innerHeight || w) - top - 16);
      }
      size = Math.max(Math.floor(size), 160);
      if (!(size > 0) || !isFinite(size)) { this._draw(); return; }
      // Make one cell a whole number of device pixels (as the reference board does):
      // with crispEdges every grid line then rounds the same way, so no line renders
      // thicker than its neighbours.
      const g = this._computeGeometry();
      const dpr = root.devicePixelRatio || 1;
      const q = Math.floor((size * dpr * P) / g.VW);
      if (q >= 8) size = (g.VW * q) / P / dpr;
      svg.style.width = size + 'px';
      svg.style.height = size + 'px';
      this.cssSize = size;
      this._draw();
    }

    clearPending() { this._pendingCell = null; this._drawOverlay(); }

    // ── Geometry ──
    _computeGeometry() {
      const n = this.boardSize;
      const edge = this.prefs.coords !== 'cell';
      const compact = compactScreen();
      const m = compact ? (edge ? 26 : 2) : (edge ? 34 : 12);
      const W = 2 * m + n * P;
      // Phones label only the left and bottom edges; crop the unlabelled margins to a hairline.
      const cut = compact && edge ? m - 2 : 0;
      this.geo = { m, n, W, vx: 0, vy: cut, VW: W - cut, VH: W - cut, edge, compact };
      return this.geo;
    }

    _center(i) { return this.geo.m + (i + 0.5) * P; }

    _cellFromClient(clientX, clientY) {
      const g = this.geo;
      if (!g) return null;
      const rect = this.svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const ux = g.vx + (clientX - rect.left) * (g.VW / rect.width);
      const uy = g.vy + (clientY - rect.top) * (g.VH / rect.height);
      const x = Math.floor((ux - g.m) / P);
      const y = Math.floor((uy - g.m) / P);
      return x >= 0 && y >= 0 && x < g.n && y < g.n ? { x, y } : null;
    }

    _isEmpty(c) { return !!(c && this.board && this.board[c.y] && this.board[c.y][c.x] === 0); }

    // ── Events ──
    _onMouseMove(e) {
      if (e.pointerType === 'touch') return;
      if (!this.interactive || !this.isMyTurn) {
        if (this._hoverCell) { this._hoverCell = null; this._drawOverlay(); }
        return;
      }
      this._kbCell = null; // the pointer takes over: Enter must act on the cell that is drawn
      const cell = this._cellFromClient(e.clientX, e.clientY);
      const prev = this._hoverCell;
      if ((!prev && !cell) || (prev && cell && prev.x === cell.x && prev.y === cell.y)) return;
      this._hoverCell = cell;
      this._drawOverlay();
    }

    _onMouseLeave() {
      this._kbCell = null;
      if (this._hoverCell) { this._hoverCell = null; this._drawOverlay(); }
    }

    _onClick(e) {
      if (!this.interactive || !this.isMyTurn || !this.onCellClick) return;
      const cell = this._cellFromClient(e.clientX, e.clientY);
      if (this._clickable(cell)) this._handleCellSelect(cell.x, cell.y);
    }

    _onTouchEnd(e) {
      // First, before any guard: stops the synthetic click/zoom/keyboard (#104).
      e.preventDefault();
      if (!this.interactive || !this.isMyTurn || !this.onCellClick) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const cell = this._cellFromClient(t.clientX, t.clientY);
      if (this._clickable(cell)) this._handleCellSelect(cell.x, cell.y);
    }

    // Keyboard path (#326): the cursor is the hover cell; selecting goes through the same
    // _handleCellSelect as a click, so legality / pending / optimistic logic stays in one place.
    _onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const n = this.boardSize;
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) {
        e.preventDefault();
        if (!this.interactive) return;
        const c = this._kbCell || { x: (n - 1) >> 1, y: (n - 1) >> 1 };
        const first = !this._kbCell;
        const nx = first ? c.x : Math.min(n - 1, Math.max(0, c.x + d[0]));
        const ny = first ? c.y : Math.min(n - 1, Math.max(0, c.y + d[1]));
        this._kbCell = { x: nx, y: ny };
        this._hoverCell = this._kbCell;
        this._drawOverlay();
        this._announce(this._cellName(nx, ny) + (!this._clickable(this._kbCell) ? ' occupied' : this.isMyTurn ? '' : ' not your turn'));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!this._kbCell || !this.interactive || !this.isMyTurn || !this.onCellClick) return;
        if (this._clickable(this._kbCell)) this._handleCellSelect(this._kbCell.x, this._kbCell.y);
      } else if (e.key === 'Escape') {
        this._kbCell = null;
        this._pendingCell = null;
        this._hoverCell = null;
        this._drawOverlay();
        this.svg.blur();
      }
    }

    _onBlur() {
      if (!this._kbCell) return;
      this._kbCell = null;
      this._hoverCell = null;
      this._drawOverlay();
    }

    _cellName(x, y) { return LETTERS[x] + (this.boardSize - y); }

    // Visually hidden live region next to the board (created lazily).
    _announce(text) {
      if (!this._live) {
        const el = document.createElement('div');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
        if (this.svg.parentNode) this.svg.parentNode.insertBefore(el, this.svg.nextSibling);
        this._live = el;
      }
      this._live.textContent = text;
    }

    // Editors (puzzle authoring) set clickOccupied to erase / replace pieces.
    _clickable(c) { return this.clickOccupied ? !!(c && this.board && this.board[c.y]) : this._isEmpty(c); }

    _handleCellSelect(x, y) {
      if (this.clickMode === 'single') {
        this._pendingCell = null;
        this.onCellClick(x, y);
        return;
      }
      if (this._pendingCell && this._pendingCell.x === x && this._pendingCell.y === y) {
        this._pendingCell = null;
        this.onCellClick(x, y);
      } else {
        this._pendingCell = { x, y };
      }
      this._drawOverlay();
    }

    // ── Drawing ──
    _draw() {
      const s = this.prefs;
      const g = this._computeGeometry();
      const { m, n, W, edge, compact } = g;
      const paper = s.theme === 'paper';
      const c = (i) => this._center(i);
      const bg = paper ? s.paper.bg : s.stone.bg;
      const inkRgb = Contrast.ink(bg)[0] ? '255,255,255' : '0,0,0';
      const A = Contrast.INK_ALPHA;
      const uid = this.uid;
      const out = [defsSvg(s, uid)];

      this.svg.setAttribute('viewBox', `${g.vx} ${g.vy} ${g.VW} ${g.VH}`);
      this.svg.setAttribute('aria-label', `${n}×${n}`);
      const rx = 0; // square frame on every screen
      out.push(`<rect width="${W}" height="${W}" rx="${rx}" fill="${bg}"/>`);
      if (!paper) out.push(`<rect width="${W}" height="${W}" rx="${rx}" fill="url(#gS${uid})"/>`);

      // Grid: paper = n+1 cell borders, stone = n lines through the centres. Outer lines bolder.
      const count = paper ? n + 1 : n;
      const base = paper ? m : c(0);
      const end = base + (count - 1) * P;
      const lines = [];
      for (let i = 0; i < count; i++) {
        const v = base + i * P;
        const sw = i === 0 || i === count - 1 ? 2 : 1;
        lines.push(`<line x1="${v}" y1="${base}" x2="${v}" y2="${end}" stroke-width="${sw}"/><line x1="${base}" y1="${v}" x2="${end}" y2="${v}" stroke-width="${sw}"/>`);
      }
      out.push(`<g stroke="${paper ? s.paper.grid : s.stone.line}" shape-rendering="crispEdges" vector-effect="non-scaling-stroke">${lines.join('')}</g>`);
      if (!paper) out.push(`<g fill="${s.stone.line}">${starPoints(n).map(([x, y]) => `<circle cx="${c(x)}" cy="${c(y)}" r="3.6"/>`).join('')}</g>`);

      const board = this.board;
      const at = (x, y) => (board && board[y] ? board[y][x] : 0);

      // Coordinates
      if (edge) {
        const t = [];
        for (let i = 0; i < n; i++) {
          const L = LETTERS[i], num = n - i;
          t.push(`<text x="${c(i)}" y="${W - m / 2}">${L}</text><text x="${m / 2}" y="${c(i)}">${num}</text>`);
          if (!compact) t.push(`<text x="${c(i)}" y="${m / 2}">${L}</text><text x="${W - m / 2}" y="${c(i)}">${num}</text>`);
        }
        out.push(`<g fill="rgba(${inkRgb},${A.edge})" font-size="${compact ? 18 : 14}" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="Nunito,system-ui,sans-serif">${t.join('')}</g>`);
      } else {
        const nums = spiral(n), t = [];
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          if (at(x, y) !== 0) continue;
          t.push(`<text x="${c(x)}" y="${c(y)}">${nums[y * n + x]}</text>`);
        }
        const size = compact ? 16 : (n * n >= 100 ? 12 : 14);
        const halo = paper ? '' : ` stroke="${bg}" stroke-width="5" paint-order="stroke"`;
        out.push(`<g fill="rgba(${inkRgb},${paper ? A.cellPaper : A.cellStone})" font-size="${size}" text-anchor="middle" dominant-baseline="central" font-family="Nunito,system-ui,sans-serif"${halo}>${t.join('')}</g>`);
      }

      // First-move zones (behind everything placed)
      if (this.showZones && this.firstMoveZones && this.firstMoveZones.length) {
        out.push(`<g fill="rgba(100,180,100,.25)">${this.firstMoveZones.map(z => `<rect x="${m + z.x * P + 1}" y="${m + z.y * P + 1}" width="${P - 2}" height="${P - 2}"/>`).join('')}</g>`);
      }

      // Last move (paper: tinted cell under the piece)
      const last = this.lastMove;
      if (last && s.showLastMove && paper) {
        const v = at(last.x, last.y);
        const col = v === 2 ? s.paper.oColor : s.paper.xColor;
        out.push(`<rect x="${m + last.x * P + 1}" y="${m + last.y * P + 1}" width="${P - 2}" height="${P - 2}" fill="${col}" opacity=".16"/>`);
      }

      // Winning line (under pieces)
      if (this.winLine && this.winLine.length) {
        out.push(`<g fill="${WIN}" opacity=".38">${this.winLine.map(w => `<rect x="${m + w.x * P + 1}" y="${m + w.y * P + 1}" width="${P - 2}" height="${P - 2}" rx="${paper ? 0 : 6}"/>`).join('')}</g>`);
      }

      // Walls, portals, pieces
      const portalIndex = (x, y) => {
        const ps = this.portals || [];
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          if ((p.a && p.a.x === x && p.a.y === y) || (p.b && p.b.x === x && p.b.y === y)) return i;
        }
        return 0;
      };
      const ink = inkRgb === '255,255,255' ? '#fff' : '#000';
      if (board) {
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const v = at(x, y);
          if (v === 0) continue;
          const x0 = m + x * P, y0 = m + y * P;
          if (v === -1) {
            out.push(paper
              ? `<rect x="${x0 + 1.5}" y="${y0 + 1.5}" width="${P - 3}" height="${P - 3}" fill="url(#pH${uid})"/>`
              : `<rect x="${f(x0 + P * 0.08)}" y="${f(y0 + P * 0.08)}" width="${f(P * 0.84)}" height="${f(P * 0.84)}" rx="5" fill="url(#pH${uid})" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>`);
          } else if (v === -2) {
            const i = portalIndex(x, y), cx = x0 + P / 2, cy = y0 + P / 2, r = P * 0.32, w = P * 0.08;
            out.push((paper ? `<rect x="${x0 + 1}" y="${y0 + 1}" width="${P - 2}" height="${P - 2}" fill="${portalRgb(i, 0.3)}"/>` : '') +
              `<circle cx="${cx}" cy="${cy}" r="${f(r + w)}" fill="${portalRgb(i, 0.25)}"/>` +
              `<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="none" stroke="${ink}" stroke-opacity=".6" stroke-width="${f(w + 2)}"/>` +
              `<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="none" stroke="${portalRgb(i)}" stroke-width="${f(w)}"/>` +
              `<circle cx="${cx}" cy="${cy}" r="${f(P * 0.08)}" fill="#262626"/>`);
          } else if (v === 1 || v === 2) {
            out.push(pieceSvg(v, c(x), c(y), s, y * n + x, uid));
          }
        }
      }

      // Move numbers (last occurrence of each cell in the history)
      if (s.showMoveNumbers && this.moveHistory && this.moveHistory.length && board) {
        const order = new Map();
        this.moveHistory.forEach((mv, i) => { if (mv && Number.isInteger(mv.x) && Number.isInteger(mv.y)) order.set(mv.y * n + mv.x, i + 1); });
        const t = [];
        for (const [k, num] of order) {
          const x = k % n, y = Math.floor(k / n), v = at(x, y);
          if (v !== 1 && v !== 2) continue;
          const isLast = last && last.x === x && last.y === y && s.showLastMove;
          if (paper) {
            t.push(`<text x="${m + x * P + 3}" y="${m + y * P + 3}" font-size="11" dominant-baseline="hanging" fill="${isLast ? LAST : `rgba(${inkRgb},.7)`}">${num}</text>`);
          } else {
            const white = v === 2;
            t.push(`<text x="${c(x)}" y="${c(y)}" text-anchor="middle" dominant-baseline="central" font-size="${num >= 100 ? 13 : 16}" fill="${isLast ? (white ? '#d0201b' : '#ff7a6e') : (white ? '#1a1a1a' : '#f4f4f4')}">${num}</text>`);
          }
        }
        out.push(`<g font-family="Nunito,system-ui,sans-serif" font-weight="700">${t.join('')}</g>`);
      }

      // Last move marker for stones (numbers already mark it otherwise)
      if (last && s.showLastMove && !paper && !s.showMoveNumbers && (at(last.x, last.y) === 1 || at(last.x, last.y) === 2)) {
        out.push(`<circle cx="${c(last.x)}" cy="${c(last.y)}" r="5" fill="${LAST}"/>`);
      }

      out.push(`<g class="gboard__ov"></g>`);
      this.svg.innerHTML = out.join('');
      this._ov = this.svg.querySelector('.gboard__ov');
      this._drawOverlay();
    }

    // Hover / pending / optimistic layer — redrawn alone on pointer moves.
    _drawOverlay() {
      if (!this._ov || !this.geo) return;
      const s = this.prefs;
      const { m } = this.geo;
      const paper = s.theme === 'paper';
      const c = (i) => this._center(i);
      const out = [];
      const mine = this.myColor === 'BLACK' ? 1 : this.myColor === 'WHITE' ? 2 : 0;
      const accent = paper ? (mine === 2 ? s.paper.oColor : s.paper.xColor) : LAST;

      const h = this._hoverCell;
      if (h && this._isEmpty(h) && !(this._pendingCell && this._pendingCell.x === h.x && this._pendingCell.y === h.y)) {
        out.push(paper
          ? `<rect x="${m + h.x * P + 3}" y="${m + h.y * P + 3}" width="${P - 6}" height="${P - 6}" rx="4" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="4 3" opacity=".7"/>`
          : `<circle cx="${c(h.x)}" cy="${c(h.y)}" r="${P * 0.4}" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="4 3" opacity=".7"/>`);
      }
      const k = this._kbCell;
      if (k) { // keyboard cursor: visible on stones too, solid so it differs from the hover ghost
        out.push(`<rect x="${m + k.x * P + 1}" y="${m + k.y * P + 1}" width="${P - 2}" height="${P - 2}" rx="3" fill="none" stroke="${PENDING}" stroke-width="2.5" class="gboard__kbcursor"/>`);
      }
      const pd = this._pendingCell;
      if (pd && this._isEmpty(pd)) {
        if (mine) out.push(`<g opacity=".45">${pieceSvg(mine, c(pd.x), c(pd.y), s, pd.y * this.geo.n + pd.x, this.uid)}</g>`);
        out.push(paper
          ? `<rect x="${m + pd.x * P + 2}" y="${m + pd.y * P + 2}" width="${P - 4}" height="${P - 4}" fill="${PENDING}" fill-opacity=".14" stroke="${PENDING}" stroke-width="2.5"/>`
          : `<circle cx="${c(pd.x)}" cy="${c(pd.y)}" r="${P * 0.47}" fill="${PENDING}" fill-opacity=".14" stroke="${PENDING}" stroke-width="2.5"/>`);
      }
      const o = this.optimisticStone;
      if (o) {
        const v = o.color === 'WHITE' ? 2 : 1;
        // Same look as a confirmed piece (#155); the warning adds a faint ring after the first ack timeout.
        out.push(`<g class="gboard__optimistic" data-x="${o.x}" data-y="${o.y}">${pieceSvg(v, c(o.x), c(o.y), s, o.y * this.geo.n + o.x, this.uid)}` +
          (o.warning ? `<circle class="gboard__warning" cx="${c(o.x)}" cy="${c(o.y)}" r="${P * 0.44}" fill="none" stroke="rgba(196,130,40,.9)" stroke-width="1.5"/>` : '') + `</g>`);
      }
      this._ov.innerHTML = out.join('');
    }

    /** Stop following BoardPrefs / container size (pages that rebuild their board). */
    destroy() {
      for (const [ev, fn] of Object.entries(this._handlers || {})) this.svg.removeEventListener(ev, fn);
      this._handlers = null;
      if (this.svg.__gboard === this) this.svg.__gboard = null;
      if (this._onPrefs) root.removeEventListener('boardprefschange', this._onPrefs);
      if (this._ro) this._ro.disconnect();
      if (this._live) this._live.remove();
    }
  }

  /** One piece (1 black/X, 2 white/O) in the current look, for player cards. */
  function pieceIconSvg(value, cls) {
    const s = BoardPrefs.get();
    const uid = 'pc' + value;
    return `<svg class="${cls || ''}" viewBox="0 0 ${P} ${P}" aria-hidden="true" focusable="false">` +
      (s.theme === 'stone' ? defsSvg(s, uid) : `<rect width="${P}" height="${P}" rx="8" fill="${s.paper.bg}"/>`) +
      pieceSvg(value, P / 2, P / 2, s, 7, uid) + `</svg>`;
  }

  root.BoardPrefs = BoardPrefs;
  root.boardPieceSvg = pieceIconSvg;
  root.BoardContrast = Contrast;
  root.BoardRenderer = BoardRenderer;
  root.boardPreviewSvg = previewSvg;
})(window);
