'use strict';

/**
 * diag-board.js — the solo measurement board (TODO.md #168 step 5).
 *
 * Composes the REAL `BoardRenderer` and the REAL optimistic-stone overlay
 * (#153). Nothing about the board or the stones is reimplemented here — that
 * is both user_story.md R4 (fidelity: what we measure must be the path the
 * player actually uses) and the standing board/stones lock in the
 * design-workflow skill.
 *
 * WHAT IT TIMES
 * -------------
 *   inputPaintMs   pointerdown -> optimistic stone painted. Pure client
 *                  render cost; no network in it at all.
 *   moveConfirmMs  click -> server ack for that move.
 *   timerHandoffMs click -> the `diag:timer` that reflects the BOT's reply.
 *                  This is the c->s->c figure #167 is waiting on, which is
 *                  why it is timed separately from the ack: the ack proves
 *                  the server heard us, the timer proves the clock came back.
 *
 * All three use `performance.now()`, never `Date.now()`: a wall-clock
 * adjustment mid-move would otherwise show up as a multi-second round trip.
 */

// `root` is a parameter of the WRAPPER, not of the factory — the factory is a
// separate function literal and cannot see it. It has to be passed in, the
// same way latency-probe-session.js takes TimerSyncCore. (Getting this wrong
// throws "root is not defined" only in a browser: nothing in the Jest suite
// loads this file, so a real page is the only place it shows up.)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis);
  } else {
    root.DiagBoard = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {

  const mono = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  class DiagBoard {
    /**
     * @param {object} opts
     * @param {HTMLCanvasElement} opts.canvas
     * @param {object} opts.socket   a /diag socket
     * @param {object} opts.session  the LatencyProbeSession collecting samples
     * @param {function} [opts.onMove]     (info) => void, after each exchange
     * @param {function} [opts.onEnded]    (payload) => void
     * @param {function} [opts.onRefused]  (code) => void
     */
    constructor(opts) {
      this.socket = opts.socket;
      this.session = opts.session;
      this.onMove = opts.onMove || (() => {});
      this.onEnded = opts.onEnded || (() => {});
      this.onRefused = opts.onRefused || (() => {});

      this.boardSize = 17;
      this.board = null;
      this.myColor = 'BLACK';
      this.busy = false;
      /** Set while a move is in flight, so the timer event can be attributed. */
      this._pendingMoveAt = null;

      this.renderer = new root.BoardRenderer(opts.canvas, {
        boardSize: this.boardSize,
        // Single-tap: the room's default is tap-to-select-then-confirm, which
        // is right for a ranked game but would double every click here and
        // halve the number of measurements a 60s run collects.
        clickMode: 'single',
        onCellClick: (x, y) => this._onCell(x, y),
      });

      this._onTimer = (sync) => this._handleTimer(sync);
      this._onEnded = (payload) => { this.onEnded(payload); };
      this.socket.on('diag:timer', this._onTimer);
      this.socket.on('diag:ended', this._onEnded);
    }

    /** Adopt the server's opening state and draw. */
    init(game) {
      this.boardSize = game.boardSize;
      this.board = game.board;
      this.renderer.setState({
        boardSize: game.boardSize,
        board: game.board,
        walls: [],
        portals: [],
        firstMoveZones: [],
        showZones: false,
        moveHistory: [],
        displayMode: 'paper',
        isMyTurn: true,
        interactive: true,
        myColor: 'BLACK',
      });
      this.renderer.resize();
    }

    resize() { this.renderer.resize(); }

    /**
     * A click on an intersection.
     *
     * The optimistic stone goes down BEFORE the emit, exactly as the room
     * does it (#153/#155) — that ordering is what makes inputPaintMs a
     * measurement of the device rather than of the network.
     */
    _onCell(x, y) {
      if (this.busy || !this.board) return;
      if (this.board[y][x] !== 0) return;
      this.busy = true;

      const t0 = mono();
      this.renderer.setOptimisticStone({ x, y, color: this.myColor });
      this.session.recordInputPaint(mono() - t0);

      this._pendingMoveAt = t0;

      this.socket.emit('diag:move', { x, y }, (res) => {
        this.session.recordMoveConfirm(mono() - t0);

        if (!res || res.error) {
          // Clearing the overlay IS the rollback — the confirmed board is
          // only ever written from server data (#153).
          this.renderer.setOptimisticStone(null);
          this.busy = false;
          this._pendingMoveAt = null;
          this.onRefused(res && res.code);
          return;
        }

        for (const m of res.moves || []) {
          this.board[m.y][m.x] = m.color === 'BLACK' ? 1 : 2;
        }
        this.renderer.setOptimisticStone(null);
        this.renderer.setState({
          board: this.board,
          lastMove: res.moves && res.moves.length
            ? res.moves[res.moves.length - 1]
            : undefined,
          isMyTurn: true,
        });

        // Server-measured time the player's clock actually ran for this move.
        // With near-zero think time it is a floor on transit cost — the #167
        // discriminator — and it belongs in the JSONL, not only in the log.
        if (Number.isFinite(res.spentMs)) this.session.recordSpentFloor(res.spentMs);

        this.session.recordMove();
        this.busy = false;
        this.onMove({ moves: res.moves, status: res.status });
      });
    }

    /**
     * A clock reading from the server. When one arrives while a move is in
     * flight, it is the far end of the c->s->c handoff — the #167 number.
     */
    _handleTimer(sync) {
      if (this._pendingMoveAt !== null) {
        this.session.recordTimerHandoff(mono() - this._pendingMoveAt);
        this._pendingMoveAt = null;
      }
      this.lastSync = sync;
    }

    /** Remaining seconds for the player, for the on-screen clock. */
    remainingSeconds() {
      if (!this.lastSync) return null;
      return this.lastSync.black;
    }

    destroy() {
      this.renderer.setState({ interactive: false });
      if (this.socket.off) {
        this.socket.off('diag:timer', this._onTimer);
        this.socket.off('diag:ended', this._onEnded);
      }
    }
  }

  return DiagBoard;
});
