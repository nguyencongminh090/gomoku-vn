'use strict';

/** rating-integrity.test.js — collusion signals over synthetic ranked-game graphs (#249). Pure + service. */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { analyze, visuals, louvain } = require('../utils/rating-integrity');
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
    const r = analyze([...background(12), ...many('boost', 'feeder', 20, 'a')]);
    expect(r.pairs).toEqual([expect.objectContaining({ a: 'boost', b: 'feeder', games: 20, aWins: 20, bWins: 0, weakerWins: false })]);
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

describe('calibration (#356, #357)', () => {
  /** Like game() but with explicit ratings, so the Elo-expected score differs from 50%. */
  const rated = (a, ra, b, rb, winner) => {
    gid += 1;
    const sa = winner === 'a' ? 1 : 0;
    return [
      { user_id: a, opponent_id: b, game_id: `g${gid}`, score: sa, rating_before: ra, rating_after: ra },
      { user_id: b, opponent_id: a, game_id: `g${gid}`, score: 1 - sa, rating_before: rb, rating_after: rb },
    ];
  };
  const series = (a, ra, b, rb, n, winner) => Array.from({ length: n }, () => rated(a, ra, b, rb, winner)).flat();

  test('one-sided pair explained by a big rating gap is not flagged', () => {
    expect(analyze([...background(12), ...series('pro', 1900, 'newbie', 1100, 10, 'a')]).pairs).toEqual([]);
  });

  test('same skew with equal ratings is flagged; weaker side winning is tagged', () => {
    const even = analyze([...background(12), ...series('a1', 1500, 'b1', 1500, 10, 'a')]).pairs;
    expect(even).toEqual([expect.objectContaining({ a: 'a1', b: 'b1', weakerWins: false })]);
    expect(even[0].z).toBeGreaterThanOrEqual(3);
    const upset = analyze([...background(12), ...series('a_low', 1300, 'z_high', 1700, 8, 'a')]).pairs;
    expect(upset).toEqual([expect.objectContaining({ a: 'a_low', b: 'z_high', weakerWins: true })]);
  });

  test('12-game farmer: gain_from_one stays off below GAIN_MIN_GAMES, pair is still flagged', () => {
    const r = analyze([...background(12), ...many('boost', 'feeder', 12, 'a')]);
    expect(r.players.find((p) => p.userId === 'boost').flags).not.toContain('gain_from_one');
    expect(r.pairs).toHaveLength(1);
  });

  test('a mid-size account (<20 opponents) is not a hub', () => {
    const rows = background(12);
    for (let i = 0; i < 12; i++) rows.push(...game('wide', `bg${i}`, i % 2 ? 'a' : 'b'));
    expect(analyze(rows).hubs).toEqual([]);
  });
});

describe('sparse and hub-shaped graphs (real data: a star around one account)', () => {
  /** 22 regulars each play the hub 20 times and one other regular once — the hub has 22 distinct opponents. */
  const star = () => {
    const rows = [];
    for (let i = 0; i < 22; i++) { rows.push(...many(`s${i}`, 'hub', 20, i % 2 ? 'a' : 'b')); rows.push(...game(`s${i}`, `s${(i + 1) % 22}`, 'a')); }
    return rows;
  };

  test('players whose games and gain come from a hub are not flagged', () => {
    const r = analyze(star());
    expect(r.hubs).toEqual(['hub']);
    expect(r.players.filter((p) => p.userId !== 'hub')).toEqual([]);
  });

  test('a feeder (1 opponent) is still flagged when a hub exists in the same graph', () => {
    const r = analyze([...star(), ...many('boost', 'feeder', 20, 'a')]);
    expect(r.players.find((p) => p.userId === 'boost').flags).toContain('gain_from_one');
  });

  test('gates count active players (>= MIN_GAMES), not every account that ever played', () => {
    const rows = many('boost', 'feeder', 12, 'a'); // would be flagged in a dense graph
    for (let i = 0; i < 10; i++) rows.push(...game(`c${i}`, `c${(i + 1) % 10}`, 'a')); // 10 casual players, 2 games each
    const r = analyze(rows);
    expect(r.population).toBeGreaterThanOrEqual(10);
    expect(r.activePlayers).toBe(2);
    expect(r.players).toEqual([]);
    expect(r.groups).toEqual([]);
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

describe('visuals (charts)', () => {
  test('empty input yields empty charts, not NaN', () => {
    const v = visuals([]);
    expect(v).toMatchObject({ total: 0, shown: 0, nodes: [], edges: [], ratingBins: [] });
    expect(v.gamesBins.every((b) => b.count === 0)).toBe(true);
  });
  test('nodes carry games/rating/community; two planted groups get different communities; edges dedupe a pair', () => {
    const rows = [...many('a1', 'a2', 6, 'a'), ...many('a2', 'a3', 6, 'a'), ...many('a1', 'a3', 6, 'b'),
      ...many('b1', 'b2', 6, 'a'), ...many('b2', 'b3', 6, 'a'), ...many('b1', 'b3', 6, 'b')];
    const v = visuals(rows);
    const byId = new Map(v.nodes.map((n) => [n.id, n]));
    expect(v.nodes).toHaveLength(6);
    expect(byId.get('a1')).toMatchObject({ games: 12, opponents: 2, rating: expect.any(Number) });
    expect(byId.get('a1').community).toBe(byId.get('a2').community);
    expect(byId.get('a1').community).not.toBe(byId.get('b1').community);
    expect(v.communities).toBe(2);
    expect(v.edges).toHaveLength(6);
    expect(v.edges.every((e) => e.a < e.b && e.games === 6)).toBe(true);
  });
  test('distributions: every player lands in exactly one bin; node list is capped, totals are not', () => {
    const rows = [];
    for (let i = 0; i < 130; i++) rows.push(...game(`p${i}`, `q${i}`, 'a'));
    const v = visuals(rows);
    expect(v.total).toBe(260);
    expect(v.shown).toBe(120);
    expect(v.nodes).toHaveLength(120);
    expect(v.gamesBins.reduce((n, b) => n + b.count, 0)).toBe(260);
    expect(v.ratingBins.reduce((n, b) => n + b.count, 0)).toBe(260);
    expect(v.edges.every((e) => v.nodes.some((n) => n.id === e.a) && v.nodes.some((n) => n.id === e.b))).toBe(true);
  });
});

describe('visuals mustKeep (#353)', () => {
  test('flagged ids outside the top-N are still drawn', () => {
    const rows = [];
    for (let i = 0; i < 130; i++) rows.push(...game(`p${i}`, `q${i}`, 'a'));
    for (let i = 0; i < 3; i++) rows.push(...game('p0', 'q0', 'a'));
    const v = visuals(rows, ['p129', 'ghost']);
    expect(v.nodes.some((n) => n.id === 'p129')).toBe(true);
    expect(v.nodes.some((n) => n.id === 'ghost')).toBe(false);
    expect(v.nodes.length).toBeLessThanOrEqual(121);
  });
});

describe('service', () => {
  const NOW = '2026-10-10T00:00:00.000Z';
  const user = (id, role = 'member') => database.db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)").run(id, id, id.toUpperCase(), NOW, role);
  const insert = (r) => database.db.prepare("INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at) VALUES (?, 'classic', ?, ?, ?, ?, ?, 100, 100, ?)").run(r.user_id, r.game_id, r.opponent_id, r.score, r.rating_before, r.rating_after, NOW);

  test('admin only; flagged pair carries names and friend/club annotation, no rating change', () => {
    user('adm', 'admin'); user('mod', 'moderator'); user('mem');
    for (let i = 0; i < 12; i++) user(`bg${i}`);
    user('boost'); user('feeder');
    database.db.prepare("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES ('boost', 'feeder', 'boost', 'accepted', ?)").run(NOW);
    for (const r of [...background(12), ...many('boost', 'feeder', 12, 'a')]) insert(r);
    expect(() => service.report('mem')).toThrow(service.RatingIntegrityError);
    expect(() => service.report('mod')).toThrow(service.RatingIntegrityError); // moderators are not enough
    expect(() => service.report(null)).toThrow(service.RatingIntegrityError);
    const roles = require('../utils/roles');
    expect(roles.permissionsOf('adm')).toContain('rating.integrity');
    expect(roles.permissionsOf('mod')).not.toContain('rating.integrity'); // the admin tab stays hidden for moderators
    const out = service.report('adm');
    expect(out.pairs[0]).toMatchObject({ aName: 'BOOST', bName: 'FEEDER', friends: true, sameClub: false });
    expect(out.players.find((p) => p.userId === 'boost')).toMatchObject({ displayName: 'BOOST', topOpponentName: 'FEEDER', topOpponentFriend: true });
    expect(out.viz.nodes.find((n) => n.id === 'boost')).toMatchObject({ name: 'BOOST', games: 12 });
    expect(database.db.prepare('SELECT COUNT(*) n FROM ratings').get().n).toBe(0);
  });
});
