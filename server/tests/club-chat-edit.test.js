'use strict';

/**
 * club-chat-edit.test.js — B475: edit and delete own club chat messages. PATCH refusals, mention diff with
 * one ping per message, the `rev`/`edited` refresh path (monotonic after trim/delete), Q1 delete rank rule,
 * report `prior`/`later`, pin delete clearing the announcement. Real SQL on an in-memory DB.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
// The router's 120/h write limiter would trip mid-suite (its 429 is not JSON): pass everything through.
jest.mock('express-rate-limit', () => {
  const limiter = () => (req, res, next) => next();
  limiter.ipKeyGenerator = (ip) => ip;
  return limiter;
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
const ClubService = require('../managers/ClubService');
const ClubOversight = require('../managers/ClubOversight');
const DmText = require('../managers/DmText');
const chat = require('../managers/ClubChatCommands');

const NOW = '2026-11-26T00:00:00.000Z';
const db = database.db;
const U = {};
const SLUG = 'edit-club';
let server, base, clubId;

function addUser(name, role = 'member') {
  U[name] = `${name}-id`;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)`)
    .run(U[name], name, name.toUpperCase(), NOW, role);
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

const say = async (as, text) => {
  DmText.forget(U[as]);
  const r = await call('POST', `/api/clubs/${SLUG}/messages`, as, { text });
  expect(r.status).toBe(201);
  return r.body.id;
};
const edit = (as, id, text) => { DmText.forget(U[as]); return call('PATCH', `/api/clubs/${SLUG}/messages/${id}`, as, { text }); };
const del = (as, id) => call('DELETE', `/api/clubs/${SLUG}/messages/${id}`, as);
const get = (as, q = '') => call('GET', `/api/clubs/${SLUG}/messages${q}`, as);
const row = (id) => db.prepare('SELECT * FROM club_messages WHERE id = ?').get(id);
const pings = (user) => db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'club_mention'").all(U[user]);
const rev = () => db.prepare('SELECT chat_rev FROM clubs WHERE id = ?').get(clubId).chat_rev;
const mute = (user) => db.prepare("INSERT INTO club_sanctions (club_id,user_id,kind,until_at) VALUES (?,?,'mute','2999-01-01T00:00:00.000Z')")
  .run(clubId, U[user]);

beforeAll(async () => {
  ['own', 'off', 'off2', 'mem', 'mem2', 'mem3', 'gone', 'out'].forEach((n) => addUser(n));
  addUser('boss', 'admin');
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await call('POST', '/api/clubs', 'own', { name: 'Edit Club', joinPolicy: 'invite' });
  clubId = db.prepare('SELECT id FROM clubs WHERE slug = ?').get(SLUG).id;
  for (const u of ['off', 'off2', 'mem', 'mem2', 'mem3', 'gone']) {
    await call('POST', `/api/clubs/${SLUG}/join`, u);
    await call('POST', `/api/clubs/${SLUG}/members/${u}/approve`, 'own');
  }
  for (const u of ['off', 'off2']) await call('PUT', `/api/clubs/${SLUG}/members/${u}/role`, 'own', { role: 'officer' });
});

afterAll(async () => { await new Promise((r) => server.close(r)); });

beforeEach(async () => {
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM club_messages').run();
  db.prepare('DELETE FROM club_reports').run();
  db.prepare('DELETE FROM club_sanctions').run();
  db.prepare('UPDATE clubs SET locked = 0, announcement = \'\' WHERE id = ?').run(clubId);
  ClubService._resetFanOut();
  await call('PUT', `/api/clubs/${SLUG}`, 'own', { chatSettings: { ...chat.CHAT_DEFAULTS } });
});

describe('PATCH /messages/:id — refusals', () => {
  it('another member\'s message → 403 CLUB_FORBIDDEN (even for the owner)', async () => {
    const id = await say('mem', 'hello');
    expect((await edit('mem2', id, 'hijack')).body.code).toBe('CLUB_FORBIDDEN');
    expect((await edit('own', id, 'hijack')).body.code).toBe('CLUB_FORBIDDEN');
    expect(row(id).body).toBe('hello');
  });

  it.each([
    ['pin', '/ghim Họp tối nay', 'own'],
    ['poll', '/binhchon Mấy giờ? | 20h | 21h', 'mem'],
  ])('a %s row → 400 CLUB_EDIT_KIND', async (kind, text, as) => {
    const id = await say(as, text);
    expect(row(id).kind).toBe(kind);
    const r = await edit(as, id, 'changed');
    expect([r.status, r.body.code]).toEqual([400, 'CLUB_EDIT_KIND']);
  });

  it('muted author → 403 CLUB_MUTED, body unchanged', async () => {
    const id = await say('mem', 'hello');
    mute('mem');
    expect((await edit('mem', id, 'sneaky')).body.code).toBe('CLUB_MUTED');
    expect(row(id).body).toBe('hello');
  });

  it('author who left → 403 CLUB_CHAT_MEMBERS_ONLY for edit and delete', async () => {
    const id = await say('gone', 'bye soon');
    await call('POST', `/api/clubs/${SLUG}/leave`, 'gone');
    expect((await edit('gone', id, 'x')).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
    expect((await del('gone', id)).body.code).toBe('CLUB_CHAT_MEMBERS_ONLY');
    expect(row(id)).toBeTruthy();
  });

  it('locked club → 403 CLUB_LOCKED', async () => {
    const id = await say('mem', 'hello');
    db.prepare('UPDATE clubs SET locked = 1 WHERE id = ?').run(clubId);
    expect((await edit('mem', id, 'x')).body.code).toBe('CLUB_LOCKED');
    expect((await del('mem', id)).body.code).toBe('CLUB_LOCKED');
  });

  it.each([[''], ['   '], [null]])('empty text %j → 400 CLUB_MESSAGE_EMPTY', async (text) => {
    const id = await say('mem', 'hello');
    const r = await edit('mem', id, text);
    expect([r.status, r.body.code]).toEqual([400, 'CLUB_MESSAGE_EMPTY']);
  });

  it('unknown id / another club\'s id → 404', async () => {
    expect((await edit('mem', 999999, 'x')).status).toBe(404);
  });

  it('rate limit applies to edits', async () => {
    const id = await say('mem', 'hello');
    DmText.forget(U.mem);
    let last;
    for (let i = 0; i < 6; i++) last = await call('PATCH', `/api/clubs/${SLUG}/messages/${id}`, 'mem', { text: `v${i}` });
    expect([last.status, last.body.code]).toEqual([429, 'CLUB_CHAT_RATE_LIMITED']);
  });

  it('a command-looking edit is stored as plain text, with no command side effect', async () => {
    const id = await say('own', 'hello');
    expect((await edit('own', id, '/ghim Thông báo mới')).status).toBe(200);
    expect((await edit('own', id, '/duoi @mem')).status).toBe(200);
    expect(row(id)).toMatchObject({ kind: 'text', body: '/duoi @mem' });
    const club = db.prepare('SELECT announcement FROM clubs WHERE id = ?').get(clubId);
    expect(club.announcement).toBe('');
    expect(db.prepare('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?').get(clubId, U.mem).role).toBe('member');
    expect(db.prepare('SELECT COUNT(*) n FROM club_polls').get().n).toBe(0);
  });
});

describe('PATCH /messages/:id — success', () => {
  it('stores the cleaned body, stamps edited_at/edit_rev, keeps history, no rev in the response', async () => {
    const id = await say('mem', 'first');
    const before = rev();
    const r = await edit('mem', id, '  second  ');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id, text: 'second', editedAt: expect.any(String) });
    expect(row(id)).toMatchObject({ body: 'second', edit_rev: before + 1, edited_at: r.body.editedAt });
    expect(rev()).toBe(before + 1);
    expect(db.prepare('SELECT body FROM club_message_edits WHERE message_id = ?').all(id)).toEqual([{ body: 'first' }]);
    const listed = (await get('mem2')).body.messages.find((m) => m.id === id);
    expect(listed).toMatchObject({ text: 'second', editedAt: r.body.editedAt });
  });

  it('an unchanged cleaned body is a no-op (no rev, no history)', async () => {
    const id = await say('mem', 'same');
    const before = rev();
    const r = await edit('mem', id, '  same ');
    expect(r.body).toMatchObject({ id, text: 'same', unchanged: true });
    expect(rev()).toBe(before);
    expect(row(id).edited_at).toBeNull();
    expect(db.prepare('SELECT COUNT(*) n FROM club_message_edits').get().n).toBe(0);
  });

  it('history keeps the last 5 prior bodies; deleting the message cascades them', async () => {
    const id = await say('mem', 'v0');
    for (let i = 1; i <= 7; i++) expect((await edit('mem', id, `v${i}`)).status).toBe(200);
    expect(db.prepare('SELECT body FROM club_message_edits WHERE message_id = ? ORDER BY rowid').all(id).map((r) => r.body))
      .toEqual(['v2', 'v3', 'v4', 'v5', 'v6']);
    expect((await del('mem', id)).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) n FROM club_message_edits').get().n).toBe(0);
  });
});

describe('mentions added by an edit', () => {
  it('a newly added name pings once per message; remove + re-add does not ping again', async () => {
    const id = await say('mem', 'hi');
    await edit('mem', id, 'hi @mem2');
    expect(pings('mem2')).toHaveLength(1);
    await edit('mem', id, 'hi');
    await edit('mem', id, 'hi again @mem2');
    expect(pings('mem2')).toHaveLength(1);
    // Highlight = what was delivered: re-added name stays highlighted for mem2.
    expect((await get('mem2')).body.messages.find((m) => m.id === id).mentioned).toEqual(['mem2']);
  });

  it('a name already pinged by the post is not pinged again; a removed name loses its highlight', async () => {
    const id = await say('mem', 'hi @mem2');
    expect(pings('mem2')).toHaveLength(1);
    db.prepare('DELETE FROM notifications').run();
    await edit('mem', id, 'hi @mem2 @mem3');
    expect(pings('mem2')).toHaveLength(0);
    expect(pings('mem3')).toHaveLength(1);
    await edit('mem', id, 'hi @mem3');
    const list = (await get('mem2')).body.messages;
    expect(list.find((m) => m.id === id).mentioned).toEqual([]);
  });

  it('group words added by an edit never notify, even from staff', async () => {
    const id = await say('own', 'hello');
    await edit('own', id, 'hello @all @tatca @officers');
    expect(db.prepare('SELECT COUNT(*) n FROM notifications').get().n).toBe(0);
  });

  it('a group word delivered by the post stays highlighted while present, drops when removed', async () => {
    await call('PUT', `/api/clubs/${SLUG}`, 'own', { chatSettings: { ...chat.CHAT_DEFAULTS, notifyAll: true } });
    const id = await say('own', '@all họp');
    expect((await get('mem')).body.messages.find((m) => m.id === id).mentioned).toEqual(['all', 'tatca']);
    await edit('own', id, '@all họp lúc 8h');
    expect((await get('mem')).body.messages.find((m) => m.id === id).mentioned).toEqual(['all', 'tatca']);
    await edit('own', id, 'họp lúc 8h');
    expect((await get('mem')).body.messages.find((m) => m.id === id).mentioned).toEqual([]);
  });

  it('edits respect notifyMention and the mute/ban exclusion; the author never pings themself', async () => {
    const id = await say('mem', 'hi');
    mute('mem3');
    await edit('mem', id, 'hi @mem3 @mem');
    expect(pings('mem3')).toHaveLength(0);
    expect(pings('mem')).toHaveLength(0);
    await call('PUT', `/api/clubs/${SLUG}`, 'own', { chatSettings: { ...chat.CHAT_DEFAULTS, notifyMention: false } });
    await edit('mem', id, 'hi @mem2');
    expect(pings('mem2')).toHaveLength(0);
  });
});

describe('GET /messages refresh path', () => {
  it('always returns rev; with &rev=n returns edited visible rows with edit_rev > n, as the viewer sees them', async () => {
    const a = await say('mem', 'a');
    const b = await say('mem2', 'b');
    const first = (await get('mem3')).body;
    expect(first.rev).toBe(rev());
    expect(first.edited).toBeUndefined();
    await edit('mem', a, 'a2 @mem3');
    const r = (await get('mem3', `?after=${b}&visible=${a},${b}&rev=${first.rev}`)).body;
    expect(r.rev).toBe(first.rev + 1);
    expect(r.edited).toEqual([{ id: a, text: 'a2 @mem3', editedAt: expect.any(String), mentioned: ['mem3'] }]);
    // Caught up: nothing more.
    expect((await get('mem3', `?after=${b}&visible=${a},${b}&rev=${r.rev}`)).body.edited).toEqual([]);
  });

  it('never leaks another club\'s edited rows through visible ids', async () => {
    await call('POST', '/api/clubs', 'out', { name: 'Other Edit' });
    DmText.forget(U.out);
    const { id } = (await call('POST', '/api/clubs/other-edit/messages', 'out', { text: 'secret' })).body;
    DmText.forget(U.out);
    expect((await call('PATCH', `/api/clubs/other-edit/messages/${id}`, 'out', { text: 'secret2' })).status).toBe(200);
    expect((await get('mem', `?visible=${id}&rev=0`)).body.edited).toEqual([]);
    expect((await edit('mem', id, 'x')).status).toBe(404); // not in this club
  });

  it('rev stays monotonic after the edited row is trimmed or deleted', async () => {
    const a = await say('mem', 'a');
    await edit('mem', a, 'a2');
    const r1 = rev();
    // Trim the edited row away (CHAT_KEEP = 200).
    const ins = db.prepare('INSERT INTO club_messages (club_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 205; i++) ins.run(clubId, U.mem2, `bulk ${i}`, NOW);
    const b = await say('mem2', 'trigger trim');
    expect(row(a)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) n FROM club_message_edits WHERE message_id = ?').get(a).n).toBe(0); // trim cascades
    await edit('mem2', b, 'b2');
    expect(rev()).toBe(r1 + 1);
    await del('mem2', b);
    const c = await say('mem2', 'c');
    await edit('mem2', c, 'c2');
    expect(rev()).toBe(r1 + 2);
    // A tab at r1 still sees the later edit.
    expect((await get('mem', `?visible=${c}&rev=${r1}`)).body.edited.map((e) => e.id)).toEqual([c]);
  });
});

describe('DELETE /messages/:id (Q1)', () => {
  it('the author deletes their own message, even while muted, unlogged', async () => {
    const id = await say('mem', 'oops');
    mute('mem');
    expect((await del('mem', id)).status).toBe(200);
    expect(row(id)).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) n FROM club_log WHERE type = 'delete_message'").get().n).toBe(0);
  });

  it('the author deletes a poll row: votes cascade', async () => {
    const id = await say('mem', '/binhchon Mấy giờ? | 20h | 21h');
    await call('POST', `/api/clubs/${SLUG}/messages/${id}/vote`, 'mem2', { option: 0 });
    expect((await del('mem', id)).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) n FROM club_polls').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM club_poll_votes').get().n).toBe(0);
  });

  it('an officer cannot delete the owner\'s or another officer\'s message; a member cannot delete others\'', async () => {
    const ownerMsg = await say('own', 'owner');
    const offMsg = await say('off2', 'officer');
    const memMsg = await say('mem2', 'member');
    expect((await del('off', ownerMsg)).body.code).toBe('CLUB_FORBIDDEN');
    expect((await del('off', offMsg)).body.code).toBe('CLUB_FORBIDDEN');
    expect((await del('mem', memMsg)).body.code).toBe('CLUB_FORBIDDEN');
    expect([row(ownerMsg), row(offMsg), row(memMsg)].every(Boolean)).toBe(true);
  });

  it('staff who outrank the sender delete it, logged as delete_message', async () => {
    const memMsg = await say('mem2', 'member');
    const offMsg = await say('off2', 'officer');
    expect((await del('off', memMsg)).status).toBe(200);
    expect((await del('own', offMsg)).status).toBe(200);
    const logs = db.prepare("SELECT actor_id, target_id FROM club_log WHERE type = 'delete_message' ORDER BY id").all();
    expect(logs.slice(-2)).toEqual([{ actor_id: U.off, target_id: U.mem2 }, { actor_id: U.own, target_id: U.off2 }]);
  });

  it('the author deleting the pin row clears the announcement', async () => {
    const id = await say('own', '/ghim Họp tối nay');
    expect(db.prepare('SELECT announcement FROM clubs WHERE id = ?').get(clubId).announcement).toBe('Họp tối nay');
    expect((await del('own', id)).status).toBe(200);
    expect(db.prepare('SELECT announcement FROM clubs WHERE id = ?').get(clubId).announcement).toBe('');
  });

  it('an open tab sees the delete through removed', async () => {
    const a = await say('mem', 'a');
    const b = await say('mem', 'b');
    await del('mem', a);
    expect((await get('mem2', `?after=${b}&visible=${a},${b}`)).body.removed).toEqual([a]);
  });
});

describe('reports: prior and later', () => {
  const report = (as, id) => call('POST', `/api/clubs/${SLUG}/messages/${id}/report`, as, { reason: 'spam' });
  const reports = () => db.prepare('SELECT * FROM club_reports ORDER BY id').all();

  it('a report snapshots the prior bodies an edit replaced before anyone reported', async () => {
    const id = await say('mem', 'abuse');
    await edit('mem', id, 'innocent');
    expect((await report('mem2', id)).status).toBe(200);
    const [r] = reports();
    expect(r.excerpt).toBe('innocent');
    expect(JSON.parse(r.prior)).toEqual([{ body: 'abuse', editedAt: expect.any(String) }]);
  });

  it('an unedited message reports with prior = null', async () => {
    const id = await say('mem', 'plain');
    await report('mem2', id);
    expect(reports()[0].prior).toBeNull();
  });

  it('an edit after a report sets later = edited; a delete sets later = deleted; the admin queue shows both', async () => {
    const id = await say('mem', 'bad');
    await report('mem2', id);
    await edit('mem', id, 'good');
    expect(JSON.parse(reports()[0].later)).toEqual({ action: 'edited', body: 'good', at: expect.any(String) });
    const id2 = await say('mem', 'worse');
    await report('mem3', id2);
    await del('mem', id2);
    expect(JSON.parse(reports()[1].later)).toEqual({ action: 'deleted', at: expect.any(String) });
    const queue = ClubOversight.directory(U.boss, {}).reports;
    expect(queue.map((r) => [r.excerpt, r.prior, r.later?.action])).toEqual([['bad', null, 'edited'], ['worse', null, 'deleted']]);
  });
});
