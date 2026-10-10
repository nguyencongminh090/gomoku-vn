'use strict';

/**
 * clubs-route.test.js — /api/clubs (#178): rules from planning Q5, role
 * permissions, caps. Real SQL on an in-memory DB.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
// "Session" = raw cookie header = user id ('guest' = guest, absent = logged out).
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => ({ userId: sid === 'guest' ? null : sid }),
}));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { userId: req.headers.cookie === 'guest' ? null : req.headers.cookie };
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const clubsRouter = require('../routes/clubs');
const { slugify, MAX_MEMBERS } = require('../managers/ClubService');

const NOW = '2026-10-09T00:00:00.000Z';
const db = database.db;
const U = {}; // name -> id
let server, base;

function addUser(name) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW);
}

function call(method, urlPath, as, body) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (as) headers.cookie = U[as] || as;
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const create = (as, name, extra = {}) => call('POST', '/api/clubs', as, { name, ...extra });
const roleIn = (slug, user) => {
  const r = db.prepare('SELECT m.role FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE c.slug = ? AND m.user_id = ?').get(slug, U[user]);
  return r ? r.role : null;
};

beforeAll(async () => {
  ['owner', 'off', 'mem', 'newbie', 'extra'].forEach(addUser);
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

test('slugify folds Vietnamese diacritics', () => {
  expect(slugify('CLB Caro Hà Nội')).toBe('clb-caro-ha-noi');
  expect(slugify('Đà Nẵng Five!')).toBe('da-nang-five');
});

describe('create', () => {
  it('creates an open club owned by the caller; slug from the name', async () => {
    const r = await create('owner', 'CLB Caro Hà Nội', { description: 'Tối thứ Tư' });
    expect(r.status).toBe(201);
    expect(r.body.slug).toBe('clb-caro-ha-noi');
    expect(roleIn('clb-caro-ha-noi', 'owner')).toBe('owner');
    const d = (await call('GET', '/api/clubs/clb-caro-ha-noi')).body;
    expect(d).toMatchObject({ name: 'CLB Caro Hà Nội', joinPolicy: 'open', members: 1, myRole: null });
  });

  it('rejects bad names, duplicate names (by slug), bad policy, guests, logged-out', async () => {
    expect((await create('off', 'ab')).body.code).toBe('CLUB_NAME_INVALID');
    expect((await create('off', '!!!!')).body.code).toBe('CLUB_NAME_INVALID');
    expect((await create('off', 'clb caro ha noi')).body.code).toBe('CLUB_NAME_TAKEN');
    expect((await create('off', 'Valid Name', { joinPolicy: 'secret' })).body.code).toBe('CLUB_POLICY_INVALID');
    expect((await create('guest', 'Guest Club')).status).toBe(403);
    expect((await create(undefined, 'Anon Club')).status).toBe(401);
  });

  it('caps a user at 3 clubs', async () => {
    await create('extra', 'Extra One');
    await create('extra', 'Extra Two');
    await create('extra', 'Extra Three');
    expect((await create('extra', 'Extra Four')).body.code).toBe('CLUB_LIMIT');
  });
});

describe('join / leave / approve', () => {
  it('open club: join is immediate; double join and owner leave are refused', async () => {
    const slug = 'clb-caro-ha-noi';
    expect((await call('POST', `/api/clubs/${slug}/join`, 'mem')).body.role).toBe('member');
    expect((await call('POST', `/api/clubs/${slug}/join`, 'mem')).body.code).toBe('CLUB_ALREADY_MEMBER');
    expect((await call('POST', `/api/clubs/${slug}/leave`, 'owner')).body.code).toBe('CLUB_OWNER_LEAVE');
    expect((await call('POST', `/api/clubs/${slug}/leave`, 'mem')).status).toBe(200);
    expect(roleIn(slug, 'mem')).toBeNull();
  });

  it('invite club: join makes a pending request only staff see; approve admits', async () => {
    await create('owner', 'Private Club', { joinPolicy: 'invite' });
    const slug = 'private-club';
    expect((await call('POST', `/api/clubs/${slug}/join`, 'mem')).body.role).toBe('pending');

    const pub = (await call('GET', `/api/clubs/${slug}`, 'mem')).body;
    expect(pub.members).toBe(1);
    expect(pub).not.toHaveProperty('pending');
    expect((await call('GET', `/api/clubs/${slug}`, 'owner')).body.pending).toEqual([{ username: 'mem', displayName: 'MEM' }]);

    expect((await call('POST', `/api/clubs/${slug}/members/mem/approve`, 'newbie')).status).toBe(403);
    expect((await call('POST', `/api/clubs/${slug}/members/mem/approve`, 'owner')).status).toBe(200);
    expect(roleIn(slug, 'mem')).toBe('member');
    expect((await call('POST', `/api/clubs/${slug}/members/mem/approve`, 'owner')).body.code).toBe('CLUB_NOT_PENDING');
  });

  it('a user in 3 clubs cannot join a 4th', async () => {
    expect((await call('POST', '/api/clubs/clb-caro-ha-noi/join', 'extra')).body.code).toBe('CLUB_LIMIT');
  });

  it('enforces the member cap on join', async () => {
    await create('owner', 'Full Club');
    const clubId = db.prepare("SELECT id FROM clubs WHERE slug = 'full-club'").get().id;
    const ins = db.prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)");
    const mkUser = db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`);
    db.transaction(() => {
      for (let i = 0; i < MAX_MEMBERS - 1; i++) { mkUser.run(`f${i}`, `f${i}`, `f${i}`, NOW); ins.run(clubId, `f${i}`, NOW); }
    })();
    expect((await call('POST', '/api/clubs/full-club/join', 'newbie')).body.code).toBe('CLUB_FULL');
  });
});

describe('roles', () => {
  const slug = 'clb-caro-ha-noi';

  it('only the owner changes roles; promoted officer can then kick members but not staff', async () => {
    await call('POST', `/api/clubs/${slug}/join`, 'mem');
    await call('POST', `/api/clubs/${slug}/join`, 'off');
    expect((await call('PUT', `/api/clubs/${slug}/members/off/role`, 'mem', { role: 'officer' })).status).toBe(403);
    expect((await call('PUT', `/api/clubs/${slug}/members/off/role`, 'owner', { role: 'officer' })).status).toBe(200);
    expect((await call('PUT', `/api/clubs/${slug}/members/off/role`, 'owner', { role: 'king' })).body.code).toBe('CLUB_ROLE_INVALID');

    expect((await call('DELETE', `/api/clubs/${slug}/members/owner`, 'off')).status).toBe(403);
    expect((await call('DELETE', `/api/clubs/${slug}/members/mem`, 'mem')).status).toBe(403);
    expect((await call('DELETE', `/api/clubs/${slug}/members/mem`, 'off')).status).toBe(200);
    expect(roleIn(slug, 'mem')).toBeNull();
  });

  it('officer may edit description but not join policy', async () => {
    expect((await call('PUT', `/api/clubs/${slug}`, 'off', { description: 'new' })).status).toBe(200);
    expect((await call('PUT', `/api/clubs/${slug}`, 'off', { joinPolicy: 'invite' })).status).toBe(403);
    expect((await call('PUT', `/api/clubs/${slug}`, 'owner', { joinPolicy: 'invite' })).status).toBe(200);
    await call('PUT', `/api/clubs/${slug}`, 'owner', { joinPolicy: 'open' });
  });

  it('transfer makes the target owner and demotes the old owner to officer; one owner remains', async () => {
    expect((await call('PUT', `/api/clubs/${slug}/members/off/role`, 'owner', { role: 'owner' })).status).toBe(200);
    expect(roleIn(slug, 'off')).toBe('owner');
    expect(roleIn(slug, 'owner')).toBe('officer');
    expect(db.prepare("SELECT COUNT(*) n FROM club_members m JOIN clubs c ON c.id=m.club_id WHERE c.slug=? AND m.role='owner'").get(slug).n).toBe(1);
    expect(db.prepare('SELECT owner_id FROM clubs WHERE slug = ?').get(slug).owner_id).toBe(U.off);
  });
});

describe('reads', () => {
  it('leaderboard orders members by rating (unrated last) and shows avg of ranked members only', async () => {
    await create('newbie', 'Rated Club');
    await call('POST', '/api/clubs/rated-club/join', 'mem');
    await call('POST', '/api/clubs/rated-club/join', 'off');
    const rate = db.prepare("INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, 'freestyle', ?, 80, 0.06, ?, ?)");
    rate.run(U.newbie, 1500, 30, NOW);
    rate.run(U.mem, 1700, 25, NOW);
    rate.run(U.off, 2400, 5, NOW); // under threshold: listed, not in average
    const d = (await call('GET', '/api/clubs/rated-club?category=freestyle')).body;
    expect(d.leaderboard.map((m) => m.username)).toEqual(['off', 'mem', 'newbie']);
    expect(d.avgRating).toBe(1600);
  });

  it('list supports search and escapes LIKE wildcards; /mine is not swallowed by :slug', async () => {
    const all = (await call('GET', '/api/clubs')).body;
    expect(all.pagination.total).toBeGreaterThan(3);
    expect((await call('GET', '/api/clubs?q=rated')).body.clubs.map((c) => c.slug)).toEqual(['rated-club']);
    expect((await call('GET', '/api/clubs?q=%25')).body.clubs).toEqual([]);
    const mine = (await call('GET', '/api/clubs/mine', 'newbie')).body.clubs;
    expect(mine.map((c) => c.slug)).toContain('rated-club');
    expect((await call('GET', '/api/clubs/nope')).body.code).toBe('CLUB_NOT_FOUND');
  });

  it('delete is owner-only and cascades members', async () => {
    expect((await call('DELETE', '/api/clubs/rated-club', 'mem')).status).toBe(403);
    expect((await call('DELETE', '/api/clubs/rated-club', 'newbie')).status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) n FROM club_members WHERE club_id NOT IN (SELECT id FROM clubs)").get().n).toBe(0);
    expect((await call('GET', '/api/clubs/rated-club')).status).toBe(404);
  });
});

describe('club rank (#190)', () => {
  const rate = (user, rating, games) => db.prepare("INSERT OR REPLACE INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, 'caro', ?, 80, 0.06, ?, ?)").run(U[user], rating, games, NOW);

  it('ranks clubs by average rating of ranked members; unranked clubs have no rank', async () => {
    addUser('r1'); addUser('r2'); addUser('r3');
    await create('r1', 'Rank Alpha');
    await create('r2', 'Rank Beta');
    await create('r3', 'Rank Gamma');
    rate('r1', 1600, 30);
    rate('r2', 1800, 30);
    rate('r3', 2500, 3); // under the threshold → Gamma has no ranked member

    const beta = (await call('GET', '/api/clubs/rank-beta?category=caro')).body;
    const alpha = (await call('GET', '/api/clubs/rank-alpha?category=caro')).body;
    const gamma = (await call('GET', '/api/clubs/rank-gamma?category=caro')).body;
    expect([beta.rank, alpha.rank, gamma.rank]).toEqual([1, 2, null]);

    const list = (await call('GET', '/api/clubs?q=rank&category=caro')).body.clubs;
    expect(Object.fromEntries(list.map((c) => [c.slug, c.rank]))).toEqual({ 'rank-alpha': 2, 'rank-beta': 1, 'rank-gamma': null });
  });

  it('rank is per category', async () => {
    expect((await call('GET', '/api/clubs/rank-beta?category=freestyle')).body.rank).toBeNull();
  });
});

describe('events (#200 slice 2)', () => {
  const FUT = (h) => new Date(Date.now() + h * 3600e3).toISOString();
  const ev = (slug, as, body) => call('POST', `/api/clubs/${slug}/events`, as, body);
  const events = async (slug) => (await call('GET', `/api/clubs/${slug}`)).body.events;
  const slug = 'ev-club';

  beforeAll(async () => {
    addUser('evown'); addUser('evoff'); addUser('evmem');
    await create('evown', 'Ev Club');
    await call('POST', `/api/clubs/${slug}/join`, 'evoff');
    await call('POST', `/api/clubs/${slug}/join`, 'evmem');
    await call('PUT', `/api/clubs/${slug}/members/evoff/role`, 'evown', { role: 'officer' });
  });

  it('staff create; list is public, soonest first', async () => {
    expect((await ev(slug, 'evown', { title: 'Later', startsAt: FUT(48) })).status).toBe(201);
    expect((await ev(slug, 'evoff', { title: '  Sooner  ', startsAt: FUT(24) })).status).toBe(201);
    const list = await events(slug);
    expect(list.map((e) => e.title)).toEqual(['Sooner', 'Later']);
    expect(list[0]).toMatchObject({ kind: 'event' });
  });

  it('rejects members, logged-out, bad title, bad/past time', async () => {
    expect((await ev(slug, 'evmem', { title: 'X', startsAt: FUT(1) })).body.code).toBe('CLUB_FORBIDDEN');
    expect((await ev(slug, undefined, { title: 'X', startsAt: FUT(1) })).status).toBe(401);
    expect((await ev(slug, 'evown', { title: '   ', startsAt: FUT(1) })).body.code).toBe('CLUB_EVENT_TITLE_INVALID');
    expect((await ev(slug, 'evown', { title: 'x'.repeat(61), startsAt: FUT(1) })).body.code).toBe('CLUB_EVENT_TITLE_INVALID');
    expect((await ev(slug, 'evown', { title: 'X', startsAt: 'nope' })).body.code).toBe('CLUB_EVENT_TIME_INVALID');
    expect((await ev(slug, 'evown', { title: 'X', startsAt: FUT(-1) })).body.code).toBe('CLUB_EVENT_TIME_INVALID');
  });

  it('hides past events and caps upcoming at 20', async () => {
    const club = db.prepare('SELECT id FROM clubs WHERE slug = ?').get(slug);
    db.prepare("INSERT INTO club_events (id, club_id, title, starts_at, created_by, created_at) VALUES ('old', ?, 'Old', ?, ?, ?)")
      .run(club.id, FUT(-5), U.evown, NOW);
    expect((await events(slug)).some((e) => e.title === 'Old')).toBe(false);
    for (let i = 0; i < 18; i++) await ev(slug, 'evown', { title: `E${i}`, startsAt: FUT(100 + i) });
    expect((await ev(slug, 'evown', { title: 'Over', startsAt: FUT(300) })).body.code).toBe('CLUB_EVENT_LIMIT');
  });

  it('delete: staff only, scoped to the club; club delete cascades', async () => {
    const [first] = await events(slug);
    expect((await call('DELETE', `/api/clubs/${slug}/events/${first.id}`, 'evmem')).status).toBe(403);
    await create('evmem', 'Other Club');
    expect((await call('DELETE', `/api/clubs/other-club/events/${first.id}`, 'evmem')).body.code).toBe('CLUB_EVENT_NOT_FOUND');
    expect((await call('DELETE', `/api/clubs/${slug}/events/${first.id}`, 'evoff')).status).toBe(200);
    expect((await events(slug)).some((e) => e.id === first.id)).toBe(false);
    await call('DELETE', `/api/clubs/${slug}`, 'evown');
    expect(db.prepare('SELECT COUNT(*) n FROM club_events WHERE club_id = (SELECT id FROM clubs WHERE slug = ?) OR title = ?').get(slug, 'Old').n).toBe(0);
  });
});
