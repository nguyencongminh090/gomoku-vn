'use strict';

/**
 * club-chat-commands.test.js — B447: club chat slash commands (/ghim, /giaohuu), @mentions, @all,
 * pin notifications, and the staff toggles that gate them. Real SQL on an in-memory DB.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
// GET /:slug reads the viewer from the session cookie (optionalUserId): cookie = user id.
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
const ClubService = require('../managers/ClubService');
const DmText = require('../managers/DmText');
const ChallengeService = require('../managers/ChallengeService');
const chat = require('../managers/ClubChatCommands');

const NOW = '2026-11-24T00:00:00.000Z';
const db = database.db;
const U = {};
const SLUG = 'cmd-club';
let server, base;

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

const say = (as, text) => { DmText.forget(U[as]); return call('POST', `/api/clubs/${SLUG}/messages`, as, { text }); };
const setChat = (as, chatSettings) => call('PUT', `/api/clubs/${SLUG}`, as, { chatSettings });
const detail = (as) => call('GET', `/api/clubs/${SLUG}`, as);
const notes = (user, type) => db.prepare('SELECT * FROM notifications WHERE user_id = ? AND type = ?').all(U[user], type);
const messages = () => db.prepare('SELECT * FROM club_messages ORDER BY id').all();
const announcement = () => db.prepare('SELECT announcement FROM clubs WHERE slug = ?').get(SLUG).announcement;

beforeAll(async () => {
  ['own', 'off', 'mem', 'mem2', 'pend', 'out'].forEach(addUser);
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await call('POST', '/api/clubs', 'own', { name: 'Cmd Club', joinPolicy: 'invite' });
  for (const u of ['off', 'mem', 'mem2']) {
    await call('POST', `/api/clubs/${SLUG}/join`, u);
    await call('POST', `/api/clubs/${SLUG}/members/${u}/approve`, 'own');
  }
  await call('PUT', `/api/clubs/${SLUG}/members/off/role`, 'own', { role: 'officer' });
  await call('POST', `/api/clubs/${SLUG}/join`, 'pend'); // stays pending
});

afterAll(async () => {
  ChallengeService._reset();
  await new Promise((r) => server.close(r));
});

beforeEach(async () => {
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM club_messages').run();
  ClubService._resetFanOut();
  ChallengeService._reset();
  await setChat('own', { ...chat.CHAT_DEFAULTS });
});

describe('ClubChatCommands (pure)', () => {
  it.each([
    ['/ghim Họp tối nay', { word: 'ghim', kind: 'pin', arg: 'Họp tối nay' }],
    ['  /GHIM   x  ', { word: 'ghim', kind: 'pin', arg: 'x' }],
    ['/giaohuu @an 3+2', { word: 'giaohuu', kind: 'challenge', arg: '@an 3+2' }],
    ['/ghim', { word: 'ghim', kind: 'pin', arg: '' }],
    ['/xyz hi', { word: 'xyz', kind: null, arg: 'hi' }],
  ])('parseCommand(%j)', (raw, want) => expect(chat.parseCommand(raw)).toEqual(want));

  it.each(['hello', '/', '/ ghim', 'a /ghim b', '/123', '//ghim', ''])('parseCommand(%j) is plain text', (raw) => {
    expect(chat.parseCommand(raw)).toBeNull();
  });

  it('parseMentions: lower-cased, deduped, capped; @all/@tatca flag; emails are not mentions', () => {
    expect(chat.parseMentions('hi @Mem and @mem, @all')).toEqual({ usernames: ['mem'], all: true });
    expect(chat.parseMentions('@TatCa')).toEqual({ usernames: [], all: true });
    expect(chat.parseMentions('mail a@mem.vn or @@mem or @ab')).toEqual({ usernames: [], all: false });
    expect(chat.parseMentions('@aaa @bbb @ccc @ddd @eee @fff').usernames).toHaveLength(chat.MAX_MENTIONS);
  });

  it('parseChallengeArg: needs a username; extras kept', () => {
    expect(chat.parseChallengeArg('@an_1 caro 3+2')).toEqual({ username: 'an_1', extras: ['caro', '3+2'] });
    expect(chat.parseChallengeArg('an')).toBeNull(); // < 3 chars
    expect(chat.parseChallengeArg('')).toBeNull();
  });

  it('readSettings / mergeSettings: defaults, corrupt JSON, whitelist, booleans only', () => {
    expect(chat.readSettings(null)).toEqual(chat.CHAT_DEFAULTS);
    expect(chat.readSettings('{bad')).toEqual(chat.CHAT_DEFAULTS);
    expect(chat.readSettings('{"notifyAll":true,"cmdPin":"no","zzz":1}')).toEqual({ ...chat.CHAT_DEFAULTS, notifyAll: true });
    expect(chat.mergeSettings(chat.CHAT_DEFAULTS, { cmdPin: false })).toEqual({ ...chat.CHAT_DEFAULTS, cmdPin: false });
    for (const bad of [{ cmdPin: 1 }, { evil: true }, [], null, 'x']) expect(chat.mergeSettings(chat.CHAT_DEFAULTS, bad)).toBeNull();
  });
});

describe('settings (staff only)', () => {
  it('defaults are exposed; noisy fan-outs are off', async () => {
    const c = (await detail('mem')).body.chat;
    expect(c).toEqual(chat.CHAT_DEFAULTS);
    expect(c.notifyAll).toBe(false);
    expect(c.notifyPin).toBe(false);
  });

  it('member cannot change them; officer can; invalid input refused and nothing changes', async () => {
    expect((await setChat('mem', { cmdPin: false })).body.code).toBe('CLUB_FORBIDDEN');
    expect((await setChat('off', { cmdPin: false })).status).toBe(200);
    expect((await detail('mem')).body.chat.cmdPin).toBe(false);
    expect((await setChat('own', { cmdPin: 'yes' })).body.code).toBe('CLUB_CHAT_SETTINGS_INVALID');
    expect((await setChat('own', { root: true })).body.code).toBe('CLUB_CHAT_SETTINGS_INVALID');
    expect((await detail('mem')).body.chat.cmdPin).toBe(false);
  });

  it('lastMessageId (newest message by someone else) is given to members only', async () => {
    await say('mem', 'one');
    const last = messages().at(-1).id;
    await say('own', 'mine');
    expect((await detail('own')).body.lastMessageId).toBe(last);
    expect((await detail('mem')).body.lastMessageId).toBe(last + 1);
    expect((await detail('mem2')).body.lastMessageId).toBe(last + 1);
    expect((await detail('pend')).body.lastMessageId).toBeUndefined();
    expect((await detail('out')).body.lastMessageId).toBeUndefined();
  });
});

describe('commands', () => {
  it('unknown command is refused, not posted', async () => {
    const r = await say('mem', '/xyz hello');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CLUB_COMMAND_UNKNOWN');
    expect(messages()).toHaveLength(0);
  });

  it('/ghim: staff set the pin (stored raw), chat row is the escaped wire form', async () => {
    const r = await say('off', '/ghim Họp <tối> nay');
    expect(r.status).toBe(201);
    expect(announcement()).toBe('Họp <tối> nay');
    const m = (await call('GET', `/api/clubs/${SLUG}/messages`, 'mem')).body.messages;
    expect(m.at(-1)).toMatchObject({ kind: 'pin', text: 'Họp &lt;tối&gt; nay', username: 'off' });
  });

  it('/ghim: plain member refused; empty and over-long refused; disabled refused before role check', async () => {
    await say('own', '/ghim keep');
    expect((await say('mem', '/ghim mine')).body.code).toBe('CLUB_FORBIDDEN');
    expect((await say('own', '/ghim')).body.code).toBe('CLUB_MESSAGE_EMPTY');
    expect((await say('own', '/ghim ' + 'x'.repeat(281))).body.code).toBe('CLUB_ANNOUNCEMENT_INVALID');
    await setChat('own', { cmdPin: false });
    const r = await say('own', '/ghim changed');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CLUB_COMMAND_DISABLED');
    expect(announcement()).toBe('keep');
  });

  it('/ghim notifies the club only when notifyPin is on, once per window, never the pender', async () => {
    await say('own', '/ghim a');
    expect(notes('mem', 'club_pin')).toHaveLength(0);
    await setChat('own', { notifyPin: true });
    await say('own', '/ghim b');
    for (const u of ['off', 'mem', 'mem2']) expect(notes(u, 'club_pin')).toHaveLength(1);
    expect(notes('own', 'club_pin')).toHaveLength(0);
    expect(notes('pend', 'club_pin')).toHaveLength(0);
    expect(JSON.parse(notes('mem', 'club_pin')[0].payload)).toMatchObject({ from: { username: 'own' }, club: { slug: SLUG, name: 'Cmd Club' } });
    db.prepare('DELETE FROM notifications').run();
    await say('own', '/ghim b fixed');
    expect(announcement()).toBe('b fixed');
    expect(notes('mem', 'club_pin')).toHaveLength(0); // re-pin inside 10 min: no second ping
    jest.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    await say('own', '/ghim c');
    expect(notes('mem', 'club_pin')).toHaveLength(1);
  });

  it('/giaohuu: unrated challenge to a member, chat row carries the target', async () => {
    const r = await say('mem', '/giaohuu @Mem2');
    expect(r.status).toBe(201);
    expect(r.body.kind).toBe('challenge');
    const n = notes('mem2', 'challenge');
    expect(n).toHaveLength(1);
    expect(JSON.parse(n[0].payload)).toMatchObject({ rule: 'freestyle', time: '5+3', rated: false });
    const m = (await call('GET', `/api/clubs/${SLUG}/messages`, 'own')).body.messages.at(-1);
    expect(m).toMatchObject({ kind: 'challenge', username: 'mem', meta: { to: { username: 'mem2', displayName: 'MEM2' }, rule: 'freestyle', time: '5+3' } });
  });

  it('/giaohuu: rule and time extras', async () => {
    await say('mem', '/giaohuu @mem2 caro 3+2');
    expect(JSON.parse(notes('mem2', 'challenge')[0].payload)).toMatchObject({ rule: 'caro', time: '3+2' });
  });

  it.each([
    ['/giaohuu', 400, 'CLUB_COMMAND_INVALID'],
    ['/giaohuu @mem2 fast', 400, 'CLUB_COMMAND_INVALID'],
    ['/giaohuu @pend', 404, 'CLUB_NOT_MEMBER'],
    ['/giaohuu @out', 404, 'CLUB_NOT_MEMBER'],
    ['/giaohuu @nobody', 404, 'CLUB_NOT_MEMBER'],
    ['/giaohuu @mem', 400, 'CANNOT_CHALLENGE_SELF'],
  ])('%s → %i %s, nothing posted', async (text, status, code) => {
    const r = await say('mem', text);
    expect(r.status).toBe(status);
    expect(r.body.code).toBe(code);
    expect(messages()).toHaveLength(0);
  });

  it('/giaohuu disabled → refused, no challenge sent', async () => {
    await setChat('own', { cmdChallenge: false });
    expect((await say('mem', '/giaohuu @mem2')).body.code).toBe('CLUB_COMMAND_DISABLED');
    expect(notes('mem2', 'challenge')).toHaveLength(0);
  });
});

describe('mentions and @all', () => {
  it('@name notifies confirmed members only, not the sender, not pending/outsiders', async () => {
    expect((await say('mem', 'hi @MEM2 @mem @pend @out @off @mem2')).status).toBe(201);
    expect(notes('mem2', 'club_mention')).toHaveLength(1);
    expect(notes('off', 'club_mention')).toHaveLength(1);
    for (const u of ['mem', 'pend', 'out', 'own']) expect(notes(u, 'club_mention')).toHaveLength(0);
    expect(JSON.parse(notes('mem2', 'club_mention')[0].payload)).toMatchObject({ from: { username: 'mem' }, club: { slug: SLUG } });
  });

  it('notifyMention off → message posts, nobody is notified', async () => {
    await setChat('own', { notifyMention: false });
    expect((await say('mem', '@mem2 hi')).status).toBe(201);
    expect(notes('mem2', 'club_mention')).toHaveLength(0);
  });

  it('@all: only staff, only when enabled; once per 10 min per club', async () => {
    await say('own', '@all họp'); // off by default → plain text
    expect(notes('mem', 'club_all')).toHaveLength(0);
    await setChat('own', { notifyAll: true });
    await say('mem', '@all hi'); // member: plain text
    expect(notes('off', 'club_all')).toHaveLength(0);
    expect((await say('off', '@tatca họp lúc 8h')).status).toBe(201);
    for (const u of ['own', 'mem', 'mem2']) expect(notes(u, 'club_all')).toHaveLength(1);
    expect(notes('off', 'club_all')).toHaveLength(0);
    expect(notes('pend', 'club_all')).toHaveLength(0);
    const before = messages().length;
    const r = await say('own', '@all again');
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('CLUB_NOTIFY_COOLDOWN');
    expect(messages()).toHaveLength(before);
    jest.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    expect((await say('own', '@all again')).status).toBe(201);
  });
});

it('shares alias permissions and returns help privately', async () => {
  expect((await say('mem', '/announce họp')).status).toBe(403);
  expect((await say('off', '/announce họp')).body.kind).toBe('pin');
  const help = await say('mem', '/help');
  expect(help.body.commands).toContain('poll');
  expect(help.body.commands).not.toContain('pin');
  expect(messages()).toHaveLength(1);
});

it('rolls back mixed-rank bulk actions and enforces mutes and bans across entry points', async () => {
  const url = '/api/clubs/' + SLUG;
  const mod = (action, usernames) => call('POST', url + '/moderation', 'off', { action, usernames, minutes: 5 });
  expect((await mod('ban', ['mem', 'own'])).status).toBe(403);
  expect((await say('mem', 'hi')).status).toBe(201);
  expect((await say('off', '/mute @mem 10')).status).toBe(201);
  expect((await say('mem', '/poll q | a | b')).body.code).toBe('CLUB_MUTED');
  expect((await mod('ban', ['mem'])).status).toBe(200);
  expect((await call('POST', url + '/join', 'mem')).body.code).toBe('CLUB_BANNED');
  expect((await call('POST', url + '/invites/mem', 'own')).body.code).toBe('CLUB_BANNED');
  expect((await detail('out')).body.sanctions).toBeUndefined();
  expect((await mod('unban', ['mem'])).status).toBe(200);
  await call('POST', url + '/join', 'mem');
  await call('POST', url + '/members/mem/approve', 'own');
});
