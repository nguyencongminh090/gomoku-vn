'use strict';

/**
 * club-sanction-rank.test.js — B461: lifting (unban/unmute) or overwriting a club sanction needs
 * rank(actor) >= rank(issuer). A banned user has no club role, so the old target-rank check let any
 * officer lift an owner's ban. Real SQL on an in-memory DB.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({ getValidSession: (sid) => ({ userId: sid }) }));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { userId: req.headers.cookie };
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const clubsRouter = require('../routes/clubs');

const NOW = '2026-11-24T00:00:00.000Z';
const db = database.db;
const U = {};
const SLUG = 'rank-club';
const URL_ = `/api/clubs/${SLUG}`;
let server, base, clubId;

function addUser(name) {
  U[name] = `${name}-id`;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(U[name], name, name.toUpperCase(), NOW);
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

const mod = (as, action, usernames) => call('POST', URL_ + '/moderation', as, { action, usernames, minutes: 5 });
const sanction = (name) => db.prepare('SELECT kind, actor_role FROM club_sanctions WHERE club_id=? AND user_id=?').get(clubId, U[name]);

// Seed membership with SQL: per-test setup through the API would exhaust the per-user write limiter.
function enrol(name, role = 'member') {
  db.prepare('INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(clubId, U[name], role, NOW);
}

beforeAll(async () => {
  ['own', 'off', 'off2', 'mem', 'mem2'].forEach(addUser);
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await call('POST', '/api/clubs', 'own', { name: 'Rank Club', joinPolicy: 'invite' });
  clubId = db.prepare('SELECT id FROM clubs WHERE slug=?').get(SLUG).id;
});

afterAll(async () => { await new Promise((r) => server.close(r)); });

beforeEach(() => {
  db.prepare('DELETE FROM club_sanctions').run();
  db.prepare("DELETE FROM club_members WHERE club_id=? AND role<>'owner'").run(clubId);
  enrol('off', 'officer');
  enrol('off2', 'officer');
  enrol('mem');
  enrol('mem2');
});

it('migration 025 adds club_sanctions.actor_role', () => {
  expect(db.prepare('PRAGMA table_info(club_sanctions)').all().map((c) => c.name)).toContain('actor_role');
});

it('records the issuer role on ban and mute', async () => {
  expect((await mod('off', 'mute', ['mem'])).status).toBe(200);
  expect(sanction('mem')).toEqual({ kind: 'mute', actor_role: 'officer' });
  expect((await mod('own', 'ban', ['mem2'])).status).toBe(200);
  expect(sanction('mem2')).toEqual({ kind: 'ban', actor_role: 'owner' });
});

it('officer cannot lift an owner-issued ban or mute', async () => {
  await mod('own', 'ban', ['mem']);
  await mod('own', 'mute', ['mem2']);
  expect((await mod('off', 'unban', ['mem'])).status).toBe(403);
  expect((await mod('off', 'unmute', ['mem2'])).status).toBe(403);
  expect(sanction('mem')).toMatchObject({ kind: 'ban' });
  expect(sanction('mem2')).toMatchObject({ kind: 'mute' });
});

it('officer cannot lift an owner ban on a former officer (the reported scenario)', async () => {
  await mod('own', 'ban', ['off2']);
  expect((await mod('off', 'unban', ['off2'])).status).toBe(403);
  expect(sanction('off2')).toMatchObject({ kind: 'ban' });
});

it('owner can lift an officer-issued ban and mute', async () => {
  await mod('off', 'ban', ['mem']);
  await mod('off', 'mute', ['mem2']);
  expect((await mod('own', 'unban', ['mem'])).status).toBe(200);
  expect((await mod('own', 'unmute', ['mem2'])).status).toBe(200);
  expect(sanction('mem')).toBeUndefined();
  expect(sanction('mem2')).toBeUndefined();
});

it('officer can lift another officer\'s ban and mute', async () => {
  await mod('off', 'ban', ['mem']);
  await mod('off', 'mute', ['mem2']);
  expect((await mod('off2', 'unban', ['mem'])).status).toBe(200);
  expect((await mod('off2', 'unmute', ['mem2'])).status).toBe(200);
  expect(sanction('mem')).toBeUndefined();
  expect(sanction('mem2')).toBeUndefined();
});

it('legacy row with NULL actor_role counts as owner-issued', async () => {
  db.prepare("INSERT INTO club_sanctions (club_id,user_id,kind,until_at,actor_role) VALUES (?,?,'ban',NULL,NULL)").run(clubId, U.mem);
  db.prepare('DELETE FROM club_members WHERE club_id=? AND user_id=?').run(clubId, U.mem);
  expect((await mod('off', 'unban', ['mem'])).status).toBe(403);
  expect(sanction('mem')).toMatchObject({ kind: 'ban' });
  expect((await mod('own', 'unban', ['mem'])).status).toBe(200);
  expect(sanction('mem')).toBeUndefined();
});

it('bulk unban fails atomically when one target was owner-sanctioned', async () => {
  await mod('off', 'ban', ['mem']);
  await mod('own', 'ban', ['mem2']);
  expect((await mod('off2', 'unban', ['mem', 'mem2'])).status).toBe(403);
  expect(sanction('mem')).toMatchObject({ kind: 'ban', actor_role: 'officer' });
  expect(sanction('mem2')).toMatchObject({ kind: 'ban', actor_role: 'owner' });
});

it('officer re-sanction cannot downgrade an owner-issued mute; owner can overwrite an officer one', async () => {
  await mod('own', 'mute', ['mem']);
  expect((await mod('off', 'mute', ['mem'])).status).toBe(403);
  expect((await mod('off', 'ban', ['mem'])).status).toBe(403);
  expect(sanction('mem')).toEqual({ kind: 'mute', actor_role: 'owner' });
  await mod('off', 'mute', ['mem2']);
  expect((await mod('own', 'mute', ['mem2'])).status).toBe(200);
  expect(sanction('mem2')).toEqual({ kind: 'mute', actor_role: 'owner' });
});

it('an expired owner mute no longer blocks an officer mute', async () => {
  await mod('own', 'mute', ['mem']);
  db.prepare("UPDATE club_sanctions SET until_at='2000-01-01T00:00:00.000Z' WHERE user_id=?").run(U.mem);
  expect((await mod('off', 'mute', ['mem'])).status).toBe(200);
  expect(sanction('mem')).toEqual({ kind: 'mute', actor_role: 'officer' });
});

it('B462: after an ownership transfer the old owner cannot lift their own sanctions, the new owner can', async () => {
  try {
    await mod('own', 'ban', ['mem']);
    await mod('own', 'mute', ['mem2']);
    expect((await call('PUT', URL_ + '/members/off/role', 'own', { role: 'owner' })).status).toBe(200);
    expect(db.prepare('SELECT owner_id FROM clubs WHERE id=?').get(clubId).owner_id).toBe(U.off);
    expect(db.prepare('SELECT role FROM club_members WHERE club_id=? AND user_id=?').get(clubId, U.own).role).toBe('officer');
    expect((await mod('own', 'unban', ['mem'])).status).toBe(403);
    expect((await mod('own', 'unmute', ['mem2'])).status).toBe(403);
    expect(sanction('mem')).toEqual({ kind: 'ban', actor_role: 'owner' });
    expect(sanction('mem2')).toEqual({ kind: 'mute', actor_role: 'owner' });
    expect((await mod('off', 'unban', ['mem'])).status).toBe(200);
    expect((await mod('off', 'unmute', ['mem2'])).status).toBe(200);
    expect(sanction('mem')).toBeUndefined();
    expect(sanction('mem2')).toBeUndefined();
  } finally {
    // Restore the fixture owner so tests added after this one see the original roles.
    db.prepare("UPDATE club_members SET role='owner' WHERE club_id=? AND user_id=?").run(clubId, U.own);
    db.prepare("UPDATE club_members SET role='officer' WHERE club_id=? AND user_id=?").run(clubId, U.off);
    db.prepare('UPDATE clubs SET owner_id=? WHERE id=?').run(U.own, clubId);
  }
});
