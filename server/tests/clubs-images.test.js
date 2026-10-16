'use strict';

/**
 * clubs-images.test.js — club avatar + banner (#250): staff-only upload, re-encode, serve, delete.
 * Real SQL on an in-memory DB.
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

const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CLUB_IMAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'club-img-'));

const express = require('express');
const http = require('http');
const sharp = require('sharp');
const database = require('../db/database');
const clubsRouter = require('../routes/clubs');

const NOW = '2026-10-09T00:00:00.000Z';
const db = database.db;
let server, base;
const addUser = (name) => db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
  .run(`${name}-id`, name, name, NOW);

function call(method, urlPath, as, body, type) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (as) headers.cookie = as === 'guest' ? 'guest' : `${as}-id`;
    if (body) { headers['content-type'] = type || 'application/json'; headers['content-length'] = body.length; }
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, buf, body: res.headers['content-type'].includes('json') ? JSON.parse(buf) : null });
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#c33' } }).png().toBuffer();
const mkClub = (as, name) => call('POST', '/api/clubs', as, Buffer.from(JSON.stringify({ name }))).then((r) => r.body.slug);

beforeAll(async () => {
  ['own', 'mem', 'other'].forEach(addUser);
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

describe.each([['avatar', 256, 256], ['banner', 1920, 480]])('club %s', (kind, w, h) => {
  let slug;
  beforeAll(async () => {
    slug = await mkClub('own', `Img ${kind} club`);
    db.prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) SELECT id, 'mem-id', 'member', ? FROM clubs WHERE slug = ?").run(NOW, slug);
  });

  it('starts without an image; the detail payload has a null url', async () => {
    expect((await call('GET', `/api/clubs/${slug}`, 'own')).body[`${kind}Url`]).toBeNull();
    expect((await call('GET', `/api/clubs/${slug}/${kind}`)).status).toBe(404);
  });

  it('staff upload is re-encoded to webp at the fixed size and then served', async () => {
    const up = await call('POST', `/api/clubs/${slug}/${kind}`, 'own', await png(900, 700), 'image/png');
    expect(up.status).toBe(200);
    expect(up.body.url).toMatch(new RegExp(`^/api/clubs/${slug}/${kind}\\?v=\\d+$`));
    const got = await call('GET', up.body.url);
    expect(got.status).toBe(200);
    expect(got.headers['cache-control']).toMatch(/immutable/);
    const meta = await sharp(got.buf).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', w, h]);
    expect((await call('GET', `/api/clubs/${slug}`)).body[`${kind}Url`]).toBe(up.body.url);
  });

  it('plain members, outsiders and guests cannot change it', async () => {
    const img = await png(50, 50);
    for (const who of ['mem', 'other', 'guest']) {
      expect((await call('POST', `/api/clubs/${slug}/${kind}`, who, img, 'image/png')).status).toBe(403);
      expect((await call('DELETE', `/api/clubs/${slug}/${kind}`, who)).status).toBe(403);
    }
    expect((await call('POST', `/api/clubs/${slug}/${kind}`, null, img, 'image/png')).status).toBe(401);
  });

  it('rejects non-images and empty bodies', async () => {
    expect((await call('POST', `/api/clubs/${slug}/${kind}`, 'own', Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(415);
    expect((await call('POST', `/api/clubs/${slug}/${kind}`, 'own', Buffer.alloc(0), 'image/png')).status).toBe(400);
  });

  it('delete clears the url and the file', async () => {
    const r = await call('DELETE', `/api/clubs/${slug}/${kind}`, 'own');
    expect(r.body.url).toBeNull();
    expect((await call('GET', `/api/clubs/${slug}`)).body[`${kind}Url`]).toBeNull();
    expect((await call('GET', `/api/clubs/${slug}/${kind}`)).status).toBe(404);
  });
});

it('the list carries avatarUrl; deleting the club removes its files', async () => {
  const slug = await mkClub('own', 'Gone club');
  await call('POST', `/api/clubs/${slug}/avatar`, 'own', await png(40, 40), 'image/png');
  await call('POST', `/api/clubs/${slug}/banner`, 'own', await png(40, 40), 'image/png');
  const listed = (await call('GET', '/api/clubs?q=Gone')).body.clubs[0];
  expect(listed.avatarUrl).toMatch(/avatar\?v=/);
  expect(fs.readdirSync(process.env.CLUB_IMAGE_DIR).length).toBeGreaterThanOrEqual(2);
  const before = fs.readdirSync(process.env.CLUB_IMAGE_DIR).length;
  expect((await call('DELETE', `/api/clubs/${slug}`, 'own')).status).toBe(200);
  expect(fs.readdirSync(process.env.CLUB_IMAGE_DIR).length).toBe(before - 2);
});
