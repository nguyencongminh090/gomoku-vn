'use strict';

/**
 * admin-users.test.js — /api/admin/users* (R8 8b, #206): admin-only access matrix, search,
 * role change + lock rules, the change graph (edges), session revocation. Real SQL, in-memory DB.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
const fs = require('fs');
const os = require('os');
const pathMod = require('path');
process.env.AVATAR_DIR = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'adm-avatars-'));
// The real socket layer starts timers and pulls in RoomManager; the lock path only needs its live-socket Map.
jest.mock('../socket/state', () => ({ sessions: new Map() }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
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
const adminRouter = require('../routes/admin');

const db = database.db;
let server, base;

function add(id, role = 'member', name = id) {
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)")
    .run(id, id, name, '2026-10-10T00:00:00.000Z', role);
}
async function call(method, p, as, body) {
  const headers = {};
  if (as) headers.cookie = as;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const role = (id) => db.prepare('SELECT role FROM users WHERE id = ?').get(id).role;
const edges = () => db.prepare('SELECT * FROM admin_edges ORDER BY created_at, id').all();

beforeAll(async () => {
  add('boss', 'admin', 'Boss'); add('boss2', 'admin', 'Boss2'); add('mod', 'moderator'); add('mem', 'member', '100%_Sure'); add('bob', 'member', 'Bob');
  const app = express();
  app.use('/api/admin', adminRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
const ROLES0 = { boss: 'admin', boss2: 'admin', mod: 'moderator', mem: 'member', bob: 'member' };
beforeEach(() => {
  db.prepare('DELETE FROM admin_edges').run();
  db.prepare('DELETE FROM sessions').run();
  for (const [id, r] of Object.entries(ROLES0)) db.prepare('UPDATE users SET role = ?, locked_at = NULL, avatar_v = 0 WHERE id = ?').run(r, id);
});

describe('access matrix (admin only)', () => {
  it.each([['mem', 403], ['mod', 403], ['guest', 403], ['boss', 200]])('%s → list %i', async (as, status) => {
    expect((await call('GET', '/api/admin/users', as)).status).toBe(status);
  });
  it('anonymous → 401', async () => { expect((await call('GET', '/api/admin/users')).status).toBe(401); });
  it.each([['mod'], ['mem']])('%s cannot change roles or lock', async (as) => {
    expect((await call('POST', '/api/admin/users/bob/role', as, { role: 'admin' })).status).toBe(403);
    expect((await call('POST', '/api/admin/users/bob/lock', as, { locked: true, reason: 'x' })).status).toBe(403);
    expect(role('bob')).toBe('member');
    expect(edges()).toHaveLength(0);
  });
});

describe('list / search', () => {
  it('lists with pagination and no password hash', async () => {
    const r = await call('GET', '/api/admin/users', 'boss');
    expect(r.body.pagination.total).toBe(5);
    expect(JSON.stringify(r.body)).not.toContain('password');
    expect(r.body.users.find((u) => u.id === 'mod').role).toBe('moderator');
  });
  it('search matches username or display name, case-insensitively', async () => {
    expect((await call('GET', '/api/admin/users?q=BOB', 'boss')).body.users.map((u) => u.id)).toEqual(['bob']);
  });
  it('LIKE wildcards are literal', async () => {
    expect((await call('GET', '/api/admin/users?q=' + encodeURIComponent('%'), 'boss')).body.users.map((u) => u.id)).toEqual(['mem']);
    expect((await call('GET', '/api/admin/users?q=' + encodeURIComponent('_'), 'boss')).body.users.map((u) => u.id)).toEqual(['mem']);
  });
});

describe('role change', () => {
  it('sets the role and records an edge actor → target with from/to', async () => {
    const r = await call('POST', '/api/admin/users/bob/role', 'boss', { role: 'moderator' });
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe('moderator');
    expect(role('bob')).toBe('moderator');
    const [e] = edges();
    expect(e).toMatchObject({ actor_id: 'boss', target_id: 'bob', action: 'role_set' });
    expect(JSON.parse(e.detail)).toEqual({ from: 'member', to: 'moderator' });
  });
  it('same role is a no-op (no edge)', async () => {
    expect((await call('POST', '/api/admin/users/bob/role', 'boss', { role: 'member' })).status).toBe(200);
    expect(edges()).toHaveLength(0);
  });
  it.each([['superuser'], [undefined], [5]])('invalid role %p → 400', async (bad) => {
    const r = await call('POST', '/api/admin/users/bob/role', 'boss', { role: bad });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ADMIN_ROLE_INVALID');
  });
  it('cannot change your own role; unknown user → 404', async () => {
    expect((await call('POST', '/api/admin/users/boss/role', 'boss', { role: 'member' })).body.code).toBe('ADMIN_SELF_FORBIDDEN');
    expect(role('boss')).toBe('admin');
    expect((await call('POST', '/api/admin/users/nobody/role', 'boss', { role: 'member' })).status).toBe(404);
  });
  it('an admin can demote another admin', async () => {
    expect((await call('POST', '/api/admin/users/boss2/role', 'boss', { role: 'member' })).status).toBe(200);
    await call('POST', '/api/admin/users/boss2/role', 'boss', { role: 'admin' });
  });
});

describe('lock', () => {
  const lockedAt = (id) => db.prepare('SELECT locked_at FROM users WHERE id = ?').get(id).locked_at;
  it('needs a reason, locks, records the reason, and revokes live sessions', async () => {
    db.prepare("INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at) VALUES ('s1', 'bob', 'Bob', 0, 'a', 'a', '2999-01-01T00:00:00.000Z')").run();
    expect((await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true })).body.code).toBe('ADMIN_REASON_REQUIRED');
    expect((await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true, reason: 'x'.repeat(201) })).status).toBe(400);
    expect(lockedAt('bob')).toBeNull();
    const r = await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true, reason: 'spam' });
    expect(r.body.user.locked).toBe(true);
    expect(lockedAt('bob')).toBeTruthy();
    expect(db.prepare("SELECT revoked_at FROM sessions WHERE id = 's1'").get().revoked_at).toBeTruthy();
    const [e] = edges();
    expect(e).toMatchObject({ action: 'lock', actor_id: 'boss', target_id: 'bob' });
    expect(JSON.parse(e.detail)).toEqual({ reason: 'spam' });
  });
  it('closes the target\'s already-open socket with session:kicked ACCOUNT_LOCKED (revoking sessions alone only stops the next connect)', async () => {
    const { sessions: live } = require('../socket/state');
    const bob = { emit: jest.fn(), disconnect: jest.fn() };
    const mem = { emit: jest.fn(), disconnect: jest.fn() };
    live.set('bob', bob);
    live.set('mem', mem);
    try {
      await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true }); // refused (no reason) → nothing happens
      expect(bob.disconnect).not.toHaveBeenCalled();
      await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true, reason: 'spam' });
      expect(bob.emit).toHaveBeenCalledWith('session:kicked', expect.objectContaining({ code: 'ACCOUNT_LOCKED' }));
      expect(bob.disconnect).toHaveBeenCalledWith(true);
      expect(bob.emit.mock.invocationCallOrder[0]).toBeLessThan(bob.disconnect.mock.invocationCallOrder[0]); // tell, then close
      expect(mem.disconnect).not.toHaveBeenCalled(); // other users untouched
      bob.disconnect.mockClear();
      await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: false }); // unlock never kicks
      expect(bob.disconnect).not.toHaveBeenCalled();
      live.delete('bob');
      expect((await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true, reason: 'offline' })).status).toBe(200); // not connected → fine
    } finally {
      live.delete('bob');
      live.delete('mem');
    }
  });
  it('unlock clears it and records an edge; repeating is a no-op', async () => {
    await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true, reason: 'spam' });
    await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: true, reason: 'again' });
    expect(edges()).toHaveLength(1);
    await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: false });
    expect(lockedAt('bob')).toBeNull();
    expect(edges().map((e) => e.action)).toEqual(['lock', 'unlock']);
  });
  it('cannot lock yourself or an admin; locked must be exactly true', async () => {
    expect((await call('POST', '/api/admin/users/boss/lock', 'boss', { locked: true, reason: 'x' })).body.code).toBe('ADMIN_SELF_FORBIDDEN');
    expect((await call('POST', '/api/admin/users/boss2/lock', 'boss', { locked: true, reason: 'x' })).body.code).toBe('ADMIN_TARGET_PROTECTED');
    await call('POST', '/api/admin/users/bob/lock', 'boss', { locked: 'true', reason: 'x' });
    expect(lockedAt('bob')).toBeNull();
  });
});

describe('change graph', () => {
  it('returns the user, neighbour nodes and edges in both directions', async () => {
    await call('POST', '/api/admin/users/bob/role', 'boss', { role: 'moderator' });
    await call('POST', '/api/admin/users/bob/lock', 'boss2', { locked: true, reason: 'r' });
    await call('POST', '/api/admin/users/mem/role', 'boss', { role: 'moderator' });
    const r = await call('GET', '/api/admin/users/bob', 'boss');
    expect(r.body.user.id).toBe('bob');
    expect(r.body.edges).toHaveLength(2);
    expect(r.body.edges.every((e) => e.to === 'bob')).toBe(true);
    expect(r.body.nodes.map((n) => n.id).sort()).toEqual(['boss', 'boss2', 'bob'].sort());
    const asActor = await call('GET', '/api/admin/users/boss', 'boss');
    expect(asActor.body.edges).toHaveLength(2); // boss as actor: bob role + mem role
  });
  it('a deleted user stays a node marked deleted', async () => {
    add('gone', 'member');
    await call('POST', '/api/admin/users/gone/role', 'boss', { role: 'moderator' });
    db.prepare("DELETE FROM users WHERE id = 'gone'").run();
    const r = await call('GET', '/api/admin/users/boss', 'boss');
    expect(r.body.nodes.find((n) => n.id === 'gone')).toMatchObject({ deleted: true, role: null });
  });
  it('unknown user → 404', async () => {
    expect((await call('GET', '/api/admin/users/nope', 'boss')).status).toBe(404);
  });
});

describe('avatar removal', () => {
  const file = (id) => pathMod.join(process.env.AVATAR_DIR, id + '.webp');
  const give = (id) => { fs.writeFileSync(file(id), 'x'); db.prepare('UPDATE users SET avatar_v = 7 WHERE id = ?').run(id); };
  const v = (id) => db.prepare('SELECT avatar_v FROM users WHERE id = ?').get(id).avatar_v;

  it('detail exposes avatarUrl only when there is one', async () => {
    expect((await call('GET', '/api/admin/users/bob', 'boss')).body.user.avatarUrl).toBeNull();
    give('bob');
    expect((await call('GET', '/api/admin/users/bob', 'boss')).body.user.avatarUrl).toBe('/api/profile/avatar/bob.webp?v=7');
  });

  it('deletes the file, clears avatar_v, logs one avatar_remove edge', async () => {
    give('bob');
    const r = await call('DELETE', '/api/admin/users/bob/avatar', 'boss');
    expect(r.status).toBe(200);
    expect(r.body.user.avatarUrl).toBeNull();
    expect(fs.existsSync(file('bob'))).toBe(false);
    expect(v('bob')).toBe(0);
    const [e] = edges();
    expect(e).toMatchObject({ action: 'avatar_remove', actor_id: 'boss', target_id: 'bob' });
  });

  it('is idempotent: no avatar → 200, no edge', async () => {
    expect((await call('DELETE', '/api/admin/users/bob/avatar', 'boss')).status).toBe(200);
    expect(edges()).toHaveLength(0);
  });

  it('only admins; others keep their avatar', async () => {
    give('bob');
    for (const as of ['mod', 'mem', 'guest']) expect((await call('DELETE', '/api/admin/users/bob/avatar', as)).status).toBe(403);
    expect((await call('DELETE', '/api/admin/users/bob/avatar')).status).toBe(401);
    expect(fs.existsSync(file('bob'))).toBe(true);
    expect(v('bob')).toBe(7);
    expect(edges()).toHaveLength(0);
  });

  it('unknown user → 404; a missing file with avatar_v set still clears the row', async () => {
    expect((await call('DELETE', '/api/admin/users/nope/avatar', 'boss')).status).toBe(404);
    db.prepare('UPDATE users SET avatar_v = 3 WHERE id = ?').run('bob');
    expect((await call('DELETE', '/api/admin/users/bob/avatar', 'boss')).status).toBe(200);
    expect(v('bob')).toBe(0);
  });
});
