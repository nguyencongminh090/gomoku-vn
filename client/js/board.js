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
      //        + 140px bottom strip (fixed chat + focus-btn)
      const topReserve = 10 + 20 + tbH + 18;
      const bottomReserve = gcH + 18 + 140;
      boardAreaH = window.innerHeight - topReserve - bottomReserve;
      // Side padding: 10px each side in the CSS
      maxVw = window.innerWidth - 20;
    } else {
      // Normal layout: derive from the shell element which has
      // height: calc(100vh - 76px) on desktop.
      const boardAreaShell = document.querySelector('.board-area-shell');
      const boardAreaEl = document.querySelector('.board-area');
      boardAreaH = boardAreaShell
        ? boardAreaShell.clientHeight
        : (boardAreaEl ? boardAreaEl.clientHeight : (window.innerHeight - 76));
      // Subtract outer padding/border (14px) + inner padding (16px) + turn-bar +
      // controls + controls margin (12) + safety (8)
      boardAreaH = boardAreaH - 14 - 16 - tbH - gcH - 12 - 8;
      maxVw = boardAreaShell
        ? (boardAreaShell.clientWidth - 32)
        : (boardAreaEl ? (boardAreaEl.clientWidth - 32) : parent.clientWidth);
    }

    // Single-column layout (mobile, <=768px) has auto-height board-area in normal
    // mode, so height budget collapses — drive by width instead.
    // Focus mode always uses the viewport budget calculated above.
    const singleColumn = window.innerWidth <= 768;
    let rawSize = (singleColumn && !focusMode)
      ? maxVw
      : Math.min(maxVw, boardAreaH);
    // Cap to 860px to prevent the board looking comically large on big screens
    rawSize = Math.min(rawSize, 860);
    const s = Math.max(rawSize, 200); // usable minimum

    // Support High-DPI screens
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${s}px`;
    this.canvas.style.height = `${s}px`;
    this.canvas.width = s * dpr;
    this.canvas.height = s * dpr;

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

    // Margin for coordinate labels
    let margin = Math.min(w, h) * 0.06;
    margin = Math.max(margin, 24);

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
    if (!this.interactive || !this.isMyTurn || !this.onCellClick) return;
    e.preventDefault();
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

  /** Double-tap logic: first tap highlights, second tap confirms. */
  _handleCellSelect(x, y) {
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
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, '#F9F7F3');
      grad.addColorStop(1, '#EBE6DC');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#F9F8F6';
    }
    
    ctx.fillRect(0, 0, w, h);

    // Grid lines (crisp teal for standard/caro, darker for stone)
    ctx.strokeStyle = this.displayMode === 'stone'
      ? 'rgba(0, 0, 0, 0.15)'
      : 'rgba(15, 118, 110, 0.22)';
    // Use thinner lines on high-DPI for elegance
    const dpr = window.devicePixelRatio || 1;
    ctx.lineWidth = dpr > 1 ? 0.75 : 1.0;
    
    ctx.beginPath();
    for (let i = 0; i < lineCount; i++) {
      // Vertical
      const vx = g.originX + i * g.cellSize;
      ctx.moveTo(vx, g.originY);
      ctx.lineTo(vx, g.originY + gridH);
      // Horizontal
      const hy = g.originY + i * g.cellSize;
      ctx.moveTo(g.originX, hy);
      ctx.lineTo(g.originX + gridW, hy);
    }
    ctx.stroke();

    // Board border (thicker and slightly darker)
    ctx.strokeStyle = this.displayMode === 'stone'
      ? 'rgba(0, 0, 0, 0.25)'
      : 'rgba(15, 118, 110, 0.4)';
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
      : 'rgba(15, 118, 110, 0.5)';
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

    ctx.fillStyle = this.displayMode === 'stone'
      ? 'rgba(0, 0, 0, 0.4)'
      : 'rgba(15, 118, 110, 0.5)';
    ctx.font = `600 ${fontSize}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = '1px';
    }

    // Column letters (A, B, C, ...)
    for (let x = 0; x < g.boardSize; x++) {
      const ch = String.fromCharCode(65 + x);
      const px = this.displayMode === 'stone'
        ? g.originX + x * g.cellSize
        : g.originX + (x + 0.5) * g.cellSize;
      const py = g.originY - labelOffset;
      ctx.fillText(ch, px, py);
    }

    // Row numbers (1, 2, 3, ...)
    ctx.textAlign = 'center';
    for (let y = 0; y < g.boardSize; y++) {
      const text = String(y + 1);
      const px = g.originX - labelOffset;
      const py = this.displayMode === 'stone'
        ? g.originY + y * g.cellSize
        : g.originY + (y + 0.5) * g.cellSize;
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

    // Elegant subtle rounded box highlight
    ctx.fillStyle = 'rgba(15, 118, 110, 0.15)'; // Brand teal with low opacity
    
    // Draw rounded rect manually
    const r = 6;
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
      ctx.fillStyle = 'rgba(15, 118, 110, 0.06)';
      ctx.strokeStyle = 'rgba(15, 118, 110, 0.5)';
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
    ctx.fillStyle = 'rgba(72, 135, 95, 0.3)';
    ctx.fillRect(px - half, py - half, half * 2, half * 2);

    // Green border ring
    ctx.strokeStyle = 'rgba(72, 135, 95, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - half, py - half, half * 2, half * 2);

    // Draw semi-transparent preview piece
    const r = g.cellSize * 0.32;
    if (this.myColor === 'BLACK') {
      // X cross preview
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#1A1714';
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
      ctx.strokeStyle = '#1A1714';
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
    const lw = Math.max(g.cellSize * 0.1, 2);

    ctx.strokeStyle = 'rgb(15, 23, 42)'; // Sleek slate-900 ink
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
    const lw = Math.max(g.cellSize * 0.1, 2);

    // White fill (no fill, just red ink outline for elegant paper look)
    
    // Sleek red ink outline
    ctx.strokeStyle = 'rgb(225, 29, 72)'; // Rose-600
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

    // Classic Stone/Grey Palette
    const BLOCK_MORTAR = '#4B5563';
    const BLOCK_DARK   = '#6B7280';
    const BLOCK_BASE   = '#9CA3AF';
    const BLOCK_LIGHT  = '#D1D5DB';

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
