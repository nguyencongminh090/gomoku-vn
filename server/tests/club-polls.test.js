'use strict';

/**
 * club-polls.test.js — B449: /binhchon polls in club chat. Parser boundaries, create / vote / change / take back,
 * 24 h lazy close, early close, named voters, open-poll cap, toggles, notifications, cascades, migration 020.
 * Real SQL on an in-memory DB (same harness as club-chat-commands.test.js).
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

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

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const database = require('../db/database');
const clubsRouter = require('../routes/clubs');
const ClubService = require('../managers/ClubService');
const DmText = require('../managers/DmText');
const chat = require('../managers/ClubChatCommands');

const T0 = Date.parse('2026-11-24T08:00:00.000Z');
const HOUR = 3600 * 1000;
const db = database.db;
const U = {};
const SLUG = 'poll-club';
let server, base;

function addUser(name) {
  U[name] = `${name}-id`;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(U[name], name, name.toUpperCase(), new Date(T0).toISOString());
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

const say = (as, text, slug = SLUG) => { DmText.forget(U[as]); return call('POST', `/api/clubs/${slug}/messages`, as, { text }); };
const setChat = (as, chatSettings) => call('PUT', `/api/clubs/${SLUG}`, as, { chatSettings });
const vote = (as, id, option, slug = SLUG) => call('POST', `/api/clubs/${slug}/messages/${id}/vote`, as, { option });
const close = (as, id) => call('POST', `/api/clubs/${SLUG}/messages/${id}/close`, as);
const voters = (as, id) => call('GET', `/api/clubs/${SLUG}/messages/${id}/voters`, as);
const list = (as, q = '') => call('GET', `/api/clubs/${SLUG}/messages${q}`, as);
const notes = (user, type) => db.prepare('SELECT * FROM notifications WHERE user_id = ? AND type = ?').all(U[user], type);
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const poll = async (as = 'mem', text = '/binhchon Tối nay đánh mấy giờ? | 20h | 21h | 22h') => {
  const r = await say(as, text);
  expect(r.status).toBe(201);
  return r.body;
};

beforeAll(async () => {
  jest.setSystemTime(T0);
  ['own', 'off', 'mem', 'mem2', 'pend', 'out'].forEach(addUser);
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await call('POST', '/api/clubs', 'own', { name: 'Poll Club', joinPolicy: 'invite' });
  for (const u of ['off', 'mem', 'mem2']) {
    await call('POST', `/api/clubs/${SLUG}/join`, u);
    await call('POST', `/api/clubs/${SLUG}/members/${u}/approve`, 'own');
  }
  await call('PUT', `/api/clubs/${SLUG}/members/off/role`, 'own', { role: 'officer' });
  await call('POST', `/api/clubs/${SLUG}/join`, 'pend');
  await call('POST', '/api/clubs', 'out', { name: 'Other Club', joinPolicy: 'open' });
});

afterAll(async () => { await new Promise((r) => server.close(r)); });

beforeEach(async () => {
  jest.setSystemTime(T0);
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM club_messages').run();
  ClubService._resetFanOut();
  await setChat('own', { ...chat.CHAT_DEFAULTS });
});

describe('parsePollArg (pure)', () => {
  const opt = (n, len = 1) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i).repeat(len));
  it.each([
    ['', 'usage'],
    ['| a | b', 'usage'],
    ['Q?', 'too_few'],
    ['Q? | a', 'too_few'],
    ['Q? | a | | ', 'too_few'], // empty parts dropped
    ['Q? | ' + opt(7).join(' | '), 'too_many'],
    ['x'.repeat(141) + ' | a | b', 'too_long'],
    ['Q? | ' + 'a'.repeat(51) + ' | b', 'too_long'],
    ['Q? | Có | có', 'duplicate'],
    ['Q? | Đúng | ĐÚNG', 'duplicate'],
  ])('%j → %s', (arg, error) => expect(chat.parsePollArg(arg)).toEqual({ error }));

  it('2 and 6 options, 140 / 50 chars are the limits; whitespace collapsed', () => {
    expect(chat.parsePollArg('Q? | a | b')).toEqual({ question: 'Q?', options: ['a', 'b'] });
    expect(chat.parsePollArg('Q | ' + opt(6).join('|')).options).toHaveLength(6);
    expect(chat.parsePollArg('x'.repeat(140) + ' | ' + 'a'.repeat(50) + ' | b').options[0]).toHaveLength(50);
    expect(chat.parsePollArg('  Mấy   giờ?  |  20h  |21h')).toEqual({ question: 'Mấy giờ?', options: ['20h', '21h'] });
  });

  it('/binhchon is a known command gated by cmdPoll (on), notifyPoll off by default', () => {
    expect(chat.parseCommand('/binhchon a | b | c')).toEqual({ word: 'binhchon', kind: 'poll', arg: 'a | b | c' });
    expect(chat.COMMAND_TOGGLE.poll).toBe('cmdPoll');
    expect(chat.CHAT_DEFAULTS.cmdPoll).toBe(true);
    expect(chat.CHAT_DEFAULTS.notifyPoll).toBe(false);
  });
});

describe('create', () => {
  it('any member creates; card has question (escaped wire form), options, zero tallies, closes in 24 h', async () => {
    const r = await poll('mem', '/binhchon Giờ <nào>? | 20h | 21h');
    expect(r.kind).toBe('poll');
    expect(r.poll).toEqual({
      options: ['20h', '21h'], counts: [0, 0], total: 0, myOption: null,
      closesAt: new Date(T0 + 24 * HOUR).toISOString(), closed: false, canClose: true,
    });
    const m = (await list('mem2')).body.messages.at(-1);
    expect(m).toMatchObject({ id: r.id, kind: 'poll', text: 'Giờ &lt;nào&gt;?', username: 'mem' });
    expect(m.poll).toMatchObject({ options: ['20h', '21h'], canClose: false }); // mem2 is neither creator nor staff
    expect((await list('off')).body.messages.at(-1).poll.canClose).toBe(true); // staff
  });

  it('bad syntax refused with a reason; nothing posted', async () => {
    for (const [text, msg] of [['/binhchon', /Cú pháp/], ['/binhchon Q | a', /ít nhất 2/], ['/binhchon Q | a | A', /trùng/]]) {
      const r = await say('mem', text);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('CLUB_POLL_INVALID');
      expect(r.body.error).toMatch(msg);
    }
    expect(count('club_messages')).toBe(0);
    expect(count('club_polls')).toBe(0);
  });

  it('pending, outsider and guestless calls are refused', async () => {
    expect((await say('pend', '/binhchon Q | a | b')).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
    expect((await say('out', '/binhchon Q | a | b')).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
  });

  it('cmdPoll off → refused for everyone, staff included', async () => {
    await setChat('own', { cmdPoll: false });
    const r = await say('own', '/binhchon Q | a | b');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CLUB_COMMAND_DISABLED');
  });

  it('at most 3 open polls per creator; closing one (or 24 h passing) frees a slot; others unaffected', async () => {
    const ids = [];
    for (let i = 0; i < ClubService.MAX_OPEN_POLLS; i++) ids.push((await poll('mem', `/binhchon Q${i} | a | b`)).id);
    const r = await say('mem', '/binhchon Q4 | a | b');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CLUB_POLL_LIMIT');
    await poll('mem2', '/binhchon other | a | b'); // per creator
    expect((await close('mem', ids[0])).status).toBe(200);
    await poll('mem', '/binhchon Q4 | a | b');
    expect((await say('mem', '/binhchon Q5 | a | b')).body.code).toBe('CLUB_POLL_LIMIT');
    jest.setSystemTime(T0 + 24 * HOUR);
    await poll('mem', '/binhchon Q6 | a | b');
  });
});

describe('vote', () => {
  it('vote, change, take back: one vote per member, server-side tallies, myOption per viewer', async () => {
    const { id } = await poll();
    expect((await vote('mem', id, 0)).body.poll).toMatchObject({ counts: [1, 0, 0], total: 1, myOption: 0 });
    expect((await vote('mem2', id, 0)).body.poll).toMatchObject({ counts: [2, 0, 0], myOption: 0 });
    expect((await vote('mem', id, 2)).body.poll).toMatchObject({ counts: [1, 0, 1], total: 2, myOption: 2 });
    expect((await vote('mem', id, 2)).body.poll).toMatchObject({ counts: [1, 0, 1], myOption: 2 }); // idempotent, no toggle
    expect((await vote('mem2', id, null)).body.poll).toMatchObject({ counts: [0, 0, 1], total: 1, myOption: null });
    expect((await list('own')).body.messages.at(-1).poll).toMatchObject({ counts: [0, 0, 1], myOption: null });
    expect(count('club_poll_votes')).toBe(1);
  });

  it.each([[-1], [3], [1.5], ['1'], [true], [undefined]])('option %j refused', async (option) => {
    const { id } = await poll();
    const r = await vote('mem', id, option);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CLUB_POLL_BAD_OPTION');
  });

  it('non-member, pending, other club slug, non-poll message and unknown id are refused', async () => {
    const { id } = await poll();
    await say('mem', 'plain text');
    const textId = db.prepare("SELECT id FROM club_messages WHERE kind = 'text'").get().id;
    expect((await vote('out', id, 0)).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
    expect((await vote('pend', id, 0)).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
    expect((await vote('out', id, 0, 'other-club')).status).toBe(404); // owner of other club, poll is not there
    expect((await vote('mem', textId, 0)).body.code).toBe('CLUB_POLL_NOT_FOUND');
    expect((await vote('mem', 999999, 0)).body.code).toBe('CLUB_POLL_NOT_FOUND');
    expect(count('club_poll_votes')).toBe(0);
  });

  it('closes 24 h after creation (lazy): 1 ms before still open, at 24 h votes refused, tallies kept', async () => {
    const { id } = await poll();
    await vote('mem', id, 1);
    jest.setSystemTime(T0 + 24 * HOUR - 1);
    expect((await vote('mem2', id, 1)).status).toBe(200);
    jest.setSystemTime(T0 + 24 * HOUR);
    const r = await vote('own', id, 0);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CLUB_POLL_CLOSED');
    expect((await vote('mem', id, null)).body.code).toBe('CLUB_POLL_CLOSED');
    expect((await list('mem')).body.messages.at(-1).poll).toMatchObject({ counts: [0, 2, 0], closed: true, canClose: false, myOption: 1 });
  });
});

describe('close', () => {
  it('creator or staff close early; plain member refused; closing twice is a no-op; votes then refused', async () => {
    const { id } = await poll('mem');
    expect((await close('mem2', id)).body.code).toBe('CLUB_FORBIDDEN');
    jest.setSystemTime(T0 + HOUR);
    const r = await close('off', id);
    expect(r.status).toBe(200);
    expect(r.body.poll).toMatchObject({ closed: true, canClose: false, closesAt: new Date(T0 + HOUR).toISOString() });
    jest.setSystemTime(T0 + 2 * HOUR);
    expect((await close('mem', id)).body.poll.closesAt).toBe(new Date(T0 + HOUR).toISOString());
    expect((await vote('mem2', id, 0)).body.code).toBe('CLUB_POLL_CLOSED');
  });
});

describe('voters (named votes, on demand)', () => {
  it('names per option in vote order; members only; not part of the polling payload', async () => {
    const { id } = await poll();
    await vote('mem2', id, 1);
    jest.setSystemTime(T0 + 1000);
    await vote('own', id, 1);
    await vote('mem', id, 0);
    const r = await voters('off', id);
    expect(r.status).toBe(200);
    expect(r.body.voters.map((o) => o.map((v) => v.username))).toEqual([['mem'], ['mem2', 'own'], []]);
    expect(r.body.voters[1][0]).toEqual({ username: 'mem2', displayName: 'MEM2', avatarUrl: null });
    expect((await voters('out', id)).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
    expect(JSON.stringify((await list('mem')).body)).not.toMatch(/MEM2/);
  });
});

describe('refresh on the chat tick (?polls=)', () => {
  it('returns fresh state for listed ids of this club only; capped; junk ignored; absent → no key', async () => {
    const a = (await poll('mem', '/binhchon A | x | y')).id;
    const b = (await poll('mem2', '/binhchon B | x | y')).id;
    await vote('mem2', a, 1);
    const r = await list('mem', `?after=${b}&polls=${a},${b},abc,-1,${a}`);
    expect(r.body.messages).toEqual([]);
    expect(Object.keys(r.body.polls).map(Number).sort()).toEqual([a, b].sort());
    expect(r.body.polls[a]).toMatchObject({ counts: [0, 1], myOption: null, canClose: true });
    expect(r.body.polls[b]).toMatchObject({ canClose: false });
    expect((await list('mem', `?after=${b}`)).body.polls).toBeUndefined();
    expect((await list('pend', `?polls=${a}`)).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
  });
});

describe('notifications', () => {
  it('notifyPoll off (default) → nobody; on → whole club except creator and pender, once per 10 min', async () => {
    await poll('mem', '/binhchon A | x | y');
    expect(notes('own', 'club_poll')).toHaveLength(0);
    await setChat('own', { notifyPoll: true });
    const { id } = await poll('mem', '/binhchon B | x | y');
    for (const u of ['own', 'off', 'mem2']) expect(notes(u, 'club_poll')).toHaveLength(1);
    expect(notes('mem', 'club_poll')).toHaveLength(0);
    expect(notes('pend', 'club_poll')).toHaveLength(0);
    expect(JSON.parse(notes('own', 'club_poll')[0].payload)).toMatchObject({ club: { slug: SLUG }, from: { username: 'mem' }, messageId: id });
    await poll('mem2', '/binhchon C | x | y');
    expect(notes('own', 'club_poll')).toHaveLength(1); // cooldown
  });
});

describe('cascades', () => {
  it('staff delete of the poll message removes poll + votes', async () => {
    const { id } = await poll();
    await vote('mem', id, 0);
    expect((await call('DELETE', `/api/clubs/${SLUG}/messages/${id}`, 'off')).status).toBe(200);
    expect(count('club_polls')).toBe(0);
    expect(count('club_poll_votes')).toBe(0);
  });

  it('the newest-200 trim drops an old poll and its votes', async () => {
    const { id } = await poll();
    await vote('mem', id, 0);
    const clubId = db.prepare('SELECT id FROM clubs WHERE slug = ?').get(SLUG).id;
    const ins = db.prepare("INSERT INTO club_messages (club_id, sender_id, body, created_at) VALUES (?, ?, 'x', ?)");
    for (let i = 0; i < 199; i++) ins.run(clubId, U.own, new Date(T0).toISOString());
    expect(count('club_polls')).toBe(1);
    await say('own', 'the 201st');
    expect(db.prepare('SELECT 1 FROM club_messages WHERE id = ?').get(id)).toBeUndefined();
    expect(count('club_polls')).toBe(0);
    expect(count('club_poll_votes')).toBe(0);
  });

  it('deleting a voter account removes their votes', async () => {
    addUser('gone');
    await call('POST', `/api/clubs/${SLUG}/members/gone/approve`, 'own'); // not a member: approve fails, insert directly
    const clubId = db.prepare('SELECT id FROM clubs WHERE slug = ?').get(SLUG).id;
    db.prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(clubId, U.gone, new Date(T0).toISOString());
    const { id } = await poll();
    await vote('gone', id, 1);
    db.prepare('DELETE FROM club_members WHERE user_id = ?').run(U.gone);
    db.prepare('DELETE FROM users WHERE id = ?').run(U.gone);
    expect(count('club_poll_votes')).toBe(0);
  });

  it('deleting the club removes polls and votes', async () => {
    await call('POST', '/api/clubs', 'mem2', { name: 'Tmp Poll' });
    const r = await say('mem2', '/binhchon Q | a | b', 'tmp-poll');
    await vote('mem2', r.body.id, 0, 'tmp-poll');
    expect(count('club_polls')).toBe(1);
    expect((await call('DELETE', '/api/clubs/tmp-poll', 'mem2')).status).toBe(200);
    expect(count('club_polls')).toBe(0);
    expect(count('club_poll_votes')).toBe(0);
  });
});

describe('migration 020 on a 019-era table', () => {
  it('keeps ids, kinds and the id sequence; accepts poll; still rejects unknown kinds', () => {
    const Actual = jest.requireActual('better-sqlite3');
    const x = new Actual(':memory:');
    x.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE clubs (id TEXT PRIMARY KEY);
      CREATE TABLE club_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'pin', 'challenge')), meta TEXT);
      INSERT INTO users VALUES ('u'); INSERT INTO clubs VALUES ('c');`);
    const ins = x.prepare("INSERT INTO club_messages (club_id, sender_id, body, created_at, kind, meta) VALUES ('c', 'u', 'b', 't', ?, ?)");
    ins.run('text', null); ins.run('pin', null); ins.run('challenge', '{"to":1}'); ins.run('text', null); ins.run('text', null);
    x.exec('DELETE FROM club_messages WHERE id >= 4'); // staff deleted the newest two: sequence (5) > max id (3)
    x.exec(fs.readFileSync(path.join(__dirname, '../db/migrations/020_club_polls.sql'), 'utf8'));
    expect(x.prepare('SELECT id, kind, meta FROM club_messages ORDER BY id').all()).toEqual([
      { id: 1, kind: 'text', meta: null }, { id: 2, kind: 'pin', meta: null }, { id: 3, kind: 'challenge', meta: '{"to":1}' }]);
    expect(Number(ins.run('poll', null).lastInsertRowid)).toBe(6); // never reuses 4/5
    expect(() => ins.run('zzz', null)).toThrow(/CHECK/);
    expect(x.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_club_messages_club'").get()).toBeTruthy();
    x.close();
  });
});
