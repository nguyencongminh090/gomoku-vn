'use strict';

/**
 * friends-route.test.js — /api/friends + rankings scope=friends + profile.friendship (#198 slice 1).
 * Real SQL on an in-memory DB; session = raw cookie header = user id.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => ({ userId: sid === 'guest' ? null : sid }),
}));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = req.headers.cookie === 'guest' ? { userId: 'guest_abc', isGuest: true } : { userId: req.headers.cookie }; // realistic guest (#280): a guest_… id + isGuest, never a null id
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const friendsRouter = require('../routes/friends');
const rankingsRouter = require('../routes/rankings');
const profileRouter = require('../routes/profile');
const svc = require('../managers/FriendService');

const NOW = '2026-10-09T00:00:00.000Z';
const db = database.db;
const U = {};
let server, base;

function addUser(name, rating) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW);
  if (rating) {
    db.prepare(`INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, 'freestyle', ?, 100, 0.06, 20, ?)`)
      .run(id, rating, NOW);
  }
}

function call(method, urlPath, as) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (as) headers.cookie = U[as] || as;
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    r.end();
  });
}

const rows = () => db.prepare('SELECT * FROM friendships').all();
const reset = () => db.prepare('DELETE FROM friendships').run();

beforeAll(async () => {
  addUser('ann', 1500); addUser('bob', 1600); addUser('cat', 1700); addUser('dan', 1800);
  const app = express();
  app.use('/api/friends', friendsRouter);
  app.use('/api/rankings', rankingsRouter);
  app.use('/api/profile', profileRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => { reset(); rankingsRouter._clearCache(); });

describe('request / accept / remove', () => {
  it('request → pending; target sees incoming, sender outgoing; accept → both friends', async () => {
    expect((await call('POST', '/api/friends/bob', 'ann')).body.status).toBe('outgoing');
    expect(rows()).toHaveLength(1);
    expect((await call('GET', '/api/friends', 'bob')).body.incoming.map((p) => p.username)).toEqual(['ann']);
    expect((await call('GET', '/api/friends', 'ann')).body.outgoing.map((p) => p.username)).toEqual(['bob']);
    expect((await call('POST', '/api/friends/ann/accept', 'bob')).body.status).toBe('friends');
    expect((await call('GET', '/api/friends', 'ann')).body.friends.map((p) => p.username)).toEqual(['bob']);
    expect((await call('GET', '/api/friends', 'bob')).body.friends.map((p) => p.username)).toEqual(['ann']);
  });

  it('#222: friends carry visible presence from the hook (default offline); pending rows do not', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    await call('POST', '/api/friends/ann/accept', 'bob');
    await call('POST', '/api/friends/cat', 'ann');
    expect((await call('GET', '/api/friends', 'ann')).body.friends).toEqual([expect.objectContaining({ username: 'bob', online: false })]);
    svc.setHooks({ isOnline: (id) => id === 'bob-id' });
    try {
      const d = (await call('GET', '/api/friends', 'ann')).body;
      expect(d.friends[0].online).toBe(true);
      expect(d.outgoing[0]).not.toHaveProperty('online');
    } finally { svc.setHooks({}); }
  });

  it('crossed requests merge into one accepted row', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('POST', '/api/friends/ann', 'bob')).body.status).toBe('friends');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].status).toBe('accepted');
  });

  it('only the target can accept; the sender cannot accept their own request', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    const r = await call('POST', '/api/friends/bob/accept', 'ann');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NO_REQUEST');
    expect((await call('POST', '/api/friends/cat/accept', 'ann')).body.code).toBe('NO_REQUEST');
  });

  it('rejects self, unknown user, duplicate request, already friends', async () => {
    expect((await call('POST', '/api/friends/ann', 'ann')).body.code).toBe('CANNOT_FRIEND_SELF');
    expect((await call('POST', '/api/friends/nobody', 'ann')).status).toBe(404);
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('POST', '/api/friends/bob', 'ann')).body.code).toBe('REQUEST_PENDING');
    await call('POST', '/api/friends/ann/accept', 'bob');
    expect((await call('POST', '/api/friends/bob', 'ann')).body.code).toBe('ALREADY_FRIENDS');
    expect((await call('POST', '/api/friends/ann', 'bob')).body.code).toBe('ALREADY_FRIENDS');
  });

  it('DELETE cancels, declines and unfriends (idempotent)', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('DELETE', '/api/friends/bob', 'ann')).body.status).toBe('none'); // cancel
    expect(rows()).toHaveLength(0);
    await call('POST', '/api/friends/bob', 'ann');
    await call('DELETE', '/api/friends/ann', 'bob'); // decline
    expect(rows()).toHaveLength(0);
    await call('POST', '/api/friends/bob', 'ann');
    await call('POST', '/api/friends/ann/accept', 'bob');
    await call('DELETE', '/api/friends/ann', 'bob'); // unfriend
    expect(rows()).toHaveLength(0);
    expect((await call('DELETE', '/api/friends/ann', 'bob')).status).toBe(200);
  });

  it('guests and logged-out are refused', async () => {
    expect((await call('GET', '/api/friends', 'guest')).body.code).toBe('GUEST_FORBIDDEN');
    expect((await call('POST', '/api/friends/bob', 'guest')).status).toBe(403);
    expect((await call('GET', '/api/friends')).status).toBe(401);
  });

  it('caps outgoing pending requests', () => {
    for (let i = 0; i < svc.MAX_OUTGOING; i++) addUser(`u${i}`);
    for (let i = 0; i < svc.MAX_OUTGOING; i++) svc.request(U.ann, `u${i}`);
    addUser('late');
    expect(() => svc.request(U.ann, 'late')).toThrow(expect.objectContaining({ code: 'TOO_MANY_REQUESTS' }));
  });
});

describe('rankings scope=friends', () => {
  it('lists me + accepted friends only, ranked within the circle; pending/strangers excluded', async () => {
    await call('POST', '/api/friends/bob', 'ann'); await call('POST', '/api/friends/ann/accept', 'bob');
    await call('POST', '/api/friends/cat', 'ann'); // pending only
    const r = await call('GET', '/api/rankings?category=freestyle&scope=friends', 'ann');
    expect(r.status).toBe(200);
    expect(r.body.scope).toBe('friends');
    expect(r.body.players.map((p) => [p.rank, p.username])).toEqual([[1, 'bob'], [2, 'ann']]);
    expect(r.body.pagination.total).toBe(2);
  });

  it('is per viewer (no cache bleed) and 401 when logged out; global scope unaffected', async () => {
    await call('POST', '/api/friends/bob', 'ann'); await call('POST', '/api/friends/ann/accept', 'bob');
    await call('GET', '/api/rankings?category=freestyle&scope=friends', 'ann');
    const d = await call('GET', '/api/rankings?category=freestyle&scope=friends', 'dan');
    expect(d.body.players.map((p) => p.username)).toEqual(['dan']);
    expect((await call('GET', '/api/rankings?category=freestyle&scope=friends')).status).toBe(401);
    const all = await call('GET', '/api/rankings?category=freestyle');
    expect(all.body.players).toHaveLength(4);
  });
});

describe('profile.friendship', () => {
  it('reflects the viewer relation', async () => {
    expect((await call('GET', '/api/profile/bob')).body.friendship).toBe('none'); // logged out
    expect((await call('GET', '/api/profile/ann', 'ann')).body.friendship).toBe('self');
    await call('POST', '/api/friends/bob', 'ann');
    expect((await call('GET', '/api/profile/bob', 'ann')).body.friendship).toBe('outgoing');
    expect((await call('GET', '/api/profile/ann', 'bob')).body.friendship).toBe('incoming');
    await call('POST', '/api/friends/ann/accept', 'bob');
    expect((await call('GET', '/api/profile/ann', 'bob')).body.friendship).toBe('friends');
  });
});

describe('GET /api/friends/search (add by username / display name)', () => {
  const names = async (q, as = 'ann') => (await call('GET', `/api/friends/search?q=${encodeURIComponent(q)}`, as)).body.results.map((p) => p.username);

  it('matches username or display name case-insensitively, never returns me, needs ≥ 2 chars', async () => {
    expect(await names('BO')).toEqual(['bob']);
    expect(await names('an')).toEqual(['dan']); // ann excluded (me)
    expect(await names('b')).toEqual([]);
    expect(await names('')).toEqual([]);
    expect(await names('zzz')).toEqual([]);
  });

  it('treats % and _ literally (no wildcard dump of every user)', async () => {
    expect(await names('%%')).toEqual([]);
    expect(await names('__')).toEqual([]);
  });

  it('reports the relation and honours the recipient\'s privacy setting', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    db.prepare("UPDATE users SET who_can_friend = 'nobody' WHERE id = ?").run(U.cat);
    const res = (await call('GET', '/api/friends/search?q=o', 'ann')).body.results;
    expect(res).toEqual([]); // 1 char
    const all = (await call('GET', '/api/friends/search?q=-id', 'ann')).body.results;
    expect(all).toEqual([]); // ids are not searchable
    const by = Object.fromEntries((await call('GET', '/api/friends/search?q=ca', 'ann')).body.results.map((p) => [p.username, p]));
    expect(by.cat).toMatchObject({ status: 'none', canRequest: false });
    const bob = (await call('GET', '/api/friends/search?q=bob', 'ann')).body.results[0];
    expect(bob).toMatchObject({ status: 'outgoing', canRequest: true });
    expect((await call('GET', '/api/friends/search?q=ann', 'bob')).body.results[0].status).toBe('incoming');
    db.prepare("UPDATE users SET who_can_friend = 'everyone' WHERE id = ?").run(U.cat);
  });

  it('members only', async () => {
    expect((await call('GET', '/api/friends/search?q=bob')).status).toBe(401);
    expect((await call('GET', '/api/friends/search?q=bob', 'guest')).status).toBe(403);
  });
});

describe('friend code (name#1234)', () => {
  it('is 4 random digits, assigned once and stable; members only', async () => {
    const a = (await call('GET', '/api/friends/code', 'ann')).body.code;
    expect(a).toMatch(/^ann#\d{4}$/);
    expect((await call('GET', '/api/friends/code', 'ann')).body.code).toBe(a);
    expect((await call('GET', '/api/friends/code')).status).toBe(401);
    expect((await call('GET', '/api/friends/code', 'guest')).status).toBe(403);
  });

  it('search by exact code finds that one player; wrong tag, partial name or own code find nobody', async () => {
    const bob = (await call('GET', '/api/friends/code', 'bob')).body.code;
    const hit = (await call('GET', `/api/friends/search?q=${encodeURIComponent(bob)}`, 'ann')).body.results;
    expect(hit.map((p) => p.username)).toEqual(['bob']);
    const [name, tag] = bob.split('#');
    const wrong = String((Number(tag) + 1) % 10000).padStart(4, '0');
    expect((await call('GET', `/api/friends/search?q=${name}%23${wrong}`, 'ann')).body.results).toEqual([]);
    expect((await call('GET', `/api/friends/search?q=bo%23${tag}`, 'ann')).body.results).toEqual([]);
    expect((await call('GET', `/api/friends/search?q=${encodeURIComponent(bob.toUpperCase())}`, 'ann')).body.results.map((p) => p.username)).toEqual(['bob']);
    expect((await call('GET', `/api/friends/search?q=${encodeURIComponent(bob)}`, 'bob')).body.results).toEqual([]);
  });

  it('a user who never generated a code cannot be matched by one', async () => {
    expect((await call('GET', '/api/friends/search?q=dan%230000', 'ann')).body.results).toEqual([]);
  });
});

describe('GET /api/friends/search — Vietnamese names and typos (feature/user-search)', () => {
  const add = (id, username, display) => db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`).run(id, username, display, NOW);
  const found = async (q) => (await call('GET', `/api/friends/search?q=${encodeURIComponent(q)}`, 'ann')).body.results.map((p) => p.username);

  beforeAll(() => { add('vn1', 'vnduc', 'Nguyễn Văn Đức'); add('vn2', 'tbinh', 'Trần Thị Bình'); });
  afterAll(() => db.prepare("DELETE FROM users WHERE id IN ('vn1','vn2')").run());

  it('finds accented names without accents, in any case or word order', async () => {
    expect(await found('nguyen')).toEqual(['vnduc']);
    expect(await found('NGUYỄN')).toEqual(['vnduc']);
    expect(await found('duc van')).toEqual(['vnduc']);
    expect(await found('đức')).toEqual(['vnduc']);
  });
  it('tolerates a typo only when nothing matches exactly', async () => {
    expect(await found('nugyen')).toEqual(['vnduc']);
    expect(await found('tran thi bing')).toEqual(['tbinh']);
  });
  it('a newly registered user is searchable at once (index follows the users table)', async () => {
    expect(await found('Lê Hoàng')).toEqual([]);
    add('vn3', 'lehoang', 'Lê Hoàng');
    expect(await found('le hoang')).toEqual(['lehoang']);
    db.prepare("DELETE FROM users WHERE id = 'vn3'").run();
    expect(await found('le hoang')).toEqual([]);
  });
});

describe('user-search result cache follows the users table', () => {
  const userSearch = require('../db/user-search');
  it('same query twice is stable; a new user invalidates it; limit/exclude apply after the cache', () => {
    const first = userSearch.matchUserIds('an');
    expect(userSearch.matchUserIds('an')).toEqual(first);
    db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES ('cache1', 'zanzan', 'x', 'Zan Zan', ?)`).run(NOW);
    expect(userSearch.matchUserIds('zan')).toContain('cache1');
    expect(userSearch.matchUserIds('zan', { exclude: 'cache1' })).not.toContain('cache1');
    expect(userSearch.matchUserIds('zan', { limit: 1 })).toHaveLength(1);
    db.prepare("DELETE FROM users WHERE id = 'cache1'").run();
    expect(userSearch.matchUserIds('zan')).not.toContain('cache1');
  });
});

describe('#370 presence activity', () => {
  const room = (state, status, users) => ({ roomId: 'r1', state, gameState: status ? { status, startedAt: 1234 } : null, users: new Map(users) });

  it('activityFromRoom: seated in a running game → playing; spectator → watching; seated before start / no room → free', () => {
    const { activityFromRoom } = svc;
    expect(activityFromRoom(room('playing', 'ongoing', [['u', { slot: 1 }]]), 'u')).toEqual({ activity: 'playing', startedAt: 1234, roomId: 'r1' });
    expect(activityFromRoom(room('playing', 'ongoing', [['u', { slot: 2 }]]), 'u').activity).toBe('playing');
    expect(activityFromRoom(room('playing', 'ongoing', [['u', { slot: null }]]), 'u')).toEqual({ activity: 'watching', roomId: 'r1' });
    expect(activityFromRoom(room('waiting', null, [['u', { slot: 1 }]]), 'u')).toEqual({ activity: 'free' });
    expect(activityFromRoom(room('playing', 'finished', [['u', { slot: 1 }]]), 'u')).toEqual({ activity: 'free' });
    expect(activityFromRoom(null, 'u')).toEqual({ activity: 'free' });
    expect(activityFromRoom(room('playing', 'ongoing', []), 'u')).toEqual({ activity: 'free' });
  });

  it('friends list: online friends carry the hook activity; offline / hidden ones get null and the hook is not asked', async () => {
    await call('POST', '/api/friends/bob', 'ann'); await call('POST', '/api/friends/ann/accept', 'bob');
    await call('POST', '/api/friends/cat', 'ann'); await call('POST', '/api/friends/ann/accept', 'cat');
    const asked = [];
    svc.setHooks({ isOnline: (id) => id === 'bob-id', activityOf: (id) => { asked.push(id); return { activity: 'playing', startedAt: 99, roomId: 'r9' }; } });
    try {
      const { friends } = (await call('GET', '/api/friends', 'ann')).body;
      expect(friends.find((f) => f.username === 'bob')).toMatchObject({ online: true, activity: 'playing', startedAt: 99, roomId: 'r9' });
      expect(friends.find((f) => f.username === 'cat')).toMatchObject({ online: false, activity: null });
      expect(friends.find((f) => f.username === 'cat')).not.toHaveProperty('roomId');
      expect(asked).toEqual(['bob-id']);
      svc.setHooks({ isOnline: () => true }); // no activity hook wired → free
      expect((await call('GET', '/api/friends', 'ann')).body.friends[0].activity).toBe('free');
    } finally { svc.setHooks({}); }
  });
});

describe('#370 GET /api/friends/:username/summary', () => {
  let n = 0;
  function game(black, white, winner, { winnerColor, ended = true, moves = '[{"x":1,"y":1},{"x":2,"y":2}]' } = {}) {
    const id = 'g' + (++n);
    const at = new Date(Date.parse(NOW) + n * 60000).toISOString();
    db.prepare(`INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, winner_color, reason, board_size, moves, started_at, ended_at)
      VALUES (?, 'r', ?, ?, ?, ?, ?, ?, 'normal', 15, ?, ?, ?)`)
      .run(id, black && U[black], white && U[white], black || 'Guest', white || 'Guest', winner, winnerColor || null, moves, at, ended ? at : null);
    for (const p of [black, white]) if (p) db.prepare('INSERT INTO player_games (player_id, game_id) VALUES (?, ?)').run(U[p], id);
    return id;
  }
  beforeAll(() => {
    db.prepare('DELETE FROM player_games').run(); db.prepare('DELETE FROM games').run();
    game('ann', 'bob', 'BLACK');                      // ann W
    game('bob', 'ann', 'BLACK');                      // ann L
    game('ann', 'bob', 'draw', { winnerColor: 'DRAW' }); // D
    game('bob', 'ann', 'ann-id');                     // legacy raw-id winner → ann W
    game('ann', 'bob', null);                         // interrupted → ignored
    game('ann', 'bob', 'BLACK', { ended: false });    // unfinished → ignored
    game('ann', 'cat', 'BLACK');                      // other opponent → ignored
    game('ann', null, 'BLACK');                       // vs a guest → ignored
    game('bob', 'ann', 'WHITE', { moves: null }); // ann W, latest, no moves → null count
  });

  it('H2H from my side, newest first, last 5, rating pool, no user ids', async () => {
    const r = await call('GET', '/api/friends/bob/summary', 'ann');
    expect(r.status).toBe(200);
    expect(r.body.with).toMatchObject({ username: 'bob', displayName: 'BOB' });
    expect(r.body.rating).toEqual({ category: 'freestyle', rating: 1600, provisional: false });
    expect(r.body.h2h).toEqual({ wins: 3, losses: 1, draws: 1, winPct: 70 });
    expect(r.body.last5).toEqual(['W', 'W', 'D', 'L', 'W']);
    expect(r.body.games[0]).toMatchObject({ result: 'W', color: 'WHITE', moves: null, boardSize: 15 });
    expect(r.body.games[1].moves).toBe(2);
    expect(JSON.stringify(r.body)).not.toMatch(/-id"/);
    const mirror = (await call('GET', '/api/friends/ann/summary', 'bob')).body;
    expect(mirror.h2h).toMatchObject({ wins: 1, losses: 3, draws: 1 });
    expect(mirror.games[0].result).toBe('L');
  });

  it('no games / unrated → nulls; unknown 404, self 400, guests 403', async () => {
    const r = (await call('GET', '/api/friends/dan/summary', 'cat')).body;
    expect(r.h2h).toEqual({ wins: 0, losses: 0, draws: 0, winPct: null });
    expect(r.games).toEqual([]);
    db.prepare("DELETE FROM ratings WHERE user_id = ?").run(U.dan);
    expect((await call('GET', '/api/friends/dan/summary', 'cat')).body.rating).toBeNull();
    expect((await call('GET', '/api/friends/nobody/summary', 'cat')).status).toBe(404);
    expect((await call('GET', '/api/friends/cat/summary', 'cat')).status).toBe(400);
    expect((await call('GET', '/api/friends/cat/summary', 'guest')).status).toBe(403);
  });
});
