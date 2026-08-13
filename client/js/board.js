/**
 * board.js — Canvas-based Board Renderer for GomokuVN.
 *
 * Papers Style: Matches the C++ BoardRenderer from gomoku-portal-ui.
 *   - Background: light warm paper (#FAF5E8)
 *   - Grid: darker high-contrast lines with thicker border
 *   - Black pieces: X cross (diagonal, round caps)
 *   - White pieces: O circle (white fill + black outline)
 *   - Optional stone display: round black/white stones with last-move dot
 *   - Walls: brick pattern (7 rows, 3 cols, alternating offset)
 *   - Portals: colored ring with center dot
 *   - Last move: golden yellow highlight square
 *   - Hover: gray semi-transparent rectangle
 *   - Star points: small dots at standard positions
 */

'use strict';

// Portal pair color palette (matches C++ kPortalColors)
const PORTAL_COLORS = [
  { r: 0.20, g: 0.70, b: 0.95 },  // 0: Cyan/Blue
  { r: 0.90, g: 0.40, b: 0.60 },  // 1: Pink/Magenta
  { r: 0.30, g: 0.80, b: 0.40 },  // 2: Green
  { r: 0.95, g: 0.60, b: 0.20 },  // 3: Orange
  { r: 0.65, g: 0.35, b: 0.85 },  // 4: Purple
  { r: 0.20, g: 0.75, b: 0.70 },  // 5: Teal
  { r: 0.85, g: 0.75, b: 0.20 },  // 6: Gold
  { r: 0.85, g: 0.25, b: 0.25 },  // 7: Red
];

// Star point positions for common board sizes
const STAR_POINTS = {
  15: [[3, 3], [3, 7], [3, 11], [7, 3], [7, 7], [7, 11], [11, 3], [11, 7], [11, 11]],
  17: [[3, 3], [3, 8], [3, 13], [8, 3], [8, 8], [8, 13], [13, 3], [13, 8], [13, 13]],
  19: [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]],
  20: [[3, 3], [3, 9], [3, 16], [9, 3], [9, 9], [9, 16], [16, 3], [16, 9], [16, 16]],
};

class BoardRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ boardSize: number, onCellClick: (x: number, y: number) => void }} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.boardSize = opts.boardSize || 17;
    this.onCellClick = opts.onCellClick || null;
    this.displayMode = opts.displayMode || 'paper';
    this.clickMode = opts.clickMode || 'double';

    // State (set externally via setState)
    this.board = null;
    this.walls = [];
    this.portals = [];
    this.firstMoveZones = [];
    this.showZones = false;
    this.lastMove = null;
    this.winLine = null; // Array of {x, y}
    this.moveHistory = [];
    this.isMyTurn = false;
    this.interactive = false;
    this.myColor = null;

    // Geometry
    this.geo = { cellSize: 0, originX: 0, originY: 0, boardSize: this.boardSize };

    // Hover
    this._hoverCell = null;

    // Double-tap: pending cell awaiting confirmation
    this._pendingCell = null;

    // Bind events
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this._onMouseLeave());
    this.canvas.addEventListener('click', (e) => this._onClick(e));
    // Touch support for mobile
    this.canvas.addEventListener('touchend', (e) => this._onTouchEnd(e));

    // The app's data-theme toggle (settings-panel.js) fires no change event,
    // so redraw directly when it flips — the canvas's paper/caro colors are
    // sourced from --board-* CSS custom properties and won't repaint on
    // their own the way DOM elements do.
    this._themeObserver = new MutationObserver(() => this._draw());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /** Resolve --board-* custom properties for the current theme (paper/caro mode only). */
  _readBoardTheme() {
    const cs = getComputedStyle(document.documentElement);
    const read = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
    return {
      bg: read('--board-bg', '#F7F7F7'),
      accentRgb: read('--board-accent-rgb', '45, 60, 95'),
      inkRgb: read('--board-ink-rgb', '41, 98, 255'),
      pendingRgb: read('--board-pending-rgb', '72, 135, 95'),
      highlightRgb: read('--board-highlight-rgb', '255, 234, 0'),
      wallMortarRgb: read('--board-wall-mortar-rgb', '74, 74, 74'),
      wallDarkRgb: read('--board-wall-dark-rgb', '97, 97, 97'),
      wallBaseRgb: read('--board-wall-base-rgb', '138, 138, 138'),
      wallLightRgb: read('--board-wall-light-rgb', '176, 176, 176'),
    };
  }

  /** Update board state and redraw. */
  setState(s) {
    const prevBoardSize = this.boardSize;
    const prevDisplayMode = this.displayMode;

    if (s.boardSize !== undefined) this.boardSize = s.boardSize;
    if (s.board !== undefined) this.board = s.board;
    if (s.walls !== undefined) this.walls = s.walls;
    if (s.portals !== undefined) this.portals = s.portals;
    if (s.firstMoveZones !== undefined) this.firstMoveZones = s.firstMoveZones;
    if (s.showZones !== undefined) this.showZones = s.showZones;
    if (s.winLine !== undefined) this.winLine = s.winLine;
    if (s.moveHistory !== undefined) this.moveHistory = s.moveHistory || [];
    if (s.displayMode !== undefined) this.displayMode = s.displayMode || 'paper';
    if (s.lastMove !== undefined) this.lastMove = s.lastMove;
    if (s.isMyTurn !== undefined) this.isMyTurn = s.isMyTurn;
    if (s.interactive !== undefined) this.interactive = s.interactive;
    if (s.myColor !== undefined) this.myColor = s.myColor;
    if ((prevBoardSize !== this.boardSize || prevDisplayMode !== this.displayMode) && this.cssSize) {
      this._computeGeometry();
    }
    this._draw();
  }

  /** Resize canvas to fit container. */
  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const focusMode = document.body.classList.contains('room--focus');
    const turnBarEl = document.getElementById('turn-bar');
    const controlsEl = document.getElementById('game-controls');
    const tbH = turnBarEl ? (turnBarEl.offsetHeight || 0) : 0;
    const gcH = controlsEl ? (controlsEl.offsetHeight || 0) : 0;

    let boardAreaH, maxVw;

    if (focusMode) {
      // In focus mode .board-area is position:fixed filling the entire viewport.
      // The shell element sits behind in normal flow and reports wrong dimensions —
      // always use raw viewport dimensions here.
      // Reserve: 10px top padding + 20px top gap + tbH + gcH + 18px controls margin
      //        + 80px bottom strip (fixed chat + focus-btn, both hugging
      //        bottom:20px — see .room--focus .board-area's padding-bottom
      //        in game.css, which this mirrors)
      const topReserve = 10 + 20 + tbH + 18;
      const bottomReserve = gcH + 18 + 80;
      boardAreaH = window.innerHeight - topReserve - bottomReserve;
      // Side padding: 10px each side in the CSS
      maxVw = window.innerWidth - 20;
    } else {
      // Normal layout: derive from the shell element which has
      // height: calc(100vh - 76px) on desktop.
      const boardAreaShell = document.querySelector('.board-area-shell');
      const boardAreaEl = document.querySelector('.board-area');

      // clientWidth/clientHeight include the element's own padding, so a shell
      // that pads itself (the zen room reserves its right side for the drawer
      // and its bottom for the mobile tab bar) reports a box far larger than
      // the space the board may actually occupy. Sizing the canvas off that
      // raw number makes it overflow .board-canvas-wrap, whose overflow:hidden
      // then crops the right/bottom edge — the board reads as squashed or
      // off-centre even though the canvas itself is still square. Always
      // measure the shell's *content* box.
      const shellStyle = boardAreaShell ? getComputedStyle(boardAreaShell) : null;
      const padX = shellStyle
        ? (parseFloat(shellStyle.paddingLeft) || 0) + (parseFloat(shellStyle.paddingRight) || 0)
        : 0;
      const padY = shellStyle
        ? (parseFloat(shellStyle.paddingTop) || 0) + (parseFloat(shellStyle.paddingBottom) || 0)
        : 0;

      boardAreaH = boardAreaShell
        ? boardAreaShell.clientHeight - padY
        : (boardAreaEl ? boardAreaEl.clientHeight : (window.innerHeight - 76));

      const zenRoom = document.body.classList.contains('zen-room');
      if (zenRoom) {
        // Zen's .board-area/.board-area-inner carry no padding or border of
        // their own (see room-zen.css) — the only real overhead left is the
        // 1px-top + 1px-bottom hairline on .board-canvas-wrap itself, plus
        // each *visible* sibling's own reserved margin (turn-bar's
        // margin-bottom, game-controls' margin-top — both 10px in
        // room-zen.css). Both collapse to 0 while hidden/empty
        // (turn-bar: display:none pre-game; game-controls: :empty pre-game,
        // via room-zen.css), so only add the 10px when there's real height
        // (tbH/gcH) behind it — otherwise this would over-subtract 10px of
        // margin that isn't actually being rendered, artificially shrinking
        // the board pre-game for no visible reason. The old flat
        // "-14-16-12-8" below is the default (non-zen) Double-Bezel card's
        // padding/border budget, which zen no longer has.
        const canvasWrapBorder = 2;
        const turnBarMargin = tbH > 0 ? 10 : 0;
        const controlsMargin = gcH > 0 ? 10 : 0;
        boardAreaH = boardAreaH - canvasWrapBorder - tbH - turnBarMargin - gcH - controlsMargin;
      } else {
        // Subtract outer padding/border (14px) + inner padding (16px) + turn-bar +
        // controls + controls margin (12) + safety (8)
        boardAreaH = boardAreaH - 14 - 16 - tbH - gcH - 12 - 8;
      }
      // On mobile (<=768px), .board-area-shell bleeds full-bleed via CSS
      // (width: calc(100% + 32px); margin-left: -16px; padding: 0) to reclaim
      // the .room padding-inline. That +32/-16 math assumes a fixed 16px
      // padding, but .room's actual padding-inline is clamp(6px, 2.5vw, 16px)
      // — on many phone widths the real padding is smaller, so the bleed
      // overshoots and the shell's clientWidth can exceed the true viewport
      // width, clipping the board against .board-canvas-wrap's overflow:
      // hidden instead of scaling to fit. Clamp against window.innerWidth
      // directly so the board can never be wider than the viewport. On
      // desktop the shell still has its own padding/border (~32px) to
      // subtract, and no viewport-bleed trick is in play.
      const mobileWidth = window.innerWidth <= 768;
      const shellWidth = (boardAreaShell
        ? boardAreaShell.clientWidth
        : (boardAreaEl ? boardAreaEl.clientWidth : parent.clientWidth)) - padX;
      maxVw = mobileWidth
        ? Math.min(shellWidth - 8, window.innerWidth - 8)
        : shellWidth - 32;

      // Mobile normally has no height budget to read (the shell is
      // height:auto, so its box is whatever the board already made it) —
      // derive one from the viewport instead: everything above the shell
      // (top bar, players strip) plus the shell's own bottom padding, which
      // is what reserves room for the zen bottom tab bar. Without this the
      // board is sized purely by width and a tall board pushes the controls
      // under the fold on short screens.
      // Scoped to the zen room: it is the only layout that reserves fixed
      // chrome (the bottom tab bar) below the board on a phone, and the only
      // one whose shell padding makes this measurable. Other skins keep the
      // width-driven behaviour they were tuned against.
      if (mobileWidth && boardAreaShell && document.body.classList.contains('zen-room')) {
        // Document-relative, not viewport-relative: measured mid-scroll the
        // raw rect.top would shrink (or go negative) and hand the board a
        // budget that changes with the scroll position.
        const shellTop = Math.max(
          boardAreaShell.getBoundingClientRect().top + window.scrollY, 0);
        const viewportBudget =
          window.innerHeight - shellTop - padY - tbH - gcH - 14 - 16 - 12 - 8;
        if (viewportBudget > 0) boardAreaH = viewportBudget;
      }
    }

    // Single-column layout (mobile, <=768px) has auto-height board-area in normal
    // mode, so height budget collapses — drive by width instead. The zen room
    // is the exception: the branch above gives it a real viewport-derived
    // height budget, so it fits both axes.
    // Focus mode always uses the viewport budget calculated above.
    const singleColumn = window.innerWidth <= 768
      && !document.body.classList.contains('zen-room');
    let rawSize = (singleColumn && !focusMode)
      ? maxVw
      : Math.min(maxVw, boardAreaH);
    // Cap so the board never looks comically large on a big screen. The zen
    // room is built around "the board is the page" and reserves the rest of
    // the viewport for a single fixed drawer, so it gets a higher ceiling than
    // the default two-column skin.
    const zenRoom = document.body.classList.contains('zen-room');
    rawSize = Math.min(rawSize, zenRoom ? 1100 : 860);
    const s = Math.max(rawSize, 200); // usable minimum

    // Support High-DPI screens. Some Android WebViews/browsers under-report
    // devicePixelRatio (e.g. report 1 or 1.5 on a physically dense small
    // screen), which makes the grid and glyphs look soft even though the
    // CSS size itself is now correct — floor the render resolution at 2x on
    // mobile so hairlines and stone glyphs stay crisp regardless of what the
    // device reports. Cap at 3x everywhere to bound canvas memory/perf on
    // very high-density panels (4x+ Android panels, etc).
    const rawDpr = window.devicePixelRatio || 1;
    const isMobileDpr = window.innerWidth <= 768;
    const dpr = isMobileDpr ? Math.min(Math.max(rawDpr, 2), 3) : Math.min(rawDpr, 3);
    this.dpr = dpr;
    this.canvas.style.width = `${s}px`;
    this.canvas.style.height = `${s}px`;
    this.canvas.width = Math.round(s * dpr);
    this.canvas.height = Math.round(s * dpr);

    // Scale context to match CSS size
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssSize = s;

    this._computeGeometry();
    this._draw();
  }

  // ─── Geometry ────────────────────────────────────────────────────

  _computeGeometry() {
    const w = this.cssSize || this.canvas.width;
    const h = this.cssSize || this.canvas.height;
    const n = this.boardSize;

    // Margin for coordinate labels. Mobile boards are smaller in absolute
    // terms, so a smaller minimum keeps more of the canvas as playable grid
    // instead of label whitespace.
    const mobile = window.innerWidth <= 768;
    let margin = Math.min(w, h) * (mobile ? 0.045 : 0.06);
    margin = Math.max(margin, mobile ? 16 : 24);

    const availW = w - 2 * margin;
    const availH = h - 2 * margin;

    const intervals = this.displayMode === 'stone' ? Math.max(n - 1, 1) : n;
    const cellSize = Math.min(availW, availH) / intervals;

    // Center the grid
    const gridW = intervals * cellSize;
    const gridH = intervals * cellSize;
    const originX = margin + (availW - gridW) / 2;
    const originY = margin + (availH - gridH) / 2;

    this.geo = { cellSize, originX, originY, boardSize: n };
  }

  /** Convert cell (x,y) to pixel center of the cell. */
  _cellToPixel(x, y) {
    const g = this.geo;
    if (this.displayMode === 'stone') {
      return {
        px: g.originX + x * g.cellSize,
        py: g.originY + y * g.cellSize,
      };
    }

    return {
      px: g.originX + (x + 0.5) * g.cellSize,
      py: g.originY + (y + 0.5) * g.cellSize,
    };
  }

  /** Convert pixel to cell index. Returns null if out of bounds. */
  _pixelToCell(px, py) {
    const g = this.geo;
    if (this.displayMode === 'stone') {
      const maxX = g.originX + (g.boardSize - 1) * g.cellSize;
      const maxY = g.originY + (g.boardSize - 1) * g.cellSize;
      const pad = g.cellSize * 0.5;
      if (px < g.originX - pad || px > maxX + pad || py < g.originY - pad || py > maxY + pad) return null;

      const x = Math.round((px - g.originX) / g.cellSize);
      const y = Math.round((py - g.originY) / g.cellSize);
      if (x < 0 || x >= g.boardSize || y < 0 || y >= g.boardSize) return null;
      return { x, y };
    }

    const x = Math.floor((px - g.originX) / g.cellSize);
    const y = Math.floor((py - g.originY) / g.cellSize);
    if (x < 0 || x >= g.boardSize || y < 0 || y >= g.boardSize) return null;
    return { x, y };
  }

  // ─── Event Handlers ──────────────────────────────────────────────

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const w = this.cssSize || this.canvas.width;
    const h = this.cssSize || this.canvas.height;
    return {
      x: (e.clientX - rect.left) * (w / rect.width),
      y: (e.clientY - rect.top) * (h / rect.height),
    };
  }

  _onMouseMove(e) {
    if (!this.interactive || !this.isMyTurn) {
      if (this._hoverCell) { this._hoverCell = null; this._draw(); }
      return;
    }
    const pos = this._getCanvasPos(e);
    const cell = this._pixelToCell(pos.x, pos.y);
    const prev = this._hoverCell;
    this._hoverCell = cell;
    if (!prev && !cell) return;
    if (prev && cell && prev.x === cell.x && prev.y === cell.y) return;
    this._draw();
  }

  _onMouseLeave() {
    if (this._hoverCell) { this._hoverCell = null; this._draw(); }
  }

  _onClick(e) {
    if (!this.interactive || !this.isMyTurn || !this.onCellClick) return;
    const pos = this._getCanvasPos(e);
    const cell = this._pixelToCell(pos.x, pos.y);
    if (!cell) return;
    // Check the cell is empty and not a wall/portal
    if (this.board && this.board[cell.y] && this.board[cell.y][cell.x] === 0) {
      this._handleCellSelect(cell.x, cell.y);
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    if (!this.interactive || !this.isMyTurn || !this.onCellClick) return;
    const touch = e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    const w = this.cssSize || this.canvas.width;
    const h = this.cssSize || this.canvas.height;
    const px = (touch.clientX - rect.left) * (w / rect.width);
    const py = (touch.clientY - rect.top) * (h / rect.height);
    const cell = this._pixelToCell(px, py);
    if (!cell) return;
    if (this.board && this.board[cell.y] && this.board[cell.y][cell.x] === 0) {
      this._handleCellSelect(cell.x, cell.y);
    }
  }

  /** Tap logic: depending on clickMode (single/double). */
  _handleCellSelect(x, y) {
    if (this.clickMode === 'single') {
      this._pendingCell = null;
      this.onCellClick(x, y);
      return;
    }

    if (this._pendingCell && this._pendingCell.x === x && this._pendingCell.y === y) {
      // Second tap on same cell → confirm
      this._pendingCell = null;
      this.onCellClick(x, y);
    } else {
      // First tap or different cell → set pending
      this._pendingCell = { x, y };
      this._draw();
    }
  }

  /** Clear pending cell (called externally after a move is placed). */
  clearPending() {
    this._pendingCell = null;
  }

  // ─── Main Draw ───────────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;
    const g = this.geo;
    if (!g.cellSize) return;

    this._theme = this._readBoardTheme();

    const w = this.cssSize || this.canvas.width;
    const h = this.cssSize || this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Background + grid
    this._drawBackground();
    this._drawStarPoints();
    this._drawCoordinates();

    // 2. First move zone highlights (behind everything)
    if (this.showZones && this.firstMoveZones && this.firstMoveZones.length > 0) {
      this._drawFirstMoveZones();
    }

    // 3. Last move highlight (behind pieces)
    if (this.lastMove) {
      this._drawLastMoveHighlight(this.lastMove.x, this.lastMove.y);
    }

    // 3b. Win line highlight
    if (this.winLine) {
      this._drawWinHighlight(this.winLine);
    }

    // 4. Hover highlight
    if (this._hoverCell && this.board) {
      const hx = this._hoverCell.x, hy = this._hoverCell.y;
      if (this.board[hy] && this.board[hy][hx] === 0) {
        this._drawHoverHighlight(hx, hy);
      }
    }

    // 4b. Pending cell highlight (double-tap preview)
    if (this._pendingCell && this.board) {
      const px = this._pendingCell.x, py = this._pendingCell.y;
      if (this.board[py] && this.board[py][px] === 0) {
        this._drawPendingHighlight(px, py);
      }
    }

    // 5. Draw all cells
    if (this.board) {
      for (let y = 0; y < g.boardSize; y++) {
        for (let x = 0; x < g.boardSize; x++) {
          const val = this.board[y][x];
          if (val === 1) this.displayMode === 'stone' ? this._drawStonePiece(x, y, 'BLACK') : this._drawBlackPiece(x, y);
          else if (val === 2) this.displayMode === 'stone' ? this._drawStonePiece(x, y, 'WHITE') : this._drawWhitePiece(x, y);
          else if (val === -1) this._drawWall(x, y);
          else if (val === -2) this._drawPortal(x, y);
        }
      }
    }

    if (this.displayMode === 'stone' && this.lastMove) {
      this._drawStoneLastMoveMarker(this.lastMove.x, this.lastMove.y);
    }
  }

  // ─── Wood Texture (Stone mode) ────────────────────────────────────

  /** Cached offscreen wood-grain texture, keyed by size — regenerated only on resize. */
  _getWoodTexture(w, h) {
    const rw = Math.max(1, Math.round(w));
    const rh = Math.max(1, Math.round(h));
    if (!this._woodTexture || this._woodTextureW !== rw || this._woodTextureH !== rh) {
      this._woodTexture = this._buildWoodTexture(rw, rh);
      this._woodTextureW = rw;
      this._woodTextureH = rh;
    }
    return this._woodTexture;
  }

  /** Paint a kaya-wood gold/amber base with painted grain streaks onto an offscreen canvas. */
  _buildWoodTexture(w, h) {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const c = off.getContext('2d');

    // Flat base — the WCAG-solved #b58a40 (white-stone contrast ≈3.15:1,
    // black-stone contrast ≈6.67:1), no gradient wash. Grain streaks below
    // are the only variation.
    c.fillStyle = '#b58a40';
    c.fillRect(0, 0, w, h);

    // Deterministic PRNG (mulberry32) — same seed every call, so the grain
    // pattern is stable across redraws at a given canvas size instead of
    // re-randomizing (and visibly flickering) on every _draw().
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const streakCount = Math.max(6, Math.round(h / 16));
    const cp1x = w * 0.33, cp2x = w * 0.66;
    for (let i = 0; i < streakCount; i++) {
      const baseY = ((i + 0.5) / streakCount) * h;
      const amp = 6 + rand() * 10;
      const alpha = 0.05 + rand() * 0.07;
      c.strokeStyle = rand() > 0.55
        ? `rgba(235, 205, 155, ${alpha.toFixed(3)})`
        : `rgba(90, 62, 26, ${alpha.toFixed(3)})`;
      c.lineWidth = 1 + rand() * 2;
      c.beginPath();
      c.moveTo(0, baseY + (rand() - 0.5) * amp);
      c.bezierCurveTo(
        cp1x, baseY + (rand() - 0.5) * amp * 2,
        cp2x, baseY + (rand() - 0.5) * amp * 2,
        w, baseY + (rand() - 0.5) * amp
      );
      c.stroke();
    }

    return off;
  }

  // ─── Background & Grid ──────────────────────────────────────────

  _drawBackground() {
    const ctx = this.ctx;
    const g = this.geo;
    const intervals = this.displayMode === 'stone' ? g.boardSize - 1 : g.boardSize;
    const lineCount = this.displayMode === 'stone' ? g.boardSize : g.boardSize + 1;
    const gridW = intervals * g.cellSize;
    const gridH = intervals * g.cellSize;

    const w = this.cssSize || this.canvas.width;
    const h = this.cssSize || this.canvas.height;

    // Premium radial gradient background (tactile matte feel)
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.max(w, h);
    
    if (this.displayMode === 'stone') {
      // Stone mode intentionally keeps a fixed backdrop regardless of theme
      // (filled black/white discs need a consistent board to read against;
      // see the note on --board-bg in main.css) — a kaya-wood gold/amber
      // tone (hue 38°, sat 48%) with painted grain streaks, instead of a
      // flat gradient. Base #b58a40 is picked so white stones sit right at
      // the WCAG 1.4.11 graphical-object floor of ~3:1 (contrast shrinks as
      // the board lightens toward gold) while black stones stay crisp at
      // ~6.7:1 — same medium-contrast approach as before, just re-solved
      // for the warmer/more saturated hue the wood look needs.
      ctx.drawImage(this._getWoodTexture(w, h), 0, 0, w, h);
    } else {
      ctx.fillStyle = this._theme.bg;
      ctx.fillRect(0, 0, w, h);
    }

    // Grid lines (theme-aware teal for standard/caro, dark ink for stone —
    // real goban lines are inked in dark lacquer, not a light overlay)
    ctx.strokeStyle = this.displayMode === 'stone'
      ? 'rgba(34, 28, 17, 0.55)'
      : `rgba(${this._theme.accentRgb}, 0.22)`;
    // Snap to the physical device-pixel grid and stroke exactly 1px wide so
    // hairlines stay crisp at any devicePixelRatio, including the fractional
    // ratios (2.625, 3.5, ...) common on Android phones.
    const dpr = this.dpr || (window.devicePixelRatio || 1);
    const snap = (v) => Math.round(v * dpr) / dpr;
    ctx.lineWidth = 1 / dpr;

    ctx.beginPath();
    for (let i = 0; i < lineCount; i++) {
      // Vertical
      const vx = snap(g.originX + i * g.cellSize) + 0.5 / dpr;
      ctx.moveTo(vx, snap(g.originY));
      ctx.lineTo(vx, snap(g.originY + gridH));
      // Horizontal
      const hy = snap(g.originY + i * g.cellSize) + 0.5 / dpr;
      ctx.moveTo(snap(g.originX), hy);
      ctx.lineTo(snap(g.originX + gridW), hy);
    }
    ctx.stroke();

    // Board border (thicker and slightly darker)
    ctx.strokeStyle = this.displayMode === 'stone'
      ? 'rgba(0, 0, 0, 0.25)'
      : `rgba(${this._theme.accentRgb}, 0.4)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(g.originX, g.originY, gridW, gridH);
  }

  // ─── Star Points ────────────────────────────────────────────────

  _drawStarPoints() {
    const ctx = this.ctx;
    const g = this.geo;
    const stars = STAR_POINTS[g.boardSize];
    if (!stars) return;

    ctx.fillStyle = this.displayMode === 'stone'
      ? 'rgba(0, 0, 0, 0.6)'
      : `rgba(${this._theme.accentRgb}, 0.6)`;
    const dotR = g.cellSize * 0.08;

    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowBlur = 1;
    ctx.shadowOffsetY = 1;

    for (const [sx, sy] of stars) {
      const { px, py } = this._cellToPixel(sx, sy);
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ─── Coordinates ────────────────────────────────────────────────

  _drawCoordinates() {
    const ctx = this.ctx;
    const g = this.geo;
    const fontSize = g.cellSize * 0.35;
    const labelOffset = g.cellSize * 0.55;
    const hover = this._hoverCell;

    const normalStyle = this.displayMode === 'stone'
      ? 'rgba(0, 0, 0, 0.4)'
      : `rgba(${this._theme.accentRgb}, 0.85)`;
    const hoverStyle = `rgb(${this._theme.highlightRgb})`;

    ctx.font = `600 ${fontSize}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = '1px';
    }

    // Column letters (A, B, C, ...) — the hovered column is highlighted
    for (let x = 0; x < g.boardSize; x++) {
      const ch = String.fromCharCode(65 + x);
      const px = this.displayMode === 'stone'
        ? g.originX + x * g.cellSize
        : g.originX + (x + 0.5) * g.cellSize;
      const py = g.originY - labelOffset;
      ctx.fillStyle = hover && hover.x === x ? hoverStyle : normalStyle;
      ctx.fillText(ch, px, py);
    }

    // Row numbers — displayed bottom-up (row 1 at the bottom, highest at the
    // top, standard Go/Gomoku board convention) while internal y indices
    // (top-to-bottom, used for board state/click mapping) stay unchanged.
    ctx.textAlign = 'center';
    for (let y = 0; y < g.boardSize; y++) {
      const text = String(g.boardSize - y);
      const px = g.originX - labelOffset;
      const py = this.displayMode === 'stone'
        ? g.originY + y * g.cellSize
        : g.originY + (y + 0.5) * g.cellSize;
      ctx.fillStyle = hover && hover.y === y ? hoverStyle : normalStyle;
      ctx.fillText(text, px, py);
    }
  }

  // ─── Highlights ─────────────────────────────────────────────────

  _drawLastMoveHighlight(x, y) {
    if (this.displayMode === 'stone') return;

    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);
    const half = g.cellSize * 0.45;

    // Amber/gold highlight (Fix #14/#16) — fill only, no border.
    const nx = px - half;
    const ny = py - half;
    const s = half * 2;
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(nx + r, ny);
    ctx.lineTo(nx + s - r, ny);
    ctx.quadraticCurveTo(nx + s, ny, nx + s, ny + r);
    ctx.lineTo(nx + s, ny + s - r);
    ctx.quadraticCurveTo(nx + s, ny + s, nx + s - r, ny + s);
    ctx.lineTo(nx + r, ny + s);
    ctx.quadraticCurveTo(nx, ny + s, nx, ny + s - r);
    ctx.lineTo(nx, ny + r);
    ctx.quadraticCurveTo(nx, ny, nx + r, ny);
    ctx.closePath();
    ctx.fillStyle = `rgba(${this._theme.highlightRgb}, 0.45)`;
    ctx.fill();
  }

  _drawHoverHighlight(x, y) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);

    ctx.save();
    if (this.displayMode === 'stone') {
      const r = g.cellSize * 0.38;
      ctx.strokeStyle = 'rgba(15, 118, 110, 0.6)'; // Brand teal glowing ring
      ctx.lineWidth = Math.max(g.cellSize * 0.04, 1.5);
      
      ctx.shadowColor = 'rgba(15, 118, 110, 0.3)';
      ctx.shadowBlur = 6;
      
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const half = g.cellSize * 0.45;
      ctx.fillStyle = `rgba(${this._theme.accentRgb}, 0.1)`;
      ctx.strokeStyle = `rgba(${this._theme.accentRgb}, 0.6)`;
      ctx.lineWidth = 1.5;
      
      const r = 4;
      const nx = px - half;
      const ny = py - half;
      const s = half * 2;
      
      ctx.beginPath();
      ctx.moveTo(nx + r, ny);
      ctx.lineTo(nx + s - r, ny);
      ctx.quadraticCurveTo(nx + s, ny, nx + s, ny + r);
      ctx.lineTo(nx + s, ny + s - r);
      ctx.quadraticCurveTo(nx + s, ny + s, nx + s - r, ny + s);
      ctx.lineTo(nx + r, ny + s);
      ctx.quadraticCurveTo(nx, ny + s, nx, ny + s - r);
      ctx.lineTo(nx, ny + r);
      ctx.quadraticCurveTo(nx, ny, nx + r, ny);
      
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawWinHighlight(stones) {
    const ctx = this.ctx;
    const half = this.geo.cellSize * 0.5;
    ctx.save();
    // A solid red/orange square highlight filling the cell
    ctx.fillStyle = 'rgba(231, 76, 60, 0.65)';

    for (const st of stones) {
      const { px, py } = this._cellToPixel(st.x, st.y);
      ctx.fillRect(px - half, py - half, half * 2, half * 2);
    }
    ctx.restore();
  }

  /** Draw pending cell: semi-transparent preview stone + green pulsing ring. */
  _drawPendingHighlight(x, y) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);
    const half = g.cellSize * 0.45;

    if (this.displayMode === 'stone') {
      ctx.save();
      const r = g.cellSize * 0.45;
      if (this.myColor === 'BLACK' || this.myColor === 'WHITE') {
        ctx.globalAlpha = 0.42;
        this._drawStonePiece(x, y, this.myColor);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(72, 135, 95, 0.16)';
      ctx.strokeStyle = 'rgba(72, 135, 95, 0.82)';
      ctx.lineWidth = Math.max(g.cellSize * 0.04, 1.25);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Green highlight background
    ctx.fillStyle = `rgba(${this._theme.pendingRgb}, 0.3)`;
    ctx.fillRect(px - half, py - half, half * 2, half * 2);

    // Green border ring
    ctx.strokeStyle = `rgba(${this._theme.pendingRgb}, 0.8)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(px - half, py - half, half * 2, half * 2);

    // Draw semi-transparent preview piece
    const r = g.cellSize * 0.32;
    if (this.myColor === 'BLACK') {
      // X cross preview
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = `rgb(${this._theme.inkRgb})`;
      ctx.lineWidth = Math.max(g.cellSize * 0.11, 1.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
      ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (this.myColor === 'WHITE') {
      // O circle preview
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgb(255, 29, 35)';
      ctx.lineWidth = Math.max(g.cellSize * 0.07, 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawFirstMoveZones() {
    const ctx = this.ctx;
    const g = this.geo;

    ctx.fillStyle = 'rgba(100, 180, 100, 0.25)';
    for (const z of this.firstMoveZones) {
      const { px, py } = this._cellToPixel(z.x, z.y);
      const half = g.cellSize * 0.48;
      ctx.fillRect(px - half, py - half, half * 2, half * 2);
    }
  }

  // ─── Black Piece — X Cross ──────────────────────────────────────

  _drawBlackPiece(x, y) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);

    // Diagonal cross — 60% visual extent
    const arm = g.cellSize * 0.22;
    const lw = Math.max(g.cellSize * 0.14, 2.5);

    ctx.strokeStyle = `rgb(${this._theme.inkRgb})`; // Theme-aware ink (slate-900 light / slate-50 dark)
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';

    ctx.beginPath();
    // Diagonal 1: top-left to bottom-right
    ctx.moveTo(px - arm, py - arm);
    ctx.lineTo(px + arm, py + arm);
    // Diagonal 2: top-right to bottom-left
    ctx.moveTo(px + arm, py - arm);
    ctx.lineTo(px - arm, py + arm);
    ctx.stroke();
  }

  // ─── Stone Piece — Round Stones ─────────────────────────────────

  _drawStonePiece(x, y, color) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);
    const radius = g.cellSize * 0.45;
    const isBlack = color === 'BLACK';

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = Math.max(g.cellSize * 0.12, 2.5);
    ctx.shadowOffsetY = Math.max(g.cellSize * 0.055, 1.2);

    const grad = ctx.createRadialGradient(
      px - radius * 0.32, py - radius * 0.36, radius * 0.08,
      px + radius * 0.12, py + radius * 0.16, radius * 1.08
    );
    if (isBlack) {
      grad.addColorStop(0, '#464646');
      grad.addColorStop(0.22, '#242424');
      grad.addColorStop(0.7, '#0d0d0d');
      grad.addColorStop(1, '#020202');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.34, '#ffffff');
      grad.addColorStop(0.78, '#f1f1f1');
      grad.addColorStop(1, '#d8d8d8');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    const shine = ctx.createRadialGradient(
      px - radius * 0.34, py - radius * 0.38, 0,
      px - radius * 0.34, py - radius * 0.38, radius * 0.58
    );
    shine.addColorStop(0, isBlack ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.82)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawStoneLastMoveMarker(x, y) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);
    const r = Math.max(g.cellSize * 0.05, 1.6);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = Math.max(g.cellSize * 0.035, 1);
    ctx.fillStyle = '#e33434';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = Math.max(g.cellSize * 0.018, 0.75);
    ctx.stroke();
    ctx.restore();
  }

  // ─── White Piece — O Circle ─────────────────────────────────────

  _drawWhitePiece(x, y) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);

    // Circle — 60% visual extent
    const radius = g.cellSize * 0.24;
    const lw = Math.max(g.cellSize * 0.14, 2.5);

    // White fill (no fill, just red ink outline for elegant paper look)

    // Bright red ink outline (Fix #10)
    ctx.strokeStyle = 'rgb(255, 29, 35)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawWall(x, y) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);

    // ── Perfect Port of WormHole's _drawBlock using Canvas Transform ──
    // Instead of quantizing dimensions (which breaks on small screens), we
    // scale the context itself. On high-DPI mobile screens, Canvas will use
    // physical sub-pixels to render the 36x36 reference block perfectly crisp!
    const CS    = g.cellSize;
    const REF   = 36;
    const scale = CS / REF;

    ctx.save();
    // Move to cell center, scale to reference size, and move to top-left of local 36x36 box
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    ctx.translate(-REF / 2, -REF / 2);

    const pad = 1;
    const bx0 = pad;
    const by0 = pad;
    const w   = REF - pad * 2;
    const h   = REF - pad * 2;
    const br  = 3;
    const br2 = 2;
    const GAP = 1;

    // WCAG-derived neutral palette. Paper/caro mode stays theme-aware
    // (sourced from --board-wall-*, unchanged). Stone mode uses its own
    // fixed warm-stone palette instead — the cool neutral gray from the
    // theme vars read as foreign against the locked kaya-wood background,
    // so this is solved the same way the wood tone itself was: contrast(
    // L_board, L_x) = C against the locked board's relative luminance
    // (#b58a40 → 0.2837), same warm hue family as the board (28° vs the
    // board's 38°) but desaturated toward stone. Darker tones step up in
    // target contrast (mortar 4.5:1, dark 3.8:1, base 3.0:1 — grout reads
    // darkest, brick body lightest of the three) and the highlight is
    // solved in the *lighter* direction (1.8:1) as a subtle stone sheen.
    const theme = this._theme;
    const isStone = this.displayMode === 'stone';
    const BLOCK_MORTAR = isStone ? '#2f2a26' : `rgb(${theme.wallMortarRgb})`;
    const BLOCK_DARK   = isStone ? '#3b3631' : `rgb(${theme.wallDarkRgb})`;
    const BLOCK_BASE   = isStone ? '#4c453e' : `rgb(${theme.wallBaseRgb})`;
    const BLOCK_LIGHT  = isStone ? '#c9c3bd' : `rgb(${theme.wallLightRgb})`;

    const PALETTE = [
      BLOCK_DARK, BLOCK_DARK, BLOCK_DARK,
      BLOCK_BASE, BLOCK_BASE,
      BLOCK_LIGHT,
    ];
    
    const brickColor = (r, b) => PALETTE[Math.abs(r * 17 + b * 11 + r * b * 3 + x * 7 + y * 5) % PALETTE.length];

    const rr = (rx, ry, rw, rh, radius) => {
      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
      ctx.lineTo(rx, ry + radius);
      ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      ctx.closePath();
    };

    // 1 — Mortar background
    rr(bx0, by0, w, h, br);
    ctx.fillStyle = BLOCK_MORTAR;
    ctx.fill();
    ctx.clip(); 

    // 2 — Exactly 5 rows (WormHole standard)
    const rows = 5;
    const bh   = Math.floor((h - GAP * (rows + 1)) / rows);
    const bw3  = Math.floor((w - GAP * 4) / 3);

    for (let r = 0; r < rows; r++) {
      const byRow    = by0 + GAP + r * (bh + GAP);
      const staggered = r % 2 === 1;

      if (!staggered) {
        for (let b = 0; b < 3; b++) {
          const bxCol = bx0 + GAP + b * (bw3 + GAP);
          rr(bxCol, byRow, bw3, bh, br2);
          ctx.fillStyle = brickColor(r, b);
          ctx.fill();
        }
      } else {
        const halfW = Math.floor(bw3 / 2);
        
        // Left
        rr(bx0 + GAP, byRow, halfW, bh, br2);
        ctx.fillStyle = brickColor(r, 0);
        ctx.fill();

        // Middle 2
        for (let b = 0; b < 2; b++) {
          const bxCol = bx0 + GAP + halfW + GAP + b * (bw3 + GAP);
          rr(bxCol, byRow, bw3, bh, br2);
          ctx.fillStyle = brickColor(r, b + 1);
          ctx.fill();
        }

        // Right
        const rightHalfX = bx0 + GAP + halfW + GAP + bw3 + GAP + bw3 + GAP;
        rr(rightHalfX, byRow, halfW, bh, br2);
        ctx.fillStyle = brickColor(r, 3);
        ctx.fill();
      }
    }

    // 3 — Subtle outer border
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    // In local 36x36 coords, 0.8 is the exact WormHole border size
    ctx.lineWidth   = 0.8;
    rr(bx0, by0, w, h, br);
    ctx.stroke();

    ctx.restore();
  }

  // ─── Portal — Colored Ring with Center Dot ─────────────────────

  _drawPortal(x, y) {
    const ctx = this.ctx;
    const g = this.geo;
    const { px, py } = this._cellToPixel(x, y);

    // Find which portal pair this belongs to
    let pairIdx = 0;
    if (this.portals) {
      for (let i = 0; i < this.portals.length; i++) {
        const p = this.portals[i];
        if ((p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y)) {
          pairIdx = i;
          break;
        }
      }
    }

    const col = PORTAL_COLORS[pairIdx % PORTAL_COLORS.length];
    const ringRadius = g.cellSize * 0.32;
    const ringWidth = g.cellSize * 0.08;
    const dotRadius = g.cellSize * 0.08;

    // Outer glow
    ctx.fillStyle = `rgba(${col.r * 255 | 0}, ${col.g * 255 | 0}, ${col.b * 255 | 0}, 0.25)`;
    ctx.beginPath();
    ctx.arc(px, py, ringRadius + ringWidth, 0, Math.PI * 2);
    ctx.fill();

    // Main ring
    ctx.strokeStyle = `rgb(${col.r * 255 | 0}, ${col.g * 255 | 0}, ${col.b * 255 | 0})`;
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = 'rgb(38, 38, 38)';
    ctx.beginPath();
    ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

window.BoardRenderer = BoardRenderer;
