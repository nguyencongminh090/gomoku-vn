'use strict';
// #427 — Taraguchi-10 and Yamaguchi opening step machines in GameEngine.
const { GameEngine } = require('../managers/GameEngine');
const RenjuOpenings = require('../../client/js/renju-openings');

const P1 = 'p1';
const P2 = 'p2';
function game(openingRule, opts = {}) {
  return new GameEngine({
    roomId: 'r', boardSize: 15, walls: [], portals: [], firstMoveZones: [], winningRule: 'renju', openingRule,
    players: [{ userId: P1, displayName: 'A', color: null }, { userId: P2, displayName: 'B', color: null }],
    ...opts,
  });
}
const ok = (r) => { expect(r.error).toBeUndefined(); return r; };
/** Taraguchi to the choice step, with swaps as given (array of 'stay'|'swap', 3 entries). */
function tgToChoice(g, swaps = ['stay', 'stay', 'stay']) {
  const stones = [[7, 7], [8, 6], [9, 7], [7, 10]];
  stones.forEach(([x, y], i) => {
    ok(g.placeOpeningStone(g.currentTurn, x, y));
    if (i < 3) ok(g.swap2Choice(g.currentTurn, swaps[i]));
  });
}

describe('Taraguchi-10', () => {
  test('starts with P1 as tentative Black placing the centre; colours unassigned', () => {
    const g = game('taraguchi10');
    expect(g.openingPhase).toBe('rx_place');
    expect(g.currentTurn).toBe(P1);
    expect(g.players.map((p) => p.color)).toEqual([null, null]);
    expect(g.serialize().swap2).toMatchObject({ enabled: true, rule: 'taraguchi10', step: 'place', stoneColor: 'BLACK', zone: 0, tentativeBlackId: P1 });
  });

  test.each([
    ['B1 off centre', [], [8, 7]],
    ['W2 outside 3x3', [[7, 7, 'stay']], [9, 7]],
    ['B3 outside 5x5', [[7, 7, 'stay'], [8, 8, 'stay']], [10, 7]],
    ['W4 outside 7x7', [[7, 7, 'stay'], [8, 8, 'stay'], [9, 9, 'stay']], [11, 7]],
  ])('%s is refused', (_, before, [x, y]) => {
    const g = game('taraguchi10');
    for (const [bx, by, c] of before) { ok(g.placeOpeningStone(g.currentTurn, bx, by)); ok(g.swap2Choice(g.currentTurn, c)); }
    expect(g.placeOpeningStone(g.currentTurn, x, y).code).toBe(before.length ? 'OPENING_OUT_OF_ZONE' : 'OPENING_NOT_CENTRE');
  });

  test('swap after B1: the white holder decides; swapping makes them Black and hands W2 to the old Black', () => {
    const g = game('taraguchi10');
    ok(g.placeOpeningStone(P1, 7, 7));
    expect(g.openingPhase).toBe('rx_swap');
    expect(g.currentTurn).toBe(P2);
    expect(g.swap2Choice(P1, 'swap').code).toBe('NOT_YOUR_TURN_TO_CHOOSE');
    ok(g.swap2Choice(P2, 'swap'));
    expect(g.tentativeBlackId).toBe(P2);
    expect(g.currentTurn).toBe(P1); // P1 now holds White and places W2
    expect(g.serialize().swap2).toMatchObject({ step: 'place', stoneColor: 'WHITE', zone: 1 });
  });

  test('normal moves are blocked during the opening (colour is null)', () => {
    const g = game('taraguchi10');
    expect(g.makeMove(P1, 7, 7).code).toBe('SWAP2_IN_PROGRESS');
  });

  test('move 3 names the opening', () => {
    const g = game('taraguchi10');
    ok(g.placeOpeningStone(P1, 7, 7)); ok(g.swap2Choice(P2, 'stay'));
    ok(g.placeOpeningStone(P2, 8, 6)); ok(g.swap2Choice(P1, 'stay'));
    const r = ok(g.placeOpeningStone(P1, 9, 5));
    expect(r.openingNamed).toBe(true);
    expect(g.opening).toMatchObject({ group: 'indirect', name: 'Chosei' });
  });

  test('choice 1 (stay): B5 inside 9x9, then White holder may swap, game starts with White to move', () => {
    const g = game('taraguchi10');
    tgToChoice(g);
    expect(g.openingPhase).toBe('rx_choice');
    expect(g.currentTurn).toBe(P1); // Black holder
    ok(g.swap2Choice(P1, 'stay'));
    expect(g.placeOpeningStone(P1, 12, 7).code).toBe('OPENING_OUT_OF_ZONE'); // 9x9 = |d| <= 4
    ok(g.placeOpeningStone(P1, 11, 7));
    expect(g.currentTurn).toBe(P2);
    const r = ok(g.swap2Choice(P2, 'swap'));
    expect(r.done).toBe(true);
    expect(g.openingPhase).toBe('play');
    expect(g.players.find((p) => p.userId === P2).color).toBe('BLACK');
    expect(g.currentTurn).toBe(P1); // P1 is White and plays move 6
    expect(g.playPhaseStartIndex).toBe(5);
    ok(g.makeMove(P1, 0, 0));
  });

  test('choice "swap" exchanges colours before B5', () => {
    const g = game('taraguchi10');
    tgToChoice(g);
    ok(g.swap2Choice(P1, 'swap'));
    expect(g.tentativeBlackId).toBe(P2);
    expect(g.currentTurn).toBe(P2);
  });

  test('choice 2: ten non-symmetric offers, White picks one, others vanish', () => {
    const g = game('taraguchi10');
    tgToChoice(g);
    ok(g.swap2Choice(P1, 'offer'));
    expect(g.serialize().swap2).toMatchObject({ step: 'offer', offerN: 10, stoneColor: 'BLACK' });
    const cells = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0]];
    cells.forEach(([x, y]) => ok(g.placeOpeningStone(P1, x, y)));
    expect(g.openingPhase).toBe('rx_pick');
    expect(g.currentTurn).toBe(P2);
    expect(g.board[0][3]).toBe(0); // offers stay off the board
    expect(g.moveHistory).toHaveLength(4);
    expect(g.placeOpeningStone(P2, 14, 14).code).toBe('NOT_AN_OFFER');
    const r = ok(g.placeOpeningStone(P2, 3, 0));
    expect(r.done).toBe(true);
    expect(g.board[0][3]).toBe(1);
    expect(g.moveHistory).toHaveLength(5);
    expect(g.serialize().swap2.offers).toEqual([]);
    expect(g.currentTurn).toBe(P2); // White moves 6
  });
});

describe('offer symmetry', () => {
  // Stones 1-4 symmetric about the vertical axis through the centre: x ↔ 14-x keeps them.
  function symGame() {
    const g = game('taraguchi10');
    [[7, 7], [7, 6], [7, 9], [7, 4]].forEach(([x, y], i) => {
      ok(g.placeOpeningStone(g.currentTurn, x, y));
      if (i < 3) ok(g.swap2Choice(g.currentTurn, 'stay'));
    });
    ok(g.swap2Choice(g.currentTurn, 'offer'));
    return g;
  }
  test('a mirror image of an earlier offer is refused; a duplicate too', () => {
    const g = symGame();
    ok(g.placeOpeningStone(P1, 5, 7));
    expect(g.placeOpeningStone(P1, 9, 7).code).toBe('OFFER_SYMMETRIC');
    expect(g.placeOpeningStone(P1, 5, 7).code).toBe('OFFER_SYMMETRIC');
    ok(g.placeOpeningStone(P1, 5, 8)); // not an image of (5,7)
  });
  test('fixingSymmetries: an asymmetric position keeps only the identity', () => {
    const stones = [{ x: 7, y: 7, color: 'BLACK' }, { x: 8, y: 6, color: 'WHITE' }, { x: 10, y: 7, color: 'BLACK' }];
    expect(RenjuOpenings.fixingSymmetries(stones, 15)).toHaveLength(1);
  });
  test('every legal Taraguchi/Yamaguchi first three moves name one of the 26 openings', () => {
    const c = 7;
    let n = 0;
    for (let wx = -1; wx <= 1; wx++) for (let wy = -1; wy <= 1; wy++) {
      if (!wx && !wy) continue;
      for (let bx = -2; bx <= 2; bx++) for (let by = -2; by <= 2; by++) {
        if ((!bx && !by) || (bx === wx && by === wy)) continue;
        const o = RenjuOpenings.detectOpening([{ x: c, y: c }, { x: c + wx, y: c + wy }, { x: c + bx, y: c + by }], 15);
        expect(o).not.toBeNull();
        n++;
      }
    }
    expect(n).toBe(8 * 23);
  });
});

describe('Yamaguchi', () => {
  function ymToSwap(g, n = 2) {
    ok(g.placeOpeningStone(P1, 7, 7));
    expect(g.currentTurn).toBe(P1);
    ok(g.placeOpeningStone(P1, 7, 6));
    expect(g.currentTurn).toBe(P1); // the first player places all three
    ok(g.placeOpeningStone(P1, 7, 5));
    expect(g.openingPhase).toBe('rx_declare');
    ok(g.swap2Choice(P1, 'declare', n));
  }
  test.each([[0], [11], ['3x'], [NaN], [undefined], [2.5]])('declare N=%p is refused', (n) => {
    const g = game('yamaguchi');
    ok(g.placeOpeningStone(P1, 7, 7)); ok(g.placeOpeningStone(P1, 7, 6)); ok(g.placeOpeningStone(P1, 7, 5));
    expect(g.swap2Choice(P1, 'declare', n).code).toBe('INVALID_CHOICE');
  });
  test('the second player may swap, then White plays 4 anywhere, Black offers N, White picks', () => {
    const g = game('yamaguchi');
    ymToSwap(g, 2);
    expect(g.currentTurn).toBe(P2);
    expect(g.serialize().swap2.offerN).toBe(2);
    ok(g.swap2Choice(P2, 'swap'));
    expect(g.tentativeBlackId).toBe(P2);
    expect(g.currentTurn).toBe(P1); // P1 now White, plays 4 anywhere
    ok(g.placeOpeningStone(P1, 0, 14));
    expect(g.currentTurn).toBe(P2);
    ok(g.placeOpeningStone(P2, 3, 3));
    ok(g.placeOpeningStone(P2, 11, 3));
    expect(g.openingPhase).toBe('rx_pick');
    expect(g.currentTurn).toBe(P1);
    const r = ok(g.placeOpeningStone(P1, 11, 3));
    expect(r.done).toBe(true);
    expect(g.players.find((p) => p.userId === P1).color).toBe('WHITE');
    expect(g.currentTurn).toBe(P1);
  });
  test('N=1: one offer then pick', () => {
    const g = game('yamaguchi');
    ymToSwap(g, 1);
    ok(g.swap2Choice(P2, 'stay'));
    ok(g.placeOpeningStone(P2, 0, 0)); // P2 White
    ok(g.placeOpeningStone(P1, 3, 3));
    expect(g.openingPhase).toBe('rx_pick');
  });
});

describe('undo through the opening', () => {
  test('each accepted undo steps back one action, restoring tentative Black, offers and N', () => {
    const g = game('yamaguchi');
    ok(g.placeOpeningStone(P1, 7, 7)); ok(g.placeOpeningStone(P1, 7, 6)); ok(g.placeOpeningStone(P1, 7, 5));
    ok(g.swap2Choice(P1, 'declare', 3));
    ok(g.swap2Choice(P2, 'swap'));
    ok(g.placeOpeningStone(P1, 0, 14));
    ok(g.placeOpeningStone(P2, 3, 3));
    const undo = () => { ok(g.requestUndo(P1)); return ok(g.acceptUndo(P2)); };
    let r = undo(); // the offer
    expect(g.offers).toEqual([]);
    expect(r.openingPhase).toBe('rx_offer');
    expect(r.nextColor).toBe('BLACK');
    undo(); // W4
    expect(g.board[0][0]).toBe(0);
    expect(g.board[14][0]).toBe(0);
    undo(); // swap
    expect(g.tentativeBlackId).toBe(P1);
    expect(g.currentTurn).toBe(P2);
    undo(); // declare
    expect(g.offerN).toBeNull();
    expect(g.openingPhase).toBe('rx_declare');
    undo(); // B3
    expect(g.opening).toBeNull();
    expect(g.moveCount).toBe(2);
  });
  test('undo of the final pick returns to the pick step with all offers', () => {
    const g = game('yamaguchi');
    ok(g.placeOpeningStone(P1, 7, 7)); ok(g.placeOpeningStone(P1, 7, 6)); ok(g.placeOpeningStone(P1, 7, 5));
    ok(g.swap2Choice(P1, 'declare', 2)); ok(g.swap2Choice(P2, 'stay'));
    ok(g.placeOpeningStone(P2, 0, 14)); ok(g.placeOpeningStone(P1, 3, 3)); ok(g.placeOpeningStone(P1, 11, 3));
    ok(g.placeOpeningStone(P2, 3, 3));
    expect(g.openingPhase).toBe('play');
    ok(g.requestUndo(P1)); const r = ok(g.acceptUndo(P2));
    expect(r.mode).toBe('opening');
    expect(g.openingPhase).toBe('rx_pick');
    expect(g.colorsAssigned).toBe(false);
    expect(g.offers).toEqual([{ x: 3, y: 3 }, { x: 11, y: 3 }]);
    expect(g.board[3][3]).toBe(0);
  });
});

test('openingRule is ignored with Swap2 on', () => {
  const g = game('taraguchi10', { ruleSwap2: true });
  expect(g.openingRule).toBeNull();
  expect(g.openingPhase).toBe('place3');
});

describe('settings: applyOpeningRule (rooms, challenges, tournaments)', () => {
  const { applyOpeningRule } = require('../managers/rules');
  const base = (o) => ({ boardSize: 15, winningRule: 'renju', ruleSwap2: false, ruleWall: false, rulePortal: false, ...o });
  test.each([
    ['kept on Renju 15x15, forces Swap2/walls off', base({ ruleSwap2: true, ruleWall: true }), 'taraguchi10', 'taraguchi10'],
    ['dropped on another winning rule', base({ winningRule: 'freestyle' }), 'yamaguchi', null],
    ['dropped on 17x17', base({ boardSize: 17 }), 'yamaguchi', null],
    ['unknown value dropped', base(), 'swap', null],
    ['absent = null', base(), undefined, null],
  ])('%s', (_, s, openingRule, expected) => {
    const out = applyOpeningRule(s, { openingRule });
    expect(out.openingRule).toBe(expected);
    if (expected) expect(out).toMatchObject({ ruleSwap2: false, ruleWall: false, rulePortal: false });
  });
});
