'use strict';

/**
 * RenjuOpening.js — Taraguchi-10 and Yamaguchi opening step machines (TODO.md #427).
 *
 * Runs on a GameEngine whose `openingRule` is set. Like Swap2, player colours stay null until the
 * opening ends; `engine.tentativeBlackId` holds whoever currently owns Black. A program is a list of
 * steps; `engine._rxStep` is the index of the current one. Steps:
 *   place   — put stone `color` inside the central (2*zone+1) square (zone null = anywhere).
 *             by 'first' = the first player places it (Yamaguchi 1-3), else the colour's holder.
 *   swap    — the holder of the NEXT stone's colour chooses 'swap' | 'stay'.
 *   declare — the first player declares N (1..10) 5th moves to offer (Yamaguchi).
 *   choice  — Black's holder: 'stay' | 'swap' (choice 1: one 5th in 9x9) or 'offer' (choice 2) (Taraguchi-10).
 *   offer   — Black's holder places N candidate 5th moves anywhere; none symmetric to another (kept off the board).
 *   pick    — White's holder picks one candidate; it becomes move 5. The opening ends.
 * Every opening ends with White to move (same invariant as Swap2's _assignColors()).
 * Rules: docs/knowledge/renju-rif-rules.md (renju.net/rule/25, /rule/5).
 */

const RenjuOpenings = require('../../client/js/renju-openings');

const B = 'BLACK';
const W = 'WHITE';
const MAX_N = 10; // Yamaguchi N cap (user 2026-11-21); Taraguchi-10 always offers 10

const PROGRAMS = {
  taraguchi10: [
    { t: 'place', color: B, zone: 0 },      // 0
    { t: 'swap' },                          // 1
    { t: 'place', color: W, zone: 1 },      // 2
    { t: 'swap' },                          // 3
    { t: 'place', color: B, zone: 2 },      // 4
    { t: 'swap' },                          // 5
    { t: 'place', color: W, zone: 3 },      // 6
    { t: 'choice' },                        // 7: stay|swap → 8, offer → 10
    { t: 'place', color: B, zone: 4 },      // 8
    { t: 'swap', end: true },               // 9
    { t: 'offer' },                         // 10 (choice 'offer' sets N = 10)
    { t: 'pick' },                          // 11
  ],
  yamaguchi: [
    { t: 'place', color: B, zone: 0, by: 'first' },
    { t: 'place', color: W, zone: 1, by: 'first' },
    { t: 'place', color: B, zone: 2, by: 'first' },
    { t: 'declare' },
    { t: 'swap' },
    { t: 'place', color: W, zone: null },
    { t: 'offer' },                         // n = declared N
    { t: 'pick' },
  ],
};
const CHOICE_PLACE5 = 8;
const CHOICE_OFFER = 10;

const RULES = Object.keys(PROGRAMS);

function step(engine) { return PROGRAMS[engine.openingRule][engine._rxStep]; }
function other(engine, id) { return id === engine.firstPlayerId ? engine.secondPlayerId : engine.firstPlayerId; }
function holder(engine, color) { return color === B ? engine.tentativeBlackId : other(engine, engine.tentativeBlackId); }
/** Colour of the next real stone: moves alternate B, W, B, … (offers are move 5 = Black). */
function nextStoneColor(engine) { return engine.moveCount % 2 === 0 ? B : W; }
function offerCount(engine) { return engine.offerN; }

/** Who acts at the current step. */
function actor(engine) {
  const s = step(engine);
  switch (s.t) {
    case 'place': return s.by === 'first' ? engine.firstPlayerId : holder(engine, s.color);
    case 'swap': return holder(engine, nextStoneColor(engine));
    case 'declare': return engine.firstPlayerId;
    case 'choice': case 'offer': return holder(engine, B);
    case 'pick': return holder(engine, W);
    default: return null;
  }
}

function enter(engine, index) {
  engine._rxStep = index;
  engine.openingPhase = 'rx_' + step(engine).t;
  engine.currentTurn = actor(engine);
}

function init(engine) {
  engine.tentativeBlackId = engine.firstPlayerId;
  engine.offers = [];
  engine.offerN = null;
  enter(engine, 0);
}

function finish(engine) {
  const black = engine.tentativeBlackId;
  engine._assignColors(engine.players[0].userId === black ? B : W, engine.players[1].userId === black ? B : W);
}

function inZone(engine, x, y, zone) {
  if (zone === null || zone === undefined) return true;
  const c = Math.floor(engine.boardSize / 2);
  return Math.abs(x - c) <= zone && Math.abs(y - c) <= zone;
}

function result(engine, extra) {
  return {
    ok: true,
    done: engine.openingPhase === 'play',
    openingPhase: engine.openingPhase,
    currentTurn: engine.currentTurn,
    nextColor: engine.openingPhase === 'play' ? null : stepColor(engine),
    ...extra,
  };
}

/** Colour of the stone the current step places (place/offer), else null. */
function stepColor(engine) {
  const s = step(engine);
  if (s.t === 'place') return s.color;
  if (s.t === 'offer') return B;
  return null;
}

/** A board click during the opening: place / offer / pick. Bounds + occupancy already checked by the engine. */
function place(engine, userId, x, y) {
  const s = step(engine);
  if (s.t !== 'place' && s.t !== 'offer' && s.t !== 'pick') {
    return { error: 'Không trong giai đoạn đặt quân mở màn.', code: 'NOT_IN_OPENING_PHASE' };
  }
  if (userId !== engine.currentTurn) return { error: 'Chưa đến lượt bạn.', code: 'NOT_YOUR_TURN' };

  if (s.t === 'place') {
    if (!inZone(engine, x, y, s.zone)) {
      if (s.zone === 0) return { error: 'Quân đầu tiên phải đặt ở tâm bàn.', code: 'OPENING_NOT_CENTRE' };
      return { error: `Quân này phải đặt trong ô ${2 * s.zone + 1}x${2 * s.zone + 1} ở giữa bàn.`, code: 'OPENING_OUT_OF_ZONE', vars: { size: 2 * s.zone + 1 } };
    }
    engine._beginOpeningAction(userId);
    putStone(engine, x, y, s.color);
    let openingNamed = false;
    if (engine.moveCount === 3) {
      engine.opening = RenjuOpenings.detectOpening(engine.moveHistory, engine.boardSize);
      openingNamed = true;
    }
    enter(engine, engine._rxStep + 1);
    return result(engine, { x, y, color: s.color, openingNamed });
  }

  if (s.t === 'offer') {
    const stones = engine.moveHistory.map((m) => ({ x: m.x, y: m.y, color: m.color }));
    if (RenjuOpenings.isSymmetricOffer({ x, y }, engine.offers, stones, engine.boardSize)) {
      return { error: 'Nước 5 này trùng hoặc đối xứng với một nước đã đưa ra.', code: 'OFFER_SYMMETRIC' };
    }
    engine._beginOpeningAction(userId);
    engine.offers = [...engine.offers, { x, y }];
    if (engine.offers.length >= offerCount(engine)) enter(engine, engine._rxStep + 1);
    return result(engine, { x, y, color: B, offered: true });
  }

  // pick
  if (!engine.offers.some((o) => o.x === x && o.y === y)) {
    return { error: 'Hãy chọn một trong các nước 5 được đưa ra.', code: 'NOT_AN_OFFER' };
  }
  engine._beginOpeningAction(userId);
  engine.offers = [];
  putStone(engine, x, y, B);
  finish(engine);
  return result(engine, { x, y, color: B });
}

function putStone(engine, x, y, color) {
  engine.board[y][x] = color === B ? 1 : 2;
  engine.moveCount++;
  engine.moveHistory.push({ x, y, color, timestamp: Date.now() });
  engine.openingStones.push({ x, y, color });
}

/** A button choice during the opening: swap/stay, Taraguchi choice, Yamaguchi N. */
function choose(engine, userId, choice, n) {
  const s = step(engine);
  if (s.t !== 'swap' && s.t !== 'choice' && s.t !== 'declare') {
    return { error: 'Không trong giai đoạn lựa chọn.', code: 'NOT_IN_CHOICE_PHASE' };
  }
  if (userId !== engine.currentTurn) return { error: 'Chưa đến lượt bạn lựa chọn.', code: 'NOT_YOUR_TURN_TO_CHOOSE' };

  if (s.t === 'declare') {
    const num = typeof n === 'number' ? n : (typeof n === 'string' && /^\d+$/.test(n) ? Number(n) : NaN);
    if (choice !== 'declare' || !Number.isInteger(num) || num < 1 || num > MAX_N) {
      return { error: 'Số nước 5 phải từ 1 đến 10.', code: 'INVALID_CHOICE' };
    }
    engine._beginOpeningAction(userId);
    engine.offerN = num;
    enter(engine, engine._rxStep + 1);
    return result(engine, { declared: num });
  }

  const valid = s.t === 'swap' ? ['swap', 'stay'] : ['swap', 'stay', 'offer'];
  if (!valid.includes(choice)) return { error: 'Lựa chọn không hợp lệ.', code: 'INVALID_CHOICE' };
  engine._beginOpeningAction(userId);
  if (choice === 'swap') engine.tentativeBlackId = other(engine, engine.tentativeBlackId);
  if (s.end) { finish(engine); return result(engine, { choice }); }
  if (s.t === 'choice' && choice === 'offer') engine.offerN = 10;
  if (s.t === 'choice') enter(engine, choice === 'offer' ? CHOICE_OFFER : CHOICE_PLACE5);
  else enter(engine, engine._rxStep + 1);
  return result(engine, { choice });
}

/** Extra opening state for serialize().swap2 — enough for a reconnecting client to draw the step. */
function describe(engine) {
  if (engine.openingPhase === 'play') {
    return { rule: engine.openingRule, tentativeBlackId: engine.tentativeBlackId, step: null, offers: [], offerN: engine.offerN };
  }
  const s = step(engine);
  return {
    rule: engine.openingRule,
    tentativeBlackId: engine.tentativeBlackId,
    step: s.t,
    stoneColor: stepColor(engine),
    zone: s.t === 'place' && s.zone !== null && s.zone !== undefined ? s.zone : null,
    offers: engine.offers.map((o) => ({ x: o.x, y: o.y })),
    offerN: engine.offerN,
    choices: s.t === 'swap' ? ['stay', 'swap'] : s.t === 'choice' ? ['stay', 'swap', 'offer'] : s.t === 'declare' ? ['declare'] : [],
    maxN: MAX_N,
  };
}

module.exports = { RULES, PROGRAMS, MAX_N, init, place, choose, describe, stepColor };
