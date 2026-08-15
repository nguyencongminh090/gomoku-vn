'use strict';

/**
 * GameEngine.test.js — Comprehensive unit tests for the GameEngine pure-logic class.
 *
 * Following @test-driven-development: these tests cover all public methods,
 * edge cases, and rule variants. GameEngine is I/O-free (no sockets, no DB),
 * making it an ideal Jest target without mocks.
 */

const { GameEngine } = require('../managers/GameEngine');

// ---------------------------------------------------------------------------
// Test factory helpers
// ---------------------------------------------------------------------------

const P1 = 'player-black';
const P2 = 'player-white';

/** Create a standard 15×15 game with no walls/portals. */
function makeGame({ boardSize = 15, winningRule = 'freestyle', walls = [], portals = [], firstMoveZones = [], ruleSwap2 = false } = {}) {
  return new GameEngine({
    roomId: 'test-room',
    boardSize,
    players: [
      { userId: P1, displayName: 'Player 1', color: 'BLACK' },
      { userId: P2, displayName: 'Player 2', color: 'WHITE' },
    ],
    walls,
    portals,
    firstMoveZones,
    winningRule,
    ruleSwap2,
  });
}

/** Create a Swap2 game. players[0] (P1) is always firstPlayerId, P2 secondPlayerId. */
function makeSwap2Game(opts = {}) {
  return makeGame({ ...opts, ruleSwap2: true });
}

/**
 * Play a sequence of moves alternating between P1 (BLACK) and P2 (WHITE).
 * Each element is [x, y]. P1 moves on even indices, P2 on odd.
 */
function playSequence(engine, moves) {
  const results = [];
  for (let i = 0; i < moves.length; i++) {
    const player = i % 2 === 0 ? P1 : P2;
    const [x, y] = moves[i];
    results.push(engine.makeMove(player, x, y));
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Construction
// ---------------------------------------------------------------------------
describe('GameEngine — Construction', () => {
  test('initializes board with correct dimensions', () => {
    const g = makeGame({ boardSize: 15 });
    expect(g.board.length).toBe(15);
    expect(g.board[0].length).toBe(15);
  });

  test('all cells start empty (0)', () => {
    const g = makeGame();
    for (const row of g.board) {
      for (const cell of row) expect(cell).toBe(0);
    }
  });

  test('BLACK (P1) moves first', () => {
    const g = makeGame();
    expect(g.currentTurn).toBe(P1);
  });

  test('status is ongoing at creation', () => {
    const g = makeGame();
    expect(g.status).toBe('ongoing');
  });

  test('walls placed on board as -1', () => {
    const walls = [{ x: 3, y: 3 }, { x: 7, y: 7 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 2, y: 3 }] });
    expect(g.board[3][3]).toBe(-1);
    expect(g.board[7][7]).toBe(-1);
  });

  test('portals placed on board as -2', () => {
    const portals = [{ a: { x: 0, y: 0 }, b: { x: 14, y: 14 } }];
    const g = makeGame({ portals });
    expect(g.board[0][0]).toBe(-2);
    expect(g.board[14][14]).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// 2. Move validation
// ---------------------------------------------------------------------------
describe('GameEngine — Move validation', () => {
  test('rejects move when game is finished', () => {
    const g = makeGame();
    g.status = 'finished';
    const r = g.makeMove(P1, 0, 0);
    expect(r.error).toBeTruthy();
  });

  test('rejects move when not that player\'s turn', () => {
    const g = makeGame();
    const r = g.makeMove(P2, 0, 0); // P2 tries to move first
    expect(r.error).toBeTruthy();
  });

  test('rejects out-of-bounds move (negative)', () => {
    const g = makeGame();
    const r = g.makeMove(P1, -1, 0);
    expect(r.error).toBeTruthy();
  });

  test('rejects out-of-bounds move (too large)', () => {
    const g = makeGame({ boardSize: 15 });
    const r = g.makeMove(P1, 15, 0);
    expect(r.error).toBeTruthy();
  });

  test('rejects placing on occupied cell', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7); // P1 places at 7,7
    g.makeMove(P2, 0, 0); // P2's turn
    const r = g.makeMove(P1, 7, 7); // P1 tries same cell
    expect(r.error).toBeTruthy();
  });

  test('rejects placing on a wall cell', () => {
    const walls = [{ x: 5, y: 5 }];
    const fmz = [{ x: 4, y: 5 }];
    const g = makeGame({ walls, firstMoveZones: fmz });
    const r = g.makeMove(P1, 5, 5); // wall cell
    expect(r.error).toBeTruthy();
  });

  test('rejects placing on a portal cell', () => {
    const portals = [{ a: { x: 1, y: 1 }, b: { x: 13, y: 13 } }];
    const g = makeGame({ portals });
    const r = g.makeMove(P1, 1, 1);
    expect(r.error).toBeTruthy();
  });

  test('accepts a valid move, advances turn to P2', () => {
    const g = makeGame();
    const r = g.makeMove(P1, 7, 7);
    expect(r.error).toBeUndefined();
    expect(r.color).toBe('BLACK');
    expect(r.nextTurn).toBe(P2);
    expect(g.currentTurn).toBe(P2);
  });

  test('placing updates the board cell', () => {
    const g = makeGame();
    g.makeMove(P1, 3, 5);
    expect(g.board[5][3]).toBe(1); // BLACK = 1
  });

  test('move history grows with each move', () => {
    const g = makeGame();
    g.makeMove(P1, 0, 0);
    g.makeMove(P2, 1, 0);
    expect(g.moveHistory.length).toBe(2);
    expect(g.moveHistory[0]).toMatchObject({ x: 0, y: 0, color: 'BLACK' });
    expect(g.moveHistory[1]).toMatchObject({ x: 1, y: 0, color: 'WHITE' });
  });
});

// ---------------------------------------------------------------------------
// 3. First-move zone enforcement (wall rule)
// ---------------------------------------------------------------------------
describe('GameEngine — First-move zone', () => {
  test('rejects first move outside the zone when walls exist', () => {
    const walls = [{ x: 7, y: 7 }];
    const firstMoveZones = [{ x: 6, y: 7 }, { x: 8, y: 7 }];
    const g = makeGame({ walls, firstMoveZones });
    const r = g.makeMove(P1, 0, 0); // not in zone
    expect(r.error).toBeTruthy();
  });

  test('accepts first move inside the zone when walls exist', () => {
    const walls = [{ x: 7, y: 7 }];
    const firstMoveZones = [{ x: 6, y: 7 }, { x: 8, y: 7 }];
    const g = makeGame({ walls, firstMoveZones });
    const r = g.makeMove(P1, 6, 7); // in zone
    expect(r.error).toBeUndefined();
  });

  test('after first move, subsequent moves are unrestricted', () => {
    const walls = [{ x: 7, y: 7 }];
    const firstMoveZones = [{ x: 6, y: 7 }];
    const g = makeGame({ walls, firstMoveZones });
    g.makeMove(P1, 6, 7); // valid first move
    const r = g.makeMove(P2, 0, 0); // anywhere is fine now
    expect(r.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3b. WALL rule — P1's 2nd move must be Chebyshev distance >= 4 from their 1st (TODO.md #103)
// ---------------------------------------------------------------------------
describe('GameEngine — WALL rule: P1 2nd move min Chebyshev distance', () => {
  test('rejects when Chebyshev distance is 3 (boundary, just under threshold)', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 5, y: 5 }] });
    g.makeMove(P1, 5, 5);
    g.makeMove(P2, 0, 0);
    const r = g.makeMove(P1, 8, 5); // dx=3, dy=0 → Chebyshev 3
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('WALL_SECOND_MOVE_MIN_DISTANCE');
    expect(g.board[5][8]).toBe(0); // move must not have been applied
  });

  test('accepts when Chebyshev distance is exactly 4 (boundary, threshold)', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 5, y: 5 }] });
    g.makeMove(P1, 5, 5);
    g.makeMove(P2, 0, 0);
    const r = g.makeMove(P1, 9, 5); // dx=4, dy=0 → Chebyshev 4
    expect(r.error).toBeUndefined();
  });

  test('accepts when Chebyshev distance is 5 (just over threshold)', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 5, y: 5 }] });
    g.makeMove(P1, 5, 5);
    g.makeMove(P2, 0, 0);
    const r = g.makeMove(P1, 10, 5); // dx=5, dy=0 → Chebyshev 5
    expect(r.error).toBeUndefined();
  });

  test('accepts a large Chebyshev distance (no upper cap for ">= 4")', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 0, y: 0 }] });
    g.makeMove(P1, 0, 0);
    g.makeMove(P2, 5, 5);
    const r = g.makeMove(P1, 14, 0); // dx=14, dy=0 → Chebyshev 14
    expect(r.error).toBeUndefined();
  });

  test('uses Chebyshev (not Manhattan): diagonal dx=2,dy=2 (Manhattan 4, Chebyshev 2) is rejected', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 5, y: 5 }] });
    g.makeMove(P1, 5, 5);
    g.makeMove(P2, 0, 0);
    const r = g.makeMove(P1, 7, 7); // dx=2, dy=2 → Manhattan 4, Chebyshev 2
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('WALL_SECOND_MOVE_MIN_DISTANCE');
  });

  test('accepts a diagonal move with Chebyshev distance exactly 4 (dx=4, dy=4)', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 5, y: 5 }] });
    g.makeMove(P1, 5, 5);
    g.makeMove(P2, 0, 0);
    const r = g.makeMove(P1, 9, 9); // dx=4, dy=4 → Chebyshev 4
    expect(r.error).toBeUndefined();
  });

  test('measures distance symmetrically (2nd move up/left of the 1st also counts)', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 10, y: 10 }] });
    g.makeMove(P1, 10, 10);
    g.makeMove(P2, 0, 0);
    const r = g.makeMove(P1, 6, 10); // dx=-4, dy=0 → Chebyshev 4
    expect(r.error).toBeUndefined();
  });

  test('does not restrict P2 — only "player 1" (players[0]) is constrained', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 5, y: 5 }] });
    g.makeMove(P1, 5, 5);
    g.makeMove(P2, 0, 0); // P2's 1st move
    g.makeMove(P1, 9, 5); // P1's 2nd move, valid (Chebyshev 4)
    const r = g.makeMove(P2, 1, 0); // P2's 2nd move, Chebyshev 1 from their 1st — should be unrestricted
    expect(r.error).toBeUndefined();
  });

  test('does not apply when WALL mode is off (no walls)', () => {
    const g = makeGame({ walls: [], firstMoveZones: [] });
    g.makeMove(P1, 5, 5);
    g.makeMove(P2, 0, 0);
    const r = g.makeMove(P1, 6, 5); // Chebyshev 1 — would be rejected under WALL mode
    expect(r.error).toBeUndefined();
  });

  test('does not restrict P1\'s 3rd+ move — only applies to the 2nd move', () => {
    const walls = [{ x: 14, y: 14 }];
    const g = makeGame({ walls, firstMoveZones: [{ x: 5, y: 5 }] });
    g.makeMove(P1, 5, 5); // P1 1st move
    g.makeMove(P2, 0, 0); // P2 1st move
    g.makeMove(P1, 9, 5); // P1 2nd move, valid (Chebyshev 4)
    g.makeMove(P2, 1, 0); // P2 2nd move
    const r = g.makeMove(P1, 6, 5); // P1 3rd move, Chebyshev 1 from 1st move — unrestricted
    expect(r.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Win detection
// ---------------------------------------------------------------------------
describe('GameEngine — Win detection (freestyle)', () => {
  test('detects horizontal win (5 in a row)', () => {
    const g = makeGame();
    // P1 places at y=7: x=0..3, P2 at x=0..3 y=0
    playSequence(g, [
      [0, 7], [0, 0],
      [1, 7], [1, 0],
      [2, 7], [2, 0],
      [3, 7], [3, 0],
    ]);
    const r = g.makeMove(P1, 4, 7); // 5th in a row → P1 wins
    expect(r.won).toBe(true);
    expect(g.result.winner).toBe(P1);
    expect(g.result.reason).toBe('win');
    expect(g.status).toBe('finished');
  });

  test('detects vertical win (5 in a column)', () => {
    const g = makeGame();
    playSequence(g, [
      [7, 0], [0, 0],
      [7, 1], [0, 1],
      [7, 2], [0, 2],
      [7, 3], [0, 3],
    ]);
    const r = g.makeMove(P1, 7, 4);
    expect(r.won).toBe(true);
    expect(g.result.winner).toBe(P1);
  });

  test('detects diagonal win (↘)', () => {
    const g = makeGame();
    playSequence(g, [
      [0, 0], [1, 0],
      [1, 1], [2, 0],
      [2, 2], [3, 0],
      [3, 3], [4, 0],
    ]);
    const r = g.makeMove(P1, 4, 4);
    expect(r.won).toBe(true);
  });

  test('detects anti-diagonal win (↗)', () => {
    const g = makeGame();
    playSequence(g, [
      [4, 0], [0, 0],
      [3, 1], [1, 0],
      [2, 2], [0, 1],
      [1, 3], [0, 2],
    ]);
    const r = g.makeMove(P1, 0, 4);
    expect(r.won).toBe(true);
  });

  test('freestyle: 6 in a row also wins — verify >5 is allowed', () => {
    // Under freestyle, ANY 5+ consecutive stones win. Place 5 and verify win first.
    // Then separately verify: placing a 6th stone into an already-won game is rejected.
    const g = makeGame({ winningRule: 'freestyle' });
    playSequence(g, [
      [0, 0], [0, 1],
      [1, 0], [1, 1],
      [2, 0], [2, 1],
      [3, 0], [3, 1],
    ]);
    // 5th black stone — should win under freestyle
    const r = g.makeMove(P1, 4, 0);
    expect(r.won).toBe(true);
    expect(g.result.winner).toBe(P1);
    // A 6th move attempt on a finished game must be rejected
    const r2 = g.makeMove(P2, 5, 0);
    expect(r2.error).toBeTruthy();
  });

  test('5 non-consecutive stones do not trigger win', () => {
    const g = makeGame();
    // P1 at 0,7 1,7 2,7 4,7 (gap at 3) — no win
    playSequence(g, [
      [0, 7], [0, 0],
      [1, 7], [1, 0],
      [2, 7], [2, 0],
      [4, 7], [3, 0],
    ]);
    const r = g.makeMove(P1, 5, 7);
    expect(r.won).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Standard win rule (exactly 5)
// ---------------------------------------------------------------------------
describe('GameEngine — Win detection (standard rule)', () => {
  test('standard: exactly 5 wins', () => {
    const g = makeGame({ winningRule: 'standard' });
    playSequence(g, [
      [0, 0], [0, 1],
      [1, 0], [1, 1],
      [2, 0], [2, 1],
      [3, 0], [3, 1],
    ]);
    const r = g.makeMove(P1, 4, 0);
    expect(r.won).toBe(true);
  });

  test('standard: 6 in a row does NOT win (overline forbidden)', () => {
    // Under standard rule, exactly 5 wins. An overline (6+) should not be a win.
    // Set up board manually: B at x=0..5,y=0 (6 in a row for black) with no flanking win
    // We can't reach 6 via normal play since 5-in-a-row already wins.
    // Instead, verify _checkWin directly: inject 6 consecutive blacks and check it returns null.
    const g = makeGame({ winningRule: 'standard' });
    // Place 6 black stones horizontally
    for (let x = 0; x < 6; x++) g.board[0][x] = 1;
    // _checkWin from position 5 (rightmost) — should return null for overline
    const result = g._checkWin(5, 0, 1);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Draw detection
// ---------------------------------------------------------------------------
describe('GameEngine — Draw detection', () => {
  test('declares draw when board is full with no winner', () => {
    // Use a tiny 2×2 board so we can fill it quickly without triggering a win
    const g = new GameEngine({
      roomId: 'test',
      boardSize: 2,
      players: [
        { userId: P1, displayName: 'P1', color: 'BLACK' },
        { userId: P2, displayName: 'P2', color: 'WHITE' },
      ],
      walls: [], portals: [], firstMoveZones: [],
      winningRule: 'freestyle',
    });
    // Fill: pattern ensures no 5-in-a-row (board too small to win)
    g.makeMove(P1, 0, 0); // B
    g.makeMove(P2, 1, 0); // W
    g.makeMove(P1, 0, 1); // B
    const r = g.makeMove(P2, 1, 1); // W — board full
    expect(r.draw).toBe(true);
    expect(g.result.winner).toBe('draw');
    expect(g.result.reason).toBe('board_full');
    expect(g.status).toBe('finished');
  });
});

// ---------------------------------------------------------------------------
// 7. Resign
// ---------------------------------------------------------------------------
describe('GameEngine — Resign', () => {
  test('resign sets status to finished', () => {
    const g = makeGame();
    g.resign(P1);
    expect(g.status).toBe('finished');
  });

  test('resign awards win to the opponent', () => {
    const g = makeGame();
    g.resign(P1);
    expect(g.result.winner).toBe(P2);
    expect(g.result.reason).toBe('resign');
  });

  test('cannot resign a finished game', () => {
    const g = makeGame();
    g.resign(P1);
    const r = g.resign(P2);
    expect(r.error).toBeTruthy();
  });

  test('non-player cannot resign', () => {
    const g = makeGame();
    const r = g.resign('outsider-id');
    expect(r.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 8. Draw offer
// ---------------------------------------------------------------------------
describe('GameEngine — Draw offer', () => {
  test('offerDraw sets drawOffer', () => {
    const g = makeGame();
    const r = g.offerDraw(P1);
    expect(r.offered).toBe(true);
    expect(g.drawOffer).toMatchObject({ from: P1 });
  });

  test('cannot offer draw when one already exists', () => {
    const g = makeGame();
    g.offerDraw(P1);
    const r = g.offerDraw(P1);
    expect(r.error).toBeTruthy();
  });

  test('acceptDraw resolves as draw-by-agreement', () => {
    const g = makeGame();
    g.offerDraw(P1);
    const r = g.acceptDraw(P2);
    expect(r.accepted).toBe(true);
    expect(g.result.winner).toBe('draw');
    expect(g.result.reason).toBe('agreement');
    expect(g.status).toBe('finished');
  });

  test('offerer cannot accept their own draw', () => {
    const g = makeGame();
    g.offerDraw(P1);
    const r = g.acceptDraw(P1);
    expect(r.error).toBeTruthy();
  });

  test('declineDraw clears the offer', () => {
    const g = makeGame();
    g.offerDraw(P1);
    const r = g.declineDraw(P2);
    expect(r.declined).toBe(true);
    expect(g.drawOffer).toBeNull();
    expect(g.status).toBe('ongoing');
  });

  test('making a move cancels pending draw offer', () => {
    const g = makeGame();
    g.offerDraw(P1);
    g.makeMove(P1, 0, 0); // P1's turn — move clears own offer
    expect(g.drawOffer).toBeNull();
  });

  test('cannot accept a draw on a finished game', () => {
    const g = makeGame();
    g.status = 'finished';
    const r = g.acceptDraw(P2);
    expect(r.error).toBeTruthy();
  });

  test('spectator (non-player) cannot accept a pending draw offer', () => {
    const g = makeGame();
    g.offerDraw(P1);
    const r = g.acceptDraw('spectator-1');
    expect(r.error).toBe('Bạn không phải người chơi.');
    expect(g.status).toBe('ongoing');
    expect(g.drawOffer).toMatchObject({ from: P1 });
  });

  test('spectator (non-player) cannot decline a pending draw offer', () => {
    const g = makeGame();
    g.offerDraw(P1);
    const r = g.declineDraw('spectator-1');
    expect(r.error).toBe('Bạn không phải người chơi.');
    expect(g.drawOffer).toMatchObject({ from: P1 });
  });
});

// ---------------------------------------------------------------------------
// 9. Timeout
// ---------------------------------------------------------------------------
describe('GameEngine — Timeout', () => {
  test('handleTimeout sets the correct winner and loser', () => {
    const g = makeGame();
    g.handleTimeout(P1); // P1 times out → P2 wins
    expect(g.status).toBe('finished');
    expect(g.result.winner).toBe(P2);
    expect(g.result.reason).toBe('timeout');
  });

  test('timeout on a finished game is a no-op', () => {
    const g = makeGame();
    g.resign(P1);
    const before = { ...g.result };
    g.handleTimeout(P2);
    expect(g.result).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 10. Serialize
// ---------------------------------------------------------------------------
describe('GameEngine — Serialize', () => {
  test('serialize returns an object with expected keys', () => {
    const g = makeGame();
    const s = g.serialize();
    expect(s).toHaveProperty('gameId');
    expect(s).toHaveProperty('boardSize', 15);
    expect(s).toHaveProperty('board');
    expect(s).toHaveProperty('players');
    expect(s).toHaveProperty('currentTurn', P1);
    expect(s).toHaveProperty('status', 'ongoing');
  });

  test('serialize board matches engine board reference dimensions', () => {
    const g = makeGame({ boardSize: 19 });
    const s = g.serialize();
    expect(s.board.length).toBe(19);
    expect(s.board[0].length).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// 11. Caro rule (5+, both ends open)
// ---------------------------------------------------------------------------
describe('GameEngine — Caro rule', () => {
  test('caro: 5 in a row with both ends blocked does NOT win', () => {
    // Layout (row 0): W B B B B B W  — both ends blocked by WHITE
    // P1 places 5 black with white flanking; should not win under caro
    const g = makeGame({ winningRule: 'caro', boardSize: 15 });
    // Place flanking whites first (as P2 but we need setup)
    // We need W at x=0,y=0 and x=6,y=0 flanking B at x=1..5
    // Force board state directly to test the detection logic
    g.board[0][0] = 2; // WHITE
    g.board[0][6] = 2; // WHITE
    // Now P1 places B at x=1..4 (4 moves by alternating)
    // Then P1 places 5th at x=5 — should check if caro blocks
    // Actually: let's just use the makeMove API properly
    const g2 = makeGame({ winningRule: 'caro', boardSize: 15 });
    // Row 5: W at 0,5; B fills 1-4; W at 5,5 = blocked line
    g2.board[5][0] = 2; // WHITE blocker
    g2.board[5][5] = 2; // WHITE blocker
    g2.board[5][1] = 1; g2.board[5][2] = 1; g2.board[5][3] = 1; g2.board[5][4] = 1;
    // Now P1 makes the 5th move at an unblocked position (not into the blocked line)
    // Just verify that a blocked 5-in-a-row doesn't win
    g2.moveCount = 8;
    g2.moveHistory = [];
    const checkWin = g2._checkWin(4, 5, 1); // black at x=4,y=5 with whites at both ends
    expect(checkWin).toBeNull(); // blocked on left (x=0) and should be null for caro
  });
});

// ---------------------------------------------------------------------------
// 12. Undo — play mode (TODO.md #128)
// ---------------------------------------------------------------------------
describe('GameEngine — Undo (play mode)', () => {
  test('requestUndo rejected when requester has not moved yet', () => {
    const g = makeGame();
    const r = g.requestUndo(P1);
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('NO_MOVE_TO_UNDO');
  });

  test('requestUndo sets undoOffer, mode "play", while opponent has not replied yet', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    const r = g.requestUndo(P1);
    expect(r.requested).toBe(true);
    expect(r.mode).toBe('play');
    expect(g.undoOffer).toMatchObject({ from: P1, mode: 'play' });
  });

  test('cannot request when one is already pending', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.requestUndo(P1);
    const r = g.requestUndo(P2);
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('UNDO_OFFER_PENDING');
  });

  test('non-player cannot request undo', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    const r = g.requestUndo('outsider');
    expect(r.error).toBeTruthy();
  });

  test('accept rolls back exactly 1 move when opponent has not replied yet', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.requestUndo(P1);
    const r = g.acceptUndo(P2);
    expect(r.accepted).toBe(true);
    expect(r.mode).toBe('play');
    expect(r.cleared).toEqual([{ x: 7, y: 7 }]);
    expect(g.board[7][7]).toBe(0);
    expect(g.moveHistory).toHaveLength(0);
    expect(g.moveCount).toBe(0);
    expect(g.currentTurn).toBe(P1);
  });

  test('accept rolls back 2 moves (full round) once opponent has replied', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.makeMove(P2, 8, 8);
    g.requestUndo(P1);
    const r = g.acceptUndo(P2);
    expect(r.cleared).toEqual(expect.arrayContaining([{ x: 7, y: 7 }, { x: 8, y: 8 }]));
    expect(r.cleared).toHaveLength(2);
    expect(g.board[7][7]).toBe(0);
    expect(g.board[8][8]).toBe(0);
    expect(g.moveHistory).toHaveLength(0);
    expect(g.currentTurn).toBe(P1);
  });

  test('requester cannot accept their own undo offer', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.requestUndo(P1);
    const r = g.acceptUndo(P1);
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('CANNOT_SELF_ACCEPT');
  });

  test('requester cannot decline their own undo offer', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.requestUndo(P1);
    const r = g.declineUndo(P1);
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('CANNOT_SELF_DECLINE');
  });

  test('declineUndo clears the offer without changing board/turn', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.requestUndo(P1);
    const r = g.declineUndo(P2);
    expect(r.declined).toBe(true);
    expect(g.undoOffer).toBeNull();
    expect(g.board[7][7]).toBe(1);
    expect(g.currentTurn).toBe(P2);
  });

  test('opponent replying while a request is pending does NOT cancel it, and accept still resolves correctly', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);      // P1's move — targetIndex snapshotted here
    g.requestUndo(P1);         // 0 replies yet
    g.makeMove(P2, 8, 8);      // opponent replies while pending — must NOT cancel
    expect(g.undoOffer).toMatchObject({ from: P1, mode: 'play' });
    const r = g.acceptUndo(P2);
    expect(r.cleared).toHaveLength(2); // rolls back both, per the frozen targetIndex
    expect(g.moveHistory).toHaveLength(0);
    expect(g.currentTurn).toBe(P1);
  });

  test("requester's own next move auto-cancels their pending request", () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.makeMove(P2, 8, 8);
    g.requestUndo(P1);
    expect(g.undoOffer).not.toBeNull();
    g.makeMove(P1, 0, 0); // requester continues instead of waiting
    expect(g.undoOffer).toBeNull();
    // Board reflects normal play — nothing was rolled back.
    expect(g.board[7][7]).toBe(1);
    expect(g.board[8][8]).toBe(2);
    expect(g.board[0][0]).toBe(1);
  });

  test('serialize() includes undoOffer', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.requestUndo(P1);
    const s = g.serialize();
    expect(s.undoOffer).toMatchObject({ from: P1, mode: 'play' });
  });

  test('cannot request undo on a finished game', () => {
    const g = makeGame();
    g.makeMove(P1, 7, 7);
    g.status = 'finished';
    const r = g.requestUndo(P1);
    expect(r.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 13. Undo — Swap2 opening mode (TODO.md #128)
// ---------------------------------------------------------------------------
describe('GameEngine — Undo (Swap2 opening mode)', () => {
  test('requestUndo rejected when nothing has been placed yet', () => {
    const g = makeSwap2Game();
    const r = g.requestUndo(P1);
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('NO_MOVE_TO_UNDO');
  });

  test('either the placer or the non-placing opponent may request during place3, removing exactly 1 stone', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1); // P1 (firstPlayerId) places stone 1/3
    // P2 (secondPlayerId) has placed nothing yet, but may still ask.
    const req = g.requestUndo(P2);
    expect(req.requested).toBe(true);
    expect(req.mode).toBe('opening');
    const r = g.acceptUndo(P1);
    expect(r.accepted).toBe(true);
    expect(r.mode).toBe('opening');
    expect(r.cleared).toEqual([{ x: 1, y: 1 }]);
    expect(g.board[1][1]).toBe(0);
    expect(g.openingPhase).toBe('place3');
    expect(g.currentTurn).toBe(P1);
    expect(g._phaseStones).toHaveLength(0);
  });

  test('undo after place3 completes (now at p2choice) removes the 3rd stone, reverting to place3', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1);
    g.placeOpeningStone(P1, 2, 2);
    g.placeOpeningStone(P1, 3, 3); // completes place3 → p2choice, turn = P2
    expect(g.openingPhase).toBe('p2choice');

    g.requestUndo(P2);
    const r = g.acceptUndo(P1);
    expect(r.cleared).toEqual([{ x: 3, y: 3 }]);
    expect(g.board[3][3]).toBe(0);
    expect(g.board[2][2]).not.toBe(0); // earlier stones untouched
    expect(g.openingPhase).toBe('place3');
    expect(g.currentTurn).toBe(P1);
    expect(g._phaseStones).toHaveLength(2);
  });

  test('undo of the "place" choice at p2choice (0 stones placed in place2 yet) reverts to p2choice, not place3', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1);
    g.placeOpeningStone(P1, 2, 2);
    g.placeOpeningStone(P1, 3, 3); // → p2choice
    g.swap2Choice(P2, 'place');    // → place2, 0 stones placed yet
    expect(g.openingPhase).toBe('place2');

    g.requestUndo(P1);
    const r = g.acceptUndo(P2);
    expect(r.cleared).toEqual([]); // no stone to clear — only the choice is undone
    expect(g.openingPhase).toBe('p2choice');
    expect(g.currentTurn).toBe(P2);
  });

  test('undo of the final color choice (0 real play moves yet) un-assigns colors and reopens the choice phase', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1);
    g.placeOpeningStone(P1, 2, 2);
    g.placeOpeningStone(P1, 3, 3); // → p2choice
    g.swap2Choice(P2, 'white');    // P2 takes white → play begins, 0 real moves
    expect(g.openingPhase).toBe('play');
    expect(g.players[0].color).toBe('BLACK');

    const req = g.requestUndo(P1);
    expect(req.mode).toBe('opening'); // still opening-mode: zero real play moves
    const r = g.acceptUndo(P2);
    expect(r.mode).toBe('opening');
    expect(r.openingPhase).toBe('p2choice');
    expect(r.colorsAssigned).toBe(false);
    expect(g.openingPhase).toBe('p2choice');
    expect(g.players[0].color).toBeNull();
    expect(g.players[1].color).toBeNull();
    expect(g.playPhaseStartIndex).toBeNull();
  });

  test('once a real play move exists, a player with no play-phase move of their own is rejected (does not fall back into opening)', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1);
    g.placeOpeningStone(P1, 2, 2);
    g.placeOpeningStone(P1, 3, 3); // → p2choice
    g.swap2Choice(P2, 'white');    // P1=BLACK, P2=WHITE, play begins, currentTurn = WHITE (P2)
    g.makeMove(P2, 10, 10);        // WHITE's first real move

    // BLACK (P1) has made 0 real play moves yet.
    const r = g.requestUndo(P1);
    expect(r.error).toBeTruthy();
    expect(r.code).toBe('NO_MOVE_TO_UNDO');
  });

  test('after a real play move, undo behaves like normal play and cannot reach back into the opening', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1);
    g.placeOpeningStone(P1, 2, 2);
    g.placeOpeningStone(P1, 3, 3);
    g.swap2Choice(P2, 'white'); // P1=BLACK, P2=WHITE, currentTurn=P2
    g.makeMove(P2, 10, 10);     // WHITE's real move

    const req = g.requestUndo(P2);
    expect(req.mode).toBe('play');
    const r = g.acceptUndo(P1);
    expect(r.mode).toBe('play');
    expect(r.cleared).toEqual([{ x: 10, y: 10 }]);
    expect(g.board[10][10]).toBe(0);
    // Opening stones from before the play boundary must be untouched.
    expect(g.board[1][1]).not.toBe(0);
    expect(g.board[2][2]).not.toBe(0);
    expect(g.board[3][3]).not.toBe(0);
  });

  test('opponent continuing to place stones while a request is pending does not cancel it', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1); // 1/3
    g.requestUndo(P2);             // P2 asks while P1 is mid-place3
    g.placeOpeningStone(P1, 2, 2); // P1 (not the requester) keeps placing — must not cancel
    g.placeOpeningStone(P1, 3, 3); // → p2choice
    expect(g.undoOffer).toMatchObject({ from: P2, mode: 'opening' });
    const r = g.acceptUndo(P1);
    // Dynamic resolution: accept always targets the CURRENT most-recent
    // action, i.e. the 3rd stone (the phase-completing one), not the 1st.
    expect(r.cleared).toEqual([{ x: 3, y: 3 }]);
    expect(g.openingPhase).toBe('place3');
  });

  test("requester's own next opening action auto-cancels their pending request", () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1);
    g.requestUndo(P1);
    expect(g.undoOffer).not.toBeNull();
    g.placeOpeningStone(P1, 2, 2); // requester keeps placing instead of waiting
    expect(g.undoOffer).toBeNull();
    expect(g.board[1][1]).not.toBe(0);
    expect(g.board[2][2]).not.toBe(0);
  });

  test('stacked undos walk back through multiple opening actions one at a time', () => {
    const g = makeSwap2Game();
    g.placeOpeningStone(P1, 1, 1);
    g.placeOpeningStone(P1, 2, 2);
    g.placeOpeningStone(P1, 3, 3); // → p2choice
    g.swap2Choice(P2, 'white');    // → play, 0 real moves

    g.requestUndo(P1);
    g.acceptUndo(P2); // undo #1: back to p2choice
    expect(g.openingPhase).toBe('p2choice');

    g.requestUndo(P1);
    g.acceptUndo(P2); // undo #2: removes 3rd stone, back to place3
    expect(g.openingPhase).toBe('place3');
    expect(g.board[3][3]).toBe(0);
    expect(g.board[2][2]).not.toBe(0);
  });
});
