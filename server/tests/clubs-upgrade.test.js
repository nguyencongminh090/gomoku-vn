'use strict';

/**
 * clubs-upgrade.test.js — #235: identity, announcement, invites, notifications, weekly board, history.
 * Same in-memory harness as clubs-route.test.js.
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
  ['owner', 'off', 'mem', 'newbie', 'extra', 'stranger'].forEach(addUser);
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

const notifs = (user) => database.db.prepare('SELECT type, actor_id, payload FROM notifications WHERE user_id = ? ORDER BY id').all(U[user]);
const logTypes = (slug) => db.prepare('SELECT l.type FROM club_log l JOIN clubs c ON c.id = l.club_id WHERE c.slug = ? ORDER BY l.id').all(slug).map((r) => r.type);

describe('identity + announcement', () => {
  it('create accepts color/tag (tag upper-cased); defaults blue/empty; bad values 400', async () => {
    expect((await create('owner', 'Ident Club', { color: 'teal', tag: 'hn1' })).status).toBe(201);
    expect((await call('GET', '/api/clubs/ident-club')).body).toMatchObject({ color: 'teal', tag: 'HN1', announcement: '' });
    expect((await create('off', 'Plain Club')).status).toBe(201);
    expect((await call('GET', '/api/clubs/plain-club')).body).toMatchObject({ color: 'blue', tag: '' });
    expect((await create('extra', 'Bad Color', { color: 'neon' })).body.code).toBe('CLUB_COLOR_INVALID');
    expect((await create('extra', 'Bad Tag', { tag: 'x' })).body.code).toBe('CLUB_TAG_INVALID');
    expect((await create('extra', 'Bad Tag 2', { tag: 'abcde' })).body.code).toBe('CLUB_TAG_INVALID');
    expect((await create('extra', 'Bad Tag 3', { tag: 'a b' })).body.code).toBe('CLUB_TAG_INVALID');
  });

  it('staff edit color/tag/announcement; members cannot; announcement ≤ 280; list carries color/tag', async () => {
    await call('POST', '/api/clubs/ident-club/join', 'mem');
    expect((await call('PUT', '/api/clubs/ident-club', 'mem', { announcement: 'x' })).status).toBe(403);
    expect((await call('PUT', '/api/clubs/ident-club', 'owner', { announcement: 'Họp tối nay', color: 'red', tag: 'ab' })).status).toBe(200);
    expect((await call('GET', '/api/clubs/ident-club')).body).toMatchObject({ announcement: 'Họp tối nay', color: 'red', tag: 'AB' });
    expect((await call('PUT', '/api/clubs/ident-club', 'owner', { announcement: 'x'.repeat(281) })).body.code).toBe('CLUB_ANNOUNCEMENT_INVALID');
    const list = (await call('GET', '/api/clubs?q=Ident')).body.clubs;
    expect(list[0]).toMatchObject({ color: 'red', tag: 'AB' });
    expect((await call('PUT', '/api/clubs/ident-club', 'owner', { tag: '' })).status).toBe(200);
    expect((await call('GET', '/api/clubs/ident-club')).body.tag).toBe('');
  });
});

describe('invites + notifications + history', () => {
  beforeAll(async () => { await create('owner', 'Closed Club', { joinPolicy: 'invite' }); });

  it('join request notifies staff; approval notifies the requester; cancel withdraws the staff notification', async () => {
    expect((await call('POST', '/api/clubs/closed-club/join', 'newbie')).body.role).toBe('pending');
    expect(notifs('owner').map((n) => n.type)).toContain('club_request');
    expect(JSON.parse(notifs('owner').find((n) => n.type === 'club_request').payload).club.slug).toBe('closed-club');
    await call('POST', '/api/clubs/closed-club/members/newbie/approve', 'owner');
    expect(notifs('owner').map((n) => n.type)).not.toContain('club_request');
    expect(notifs('newbie').map((n) => n.type)).toContain('club_approved');

    await call('POST', '/api/clubs/closed-club/join', 'stranger');
    await call('POST', '/api/clubs/closed-club/leave', 'stranger');
    expect(notifs('owner').map((n) => n.type)).not.toContain('club_request');
  });

  it('staff invite lets the invitee join an invite-only club directly; non-staff / dup / member rejected', async () => {
    expect((await call('POST', '/api/clubs/closed-club/invites/stranger', 'newbie')).status).toBe(403);
    expect((await call('POST', '/api/clubs/closed-club/invites/newbie', 'owner')).body.code).toBe('CLUB_ALREADY_MEMBER');
    expect((await call('POST', '/api/clubs/closed-club/invites/stranger', 'owner')).status).toBe(201);
    expect(notifs('stranger').map((n) => n.type)).toContain('club_invite');
    const asInvitee = (await call('GET', '/api/clubs/closed-club', 'stranger')).body;
    expect(asInvitee.invited).toBe(true);
    expect(asInvitee.invites).toBeUndefined(); // staff-only
    expect((await call('GET', '/api/clubs/closed-club', 'owner')).body.invites).toEqual([{ username: 'stranger', displayName: 'STRANGER' }]);
    expect((await call('POST', '/api/clubs/closed-club/join', 'stranger')).body.role).toBe('member');
    expect(db.prepare('SELECT COUNT(*) AS n FROM club_invites').get().n).toBe(0);
  });

  it('revoke removes the invite and its notification; a revoked user needs approval again', async () => {
    await call('POST', '/api/clubs/closed-club/invites/extra', 'owner');
    expect((await call('DELETE', '/api/clubs/closed-club/invites/extra', 'owner')).status).toBe(200);
    expect((await call('DELETE', '/api/clubs/closed-club/invites/extra', 'owner')).body.code).toBe('CLUB_INVITE_NOT_FOUND');
    expect(notifs('extra').map((n) => n.type)).not.toContain('club_invite');
    expect((await call('POST', '/api/clubs/closed-club/join', 'extra')).body.role).toBe('pending');
  });

  it('history records join/approve/invite/kick/role/leave; staff only', async () => {
    await call('PUT', '/api/clubs/closed-club/members/newbie/role', 'owner', { role: 'officer' });
    await call('DELETE', '/api/clubs/closed-club/members/extra', 'owner'); // reject
    await call('DELETE', '/api/clubs/closed-club/members/stranger', 'owner'); // kick
    expect(logTypes('closed-club')).toEqual(['approve', 'invite', 'join', 'invite', 'role', 'reject', 'kick']);
    const h = (await call('GET', '/api/clubs/closed-club', 'owner')).body.history;
    expect(h[0]).toMatchObject({ type: 'kick', actor: { username: 'owner' }, target: { username: 'stranger' } });
    expect(h.find((e) => e.type === 'role').detail).toBe('officer');
    expect((await call('GET', '/api/clubs/closed-club', 'mem')).body.history).toBeUndefined();
    expect((await call('GET', '/api/clubs/closed-club')).body.history).toBeUndefined();
  });
});

describe('weekly board', () => {
  function game(id, black, white, winner, endedAt) {
    db.prepare(`INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, board_size, started_at, ended_at)
                VALUES (?, 'r', ?, ?, 'b', 'w', ?, 15, ?, ?)`).run(id, U[black], white ? U[white] : null, winner, endedAt, endedAt);
  }

  it('counts wins in the last 7 days for confirmed members only, wins desc then fewer games', async () => {
    await create('owner', 'Weekly Club');
    await call('POST', '/api/clubs/weekly-club/join', 'mem');
    await call('POST', '/api/clubs/weekly-club/join', 'off');
    const recent = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const old = new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString();
    game('w1', 'owner', 'mem', 'BLACK', recent);   // owner win
    game('w2', 'owner', 'mem', 'BLACK', recent);   // owner win
    game('w3', 'mem', 'owner', 'BLACK', recent);   // mem win
    game('w4', 'off', 'mem', 'BLACK', old);        // too old
    game('w5', 'off', 'stranger', 'BLACK', recent); // off win; stranger not a member
    game('w6', 'mem', 'off', 'draw', recent);      // draw → no win
    game('w7', 'off', null, null, recent);          // interrupted → ignored
    const w = (await call('GET', '/api/clubs/weekly-club')).body.weekly;
    expect(w.map((r) => [r.username, r.wins, r.played])).toEqual([['owner', 2, 3], ['mem', 1, 4], ['off', 1, 2]].sort((a, b) => b[1] - a[1] || a[2] - b[2]));
    expect(w.map((r) => r.rank)).toEqual([1, 2, 3]);
    await call('DELETE', '/api/clubs/weekly-club/members/mem', 'owner');
    expect((await call('GET', '/api/clubs/weekly-club')).body.weekly.map((r) => r.username)).toEqual(['owner', 'off']);
  });

  it('empty when nobody won this week', async () => {
    await create('extra', 'Quiet Club');
    expect((await call('GET', '/api/clubs/quiet-club')).body.weekly).toEqual([]);
  });
});
