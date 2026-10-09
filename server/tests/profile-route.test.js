'use strict';

/**
 * profile-route.test.js — /api/profile (#177): upload safety, privacy opt-outs,
 * edit validation. Real SQL on an in-memory DB; avatars go to a temp dir.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.AVATAR_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avatars-'));

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
// "Session" = the raw cookie header; its value is the user id ('' = guest).
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => (sid === 'none' ? null : { userId: sid === 'guest' ? null : sid }),
}));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie || req.headers.cookie === 'none') return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { userId: req.headers.cookie === 'guest' ? null : req.headers.cookie };
    next();
  },
}));

const express = require('express');
const http = require('http');
const sharp = require('sharp');
const database = require('../db/database');
const profileRouter = require('../routes/profile');

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-09T00:00:00.000Z';

let server, base;

function req(method, urlPath, { cookie, body, type } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (type) headers['content-type'] = type;
    if (body) headers['content-length'] = Buffer.byteLength(body);
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(raw.toString()); } catch (_) { /* binary */ }
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

beforeAll(async () => {
  const add = (id, name) => database.db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`
  ).run(id, name, name, NOW);
  add(UID, 'alice');
  add(OTHER, 'bob');
  database.db.prepare(
    `INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, reason, board_size, started_at, ended_at)
     VALUES ('g1', '#A', ?, ?, 'alice', 'bob', 'BLACK', 'normal', 15, ?, ?)`
  ).run(UID, OTHER, NOW, NOW);

  const app = express();
  app.use('/api/profile', profileRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

async function bigPng() {
  // Noisy 1600x900 image → forces the quality ladder.
  const raw = Buffer.alloc(1600 * 900 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width: 1600, height: 900, channels: 3 } }).png().toBuffer();
}

describe('avatar upload', () => {
  it('re-encodes to a 256x256 WebP under the byte cap and serves it', async () => {
    const r = await req('POST', '/api/profile/avatar', { cookie: UID, body: await bigPng(), type: 'application/octet-stream' });
    expect(r.status).toBe(200);
    expect(r.json.bytes).toBeLessThanOrEqual(30 * 1024);
    const stored = fs.readFileSync(path.join(process.env.AVATAR_DIR, `${UID}.webp`));
    const meta = await sharp(stored).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);

    const got = await req('GET', r.json.avatarUrl);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/webp');
    expect(got.headers['cache-control']).toContain('immutable');
  });

  it('rejects non-images (even with an image content-type)', async () => {
    const r = await req('POST', '/api/profile/avatar', { cookie: UID, body: '<svg onload=alert(1)>', type: 'image/png' });
    expect(r.status).toBe(415);
  });

  it('rejects SVG', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    expect((await req('POST', '/api/profile/avatar', { cookie: UID, body: svg, type: 'image/svg+xml' })).status).toBe(415);
  });

  it('rejects input over 2 MB', async () => {
    const r = await req('POST', '/api/profile/avatar', { cookie: UID, body: Buffer.alloc(2 * 1024 * 1024 + 10), type: 'image/png' });
    expect(r.status).toBe(413);
  });

  it('requires a member session', async () => {
    expect((await req('POST', '/api/profile/avatar', { body: 'x' })).status).toBe(401);
    expect((await req('POST', '/api/profile/avatar', { cookie: 'guest', body: 'x' })).status).toBe(403);
  });

  it('does not serve non-uuid or missing avatar names', async () => {
    expect((await req('GET', '/api/profile/avatar/..%2F..%2Fetc%2Fpasswd.webp')).status).toBe(404);
    expect((await req('GET', `/api/profile/avatar/${OTHER}.webp`)).status).toBe(404);
  });

  it('DELETE removes the file and clears avatarUrl', async () => {
    const r = await req('DELETE', '/api/profile/avatar', { cookie: UID });
    expect(r.status).toBe(200);
    expect(fs.existsSync(path.join(process.env.AVATAR_DIR, `${UID}.webp`))).toBe(false);
    expect((await req('GET', '/api/profile/alice')).json.avatarUrl).toBeNull();
  });
});

describe('profile read + privacy', () => {
  it('404 for unknown user; username match is case-insensitive', async () => {
    expect((await req('GET', '/api/profile/nobody')).status).toBe(404);
    expect((await req('GET', '/api/profile/ALICE')).json.username).toBe('alice');
  });

  it('shows stats + recent games by default, never exposes password hash or ids of others', async () => {
    const r = await req('GET', '/api/profile/alice');
    expect(r.json.stats).toEqual({ games: 1, wins: 1, draws: 0 });
    expect(r.json.recent[0]).toMatchObject({ opponent: 'bob', result: 'win' });
    expect(JSON.stringify(r.json)).not.toMatch(/password|"x"/);
    expect(r.json.isSelf).toBe(false);
    expect(r.json).not.toHaveProperty('privacy');
  });

  it("opponent's view of the same game is a loss", async () => {
    expect((await req('GET', '/api/profile/bob')).json.recent[0].result).toBe('loss');
  });

  it('PUT validates bio and flags, then hides history/bio from others but not from self', async () => {
    expect((await req('PUT', '/api/profile', { cookie: UID, type: 'application/json', body: JSON.stringify({ bio: 'x'.repeat(281) }) })).status).toBe(400);
    expect((await req('PUT', '/api/profile', { cookie: UID, type: 'application/json', body: JSON.stringify({ hideBio: 'yes' }) })).status).toBe(400);
    const ok = await req('PUT', '/api/profile', { cookie: UID, type: 'application/json', body: JSON.stringify({ bio: ' hello ', hideHistory: true, hideBio: true }) });
    expect(ok.status).toBe(200);

    const pub = (await req('GET', '/api/profile/alice')).json;
    expect(pub.bio).toBeNull();
    expect(pub.stats).toBeNull();
    expect(pub.recent).toEqual([]);

    const me = (await req('GET', '/api/profile/alice', { cookie: UID })).json;
    expect(me).toMatchObject({ isSelf: true, bio: 'hello', privacy: { hideHistory: true, hideBio: true } });
    expect(me.stats.games).toBe(1);

    const other = (await req('GET', '/api/profile/alice', { cookie: OTHER })).json;
    expect(other.stats).toBeNull();
  });

  it('PUT requires a member session', async () => {
    expect((await req('PUT', '/api/profile', { type: 'application/json', body: '{}' })).status).toBe(401);
    expect((await req('PUT', '/api/profile', { cookie: 'guest', type: 'application/json', body: '{}' })).status).toBe(403);
  });
});

describe('profile clubs', () => {
  it('lists the clubs a user belongs to (confirmed roles only)', async () => {
    const { db } = database;
    db.prepare("INSERT INTO clubs (id, slug, name, description, join_policy, owner_id, created_at) VALUES ('c1', 'k1', 'K1', '', 'open', ?, ?)").run(UID, NOW);
    db.prepare("INSERT INTO club_members VALUES ('c1', ?, 'owner', ?)").run(UID, NOW);
    db.prepare("INSERT INTO club_members VALUES ('c1', ?, 'pending', ?)").run(OTHER, NOW);
    expect((await req('GET', '/api/profile/alice')).json.clubs).toEqual([{ slug: 'k1', name: 'K1', role: 'owner', members: 1 }]);
    expect((await req('GET', '/api/profile/bob')).json.clubs).toEqual([]);
  });
});

describe('ui skin preference', () => {
  const put = (body, cookie = UID) => req('PUT', '/api/profile', { cookie, type: 'application/json', body: JSON.stringify(body) });

  it('defaults to arena, saves a valid skin, rejects unknown ones', async () => {
    expect((await req('GET', '/api/profile/prefs', { cookie: UID })).json.uiSkin).toBe('arena');
    expect((await put({ uiSkin: 'zen' })).status).toBe(200);
    expect((await req('GET', '/api/profile/prefs', { cookie: UID })).json.uiSkin).toBe('zen');
    expect((await put({ uiSkin: 'neon' })).json.code).toBe('SKIN_INVALID');
    expect((await req('GET', '/api/profile/prefs', { cookie: UID })).json.uiSkin).toBe('zen');
  });

  it('is per user and needs a member session; "prefs" is not read as a username', async () => {
    expect((await req('GET', '/api/profile/prefs', { cookie: OTHER })).json.uiSkin).toBe('arena');
    expect((await req('GET', '/api/profile/prefs')).status).toBe(401);
    expect((await req('GET', '/api/profile/prefs', { cookie: 'guest' })).status).toBe(403);
  });
});

describe('rating history (#190)', () => {
  const hist = (uid, cat, before, after, daysAgo) => database.db.prepare(
    `INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at)
     VALUES (?, ?, 'g', 'x', 1, ?, ?, 80, 80, ?)`
  ).run(uid, cat, before, after, new Date(Date.now() - daysAgo * 86400000).toISOString());

  beforeAll(() => {
    database.db.prepare("INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, 'caro', 1620, 80, 0.06, 25, ?)").run(OTHER, NOW);
    hist(OTHER, 'caro', 1500, 1530, 40);   // in 90 days, outside 7
    hist(OTHER, 'caro', 1530, 1600, 5);    // +70 this week
    hist(OTHER, 'caro', 1600, 1620, 1);    // +20 → +90
    hist(OTHER, 'caro', 1400, 1700, 200);  // peak outside the window, still all-time
  });

  it('profile ratings carry the weekly change', async () => {
    const r = (await req('GET', '/api/profile/bob')).json.ratings.find((x) => x.category === 'caro');
    expect(r.delta7).toBe(90);
  });

  it('returns the curve oldest-first starting from the pre-game rating, plus all-time peak', async () => {
    const r = (await req('GET', '/api/profile/bob/rating-history?category=caro&days=90')).json;
    expect(r.points.map((p) => p.rating)).toEqual([1500, 1530, 1600, 1620]);
    expect(r.peak).toBe(1700);
    expect(r.hidden).toBe(false);
  });

  it('days is clamped and unknown category falls back; empty history is an empty curve', async () => {
    expect((await req('GET', '/api/profile/bob/rating-history?category=nope&days=99999')).json.days).toBe(365);
    const none = (await req('GET', '/api/profile/alice/rating-history?category=caro')).json;
    expect(none.points).toEqual([]);
    expect((await req('GET', '/api/profile/nobody/rating-history')).status).toBe(404);
  });

  it('thins long histories to at most 120 points', async () => {
    const ins = database.db.prepare(`INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at) VALUES (?, 'freestyle', 'g', 'x', 1, 1500, 1501, 80, 80, ?)`);
    database.db.transaction(() => { for (let i = 0; i < 400; i++) ins.run(OTHER, new Date(Date.now() - 3600000).toISOString()); })();
    expect((await req('GET', '/api/profile/bob/rating-history?category=freestyle')).json.points.length).toBe(120);
  });

  it('hide_history withholds both the curve and weekly change from others, not from the owner', async () => {
    database.db.prepare('UPDATE users SET hide_history = 1 WHERE id = ?').run(OTHER);
    const pub = (await req('GET', '/api/profile/bob/rating-history?category=caro')).json;
    expect(pub).toMatchObject({ hidden: true, points: [], peak: null });
    expect((await req('GET', '/api/profile/bob')).json.ratings.find((x) => x.category === 'caro').delta7).toBeNull();
    const own = (await req('GET', '/api/profile/bob/rating-history?category=caro', { cookie: OTHER })).json;
    expect(own.hidden).toBe(false);
    expect(own.points.length).toBeGreaterThan(0);
    database.db.prepare('UPDATE users SET hide_history = 0 WHERE id = ?').run(OTHER);
  });
});
