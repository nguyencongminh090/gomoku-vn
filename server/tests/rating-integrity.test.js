'use strict';

/** rating-integrity.test.js — collusion signals over synthetic ranked-game graphs (#249). Pure + service. */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { analyze, louvain } = require('../utils/rating-integrity');
const database = require('../db/database');
const service = require('../managers/RatingIntegrityService');

let gid = 0;
/** Both players' rows for one game; `winner` is 'a' | 'b' | 'draw'. Winner gains 10, loser loses 10. */
function game(a, b, winner) {
  gid += 1;
  const sa = winner === 'a' ? 1 : winner === 'b' ? 0 : 0.5;
  const d = (s) => (s === 1 ? 10 : s === 0 ? -10 : 0);
  return [
    { user_id: a, opponent_id: b, game_id: `g${gid}`, score: sa, rating_before: 1500, rating_after: 1500 + d(sa) },
    { user_id: b, opponent_id: a, game_id: `g${gid}`, score: 1 - sa, rating_before: 1500, rating_after: 1500 + d(1 - sa) },
  ];
}
const many = (a, b, n, winner) => Array.from({ length: n }, () => game(a, b, winner)).flat();
/** `n` background players who each play every other one twice, alternating winners → dense, no flags. */
function background(n) {
  const rows = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) rows.push(...game(`bg${i}`, `bg${j}`, (i + j) % 2 ? 'a' : 'b'), ...game(`bg${i}`, `bg${j}`, (i + j) % 2 ? 'b' : 'a'));
  return rows;
}

describe('analyze', () => {
  test('dense mixed population raises no flags', () => {
    const r = analyze(background(12));
    expect(r.players).toEqual([]);
    expect(r.pairs).toEqual([]);
    expect(r.groups).toEqual([]);
  });

  test('feeder: one account farms another → pair skew, gain from one, narrow opponents', () => {
    const r = analyze([...background(12), ...many('boost', 'feeder', 12, 'a')]);
    expect(r.pairs).toEqual([expect.objectContaining({ a: 'boost', b: 'feeder', games: 12, aWins: 12, bWins: 0 })]);
    const p = r.players.find((x) => x.userId === 'boost');
    expect(p.flags).toEqual(expect.arrayContaining(['narrow_opponents', 'gain_from_one']));
    expect(p.topOpponentId).toBe('feeder');
  });

  test('closed ring of 4 playing only each other is a group', () => {
    const ring = [];
    const m = ['r0', 'r1', 'r2', 'r3'];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) ring.push(...many(m[i], m[j], 4, i % 2 ? 'a' : 'draw'));
    const r = analyze([...background(10), ...ring]);
    expect(r.groups).toEqual([expect.objectContaining({ members: m, internalShare: 1 })]);
  });

  test('broad player who plays everyone is not flagged', () => {
    const rows = background(12);
    for (let i = 0; i < 12; i++) rows.push(...game('wide', `bg${i}`, i % 2 ? 'a' : 'b'));
    expect(analyze(rows).players.find((x) => x.userId === 'wide')).toBeUndefined();
  });

  test('tiny population: player and group flags stay off, pair skew still shows', () => {
    const r = analyze(many('x', 'y', 12, 'a'));
    expect(r.players).toEqual([]);
    expect(r.groups).toEqual([]);
    expect(r.pairs).toHaveLength(1);
  });

  test('below MIN_GAMES nothing player-level', () => {
    expect(analyze([...background(12), ...many('n1', 'n2', 4, 'a')]).players.filter((p) => p.userId === 'n1')).toEqual([]);
  });
});

describe('louvain', () => {
  // Regression (#249): one local-moving pass split a dense 6-player group into 3+3 in 6 of 20 seeded graphs;
  // the aggregation level must merge the halves back. 5 planted groups x 6, dense inside, sparse between.
  test('recovers planted groups across seeded noisy graphs (needs the aggregation level)', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let trial = 0; trial < 20; trial++) {
      const rows = [];
      for (let i = 0; i < 30; i++) {
        for (let j = i + 1; j < 30; j++) {
          const same = Math.floor(i / 6) === Math.floor(j / 6);
          if (rnd() < (same ? 0.8 : 0.1)) rows.push(...many(`p${i}`, `p${j}`, same ? 4 : 1, 'a'));
        }
      }
      const players = new Map();
      for (const r of rows) {
        if (!players.has(r.user_id)) players.set(r.user_id, { id: r.user_id, games: 0, opp: new Map() });
        const p = players.get(r.user_id);
        p.games += 1;
        const o = p.opp.get(r.opponent_id) || { games: 0 };
        o.games += 1;
        p.opp.set(r.opponent_id, o);
      }
      const comm = louvain(players);
      for (const id of players.keys()) {
        const same = [...players.keys()].filter((k) => Math.floor(+k.slice(1) / 6) === Math.floor(+id.slice(1) / 6));
        expect(new Set(same.map((k) => comm.get(k))).size).toBe(1);
      }
    }
  });
});

describe('service', () => {
  const NOW = '2026-10-10T00:00:00.000Z';
  const user = (id, role = 'member') => database.db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)").run(id, id, id.toUpperCase(), NOW, role);
  const insert = (r) => database.db.prepare("INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at) VALUES (?, 'classic', ?, ?, ?, ?, ?, 100, 100, ?)").run(r.user_id, r.game_id, r.opponent_id, r.score, r.rating_before, r.rating_after, NOW);

  test('staff only; flagged pair carries names and friend/club annotation, no rating change', () => {
    user('mod', 'moderator'); user('mem');
    for (let i = 0; i < 12; i++) user(`bg${i}`);
    user('boost'); user('feeder');
    database.db.prepare("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES ('boost', 'feeder', 'boost', 'accepted', ?)").run(NOW);
    for (const r of [...background(12), ...many('boost', 'feeder', 12, 'a')]) insert(r);
    expect(() => service.report('mem')).toThrow(service.RatingIntegrityError);
    expect(() => service.report(null)).toThrow(service.RatingIntegrityError);
    const out = service.report('mod');
    expect(out.pairs[0]).toMatchObject({ aName: 'BOOST', bName: 'FEEDER', friends: true, sameClub: false });
    expect(out.players.find((p) => p.userId === 'boost')).toMatchObject({ displayName: 'BOOST', topOpponentName: 'FEEDER', topOpponentFriend: true });
    expect(database.db.prepare('SELECT COUNT(*) n FROM ratings').get().n).toBe(0);
  });
});
