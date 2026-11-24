'use strict';

/**
 * club-calendar.test.js — B450: /lich (list + staff create in Vietnam time), RSVP "tham gia", and the 30-min reminder
 * sweep (RSVPs only, once, restart-safe, skips started events and clubs with remindEvents off). Real SQL on an
 * in-memory DB (same harness as club-polls.test.js).
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

const express = require('express');
const http = require('http');
const database = require('../db/database');
const clubsRouter = require('../routes/clubs');
const ClubService = require('../managers/ClubService');
const DmText = require('../managers/DmText');
const chat = require('../managers/ClubChatCommands');

// 2026-11-24 15:00 in Vietnam (UTC+7).
const T0 = Date.parse('2026-11-24T08:00:00.000Z');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const db = database.db;
const U = {};
const SLUG = 'cal-club';
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

const say = (as, text) => { DmText.forget(U[as]); return call('POST', `/api/clubs/${SLUG}/messages`, as, { text }); };
const setChat = (as, chatSettings) => call('PUT', `/api/clubs/${SLUG}`, as, { chatSettings });
const rsvp = (as, id, going = true) => call(going ? 'POST' : 'DELETE', `/api/clubs/${SLUG}/events/${id}/rsvp`, as);
const notes = (user) => db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'club_event'").all(U[user]);
const event = async (inMs, title = 'Giao hữu', as = 'own') => {
  const r = await call('POST', `/api/clubs/${SLUG}/events`, as, { title, startsAt: new Date(Date.now() + inMs).toISOString() });
  expect(r.status).toBe(201);
  return r.body.id;
};
const page = (as) => call('GET', `/api/clubs/${SLUG}`, as);

beforeAll(async () => {
  jest.setSystemTime(T0);
  ['own', 'off', 'mem', 'mem2', 'pend', 'out'].forEach(addUser);
  const app = express();
  app.use('/api/clubs', clubsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await call('POST', '/api/clubs', 'own', { name: 'Cal Club', joinPolicy: 'invite' });
  for (const u of ['off', 'mem', 'mem2']) {
    await call('POST', `/api/clubs/${SLUG}/join`, u);
    await call('POST', `/api/clubs/${SLUG}/members/${u}/approve`, 'own');
  }
  await call('PUT', `/api/clubs/${SLUG}/members/off/role`, 'own', { role: 'officer' });
  await call('POST', `/api/clubs/${SLUG}/join`, 'pend');
});

afterAll(async () => { await new Promise((r) => server.close(r)); });

beforeEach(async () => {
  jest.setSystemTime(T0);
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM club_events').run();
  await setChat('own', { ...chat.CHAT_DEFAULTS });
});

describe('parseEventArg (pure, Vietnam time)', () => {
  it('dd/mm HH:MM Title → that time at UTC+7, this year', () => {
    expect(chat.parseEventArg('25/12 20:00 Giao hữu cuối năm', T0))
      .toEqual({ startsAt: '2026-12-25T13:00:00.000Z', title: 'Giao hữu cuối năm' });
  });
  it.each([
    ['1/12 9h05 A', '2026-12-01T02:05:00.000Z'],
    ['24/11 15:01 A', '2026-11-24T08:01:00.000Z'],     // same day, one minute ahead
    ['25/11 0:30 A', '2026-11-24T17:30:00.000Z'],      // VN midnight is 17:00 UTC the day before
    ['5/1 20:00 A', '2027-01-05T13:00:00.000Z'],       // earlier date → next year
    ['23/11 20:00 A', '2027-11-23T13:00:00.000Z'],
    ['25/12/2027 20:00 A', '2027-12-25T13:00:00.000Z'],
  ])('%j → %s', (arg, iso) => expect(chat.parseEventArg(arg, T0).startsAt).toBe(iso));
  it.each([
    ['', 'usage'],
    ['Giao hữu', 'usage'],
    ['25/12 20:00', 'usage'],      // no title
    ['25/12 20:00   ', 'usage'],
    ['20:00 Giao hữu', 'usage'],
    ['31/02 20:00 A', 'date'],
    ['25/13 20:00 A', 'date'],
    ['25/12 24:00 A', 'date'],
    ['25/12 20:60 A', 'date'],
    ['24/11 15:00 A', 'past'],     // exactly now
    ['24/11 09:00 A', 'past'],     // earlier today is a mistake, not next year
    ['1/1/2026 20:00 A', 'past'],  // explicit year in the past
  ])('%j → %s', (arg, error) => expect(chat.parseEventArg(arg, T0)).toEqual({ error }));
  it('29/02 rolls to the next leap-valid year only when it exists', () => {
    expect(chat.parseEventArg('29/02 20:00 A', T0)).toEqual({ error: 'date' }); // 2026 and 2027 are not leap
    expect(chat.parseEventArg('29/02/2028 20:00 A', T0).startsAt).toBe('2028-02-29T13:00:00.000Z');
  });
});

describe('/lich', () => {
  it('no arg: any member gets the upcoming list, nothing is stored in chat', async () => {
    const id = await event(2 * HOUR);
    const r = await say('mem', '/lich');
    expect(r.status).toBe(201);
    expect(r.body.kind).toBe('calendar');
    expect(r.body.events).toEqual([expect.objectContaining({ id, title: 'Giao hữu', going: 0, mine: false })]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM club_messages').get().n).toBe(0);
  });

  it('staff create in Vietnam time; the event appears in the club page', async () => {
    const r = await say('off', '/lich 25/12 20:00 Giải cuối năm');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'event', startsAt: '2026-12-25T13:00:00.000Z' });
    const ev = (await page('mem')).body.events;
    expect(ev).toEqual([expect.objectContaining({ id: r.body.eventId, title: 'Giải cuối năm', startsAt: '2026-12-25T13:00:00.000Z' })]);
  });

  it.each([
    ['mem', '/lich 25/12 20:00 A', 403],
    ['own', '/lich 31/02 20:00 A', 400],
    ['own', '/lich 25/12 A', 400],
    ['own', '/lich 25/12 20:00 ' + 'x'.repeat(61), 400], // createEvent's title cap
    ['pend', '/lich', 403],
    ['out', '/lich', 403],
  ])('%s %j → %i', async (as, text, status) => {
    expect((await say(as, text)).status).toBe(status);
    expect(db.prepare('SELECT COUNT(*) AS n FROM club_events').get().n).toBe(0);
  });

  it('cmdCalendar off refuses /lich', async () => {
    await setChat('own', { cmdCalendar: false });
    const r = await say('own', '/lich');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CLUB_COMMAND_DISABLED');
  });
});

describe('RSVP', () => {
  it('join, idempotent, count, mine; take back', async () => {
    const id = await event(2 * HOUR);
    expect((await rsvp('mem', id)).body).toMatchObject({ id, going: 1, mine: true });
    expect((await rsvp('mem', id)).body).toMatchObject({ going: 1, mine: true });
    expect((await rsvp('mem2', id)).body).toMatchObject({ going: 2, mine: true });
    expect((await page('own')).body.events[0]).toMatchObject({ going: 2, mine: false });
    expect((await page('mem')).body.events[0]).toMatchObject({ going: 2, mine: true });
    expect((await rsvp('mem', id, false)).body).toMatchObject({ going: 1, mine: false });
  });

  it.each([['pend', 403], ['out', 403], [null, 401]])('%s → %i', async (as, status) => {
    const id = await event(2 * HOUR);
    expect((await rsvp(as, id)).status).toBe(status);
  });

  it('unknown or started event → 404', async () => {
    expect((await rsvp('mem', 'nope')).status).toBe(404);
    const id = await event(10 * MIN);
    jest.setSystemTime(T0 + 11 * MIN);
    expect((await rsvp('mem', id)).status).toBe(404);
  });

  it('a member who left is no longer counted', async () => {
    const id = await event(2 * HOUR);
    await rsvp('mem2', id);
    db.prepare('DELETE FROM club_members WHERE user_id = ?').run(U.mem2);
    expect((await page('own')).body.events[0].going).toBe(0);
    db.prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) SELECT club_id, ?, 'member', ? FROM club_members WHERE user_id = ?")
      .run(U.mem2, new Date(T0).toISOString(), U.own);
  });

  it('deleting the event cascades its RSVPs', async () => {
    const id = await event(2 * HOUR);
    await rsvp('mem', id);
    expect((await call('DELETE', `/api/clubs/${SLUG}/events/${id}`, 'own')).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM club_event_rsvps').get().n).toBe(0);
  });
});

describe('reminder sweep', () => {
  it('30 min before: RSVPs only, once, payload links the event', async () => {
    const id = await event(45 * MIN, 'Giao hữu tối');
    await rsvp('mem', id);
    await rsvp('off', id);
    expect(ClubService.remindDueEvents(T0)).toBe(0);          // 45 min out: not yet
    expect(ClubService.remindDueEvents(T0 + 15 * MIN)).toBe(2); // exactly 30 min before
    expect(notes('mem')).toHaveLength(1);
    expect(notes('off')).toHaveLength(1);
    expect(notes('mem2')).toHaveLength(0);
    expect(notes('own')).toHaveLength(0);
    expect(JSON.parse(notes('mem')[0].payload)).toEqual({
      club: { slug: SLUG, name: 'Cal Club' },
      event: { id, title: 'Giao hữu tối', startsAt: new Date(T0 + 45 * MIN).toISOString() },
    });
    expect(notes('mem')[0].actor_id).toBeNull();
    expect(ClubService.remindDueEvents(T0 + 16 * MIN)).toBe(0); // claimed: a later (or restarted) sweep sends nothing
    expect(notes('mem')).toHaveLength(1);
  });

  it('two events by the same creator do not erase each other', async () => {
    const a = await event(20 * MIN, 'A');
    const b = await event(25 * MIN, 'B');
    await rsvp('mem', a);
    await rsvp('mem', b);
    expect(ClubService.remindDueEvents(T0)).toBe(2);
    expect(notes('mem').map((n) => JSON.parse(n.payload).event.title).sort()).toEqual(['A', 'B']);
  });

  it('already started (e.g. server was down) → never reminded late', async () => {
    const id = await event(10 * MIN);
    await rsvp('mem', id);
    expect(ClubService.remindDueEvents(T0 + 10 * MIN)).toBe(0);
    expect(ClubService.remindDueEvents(T0 + 20 * MIN)).toBe(0);
    expect(notes('mem')).toHaveLength(0);
  });

  it('remindEvents off: skipped without claiming, so turning it back on still reminds', async () => {
    const id = await event(20 * MIN);
    await rsvp('mem', id);
    await setChat('own', { remindEvents: false });
    expect(ClubService.remindDueEvents(T0)).toBe(0);
    await setChat('own', { remindEvents: true });
    expect(ClubService.remindDueEvents(T0 + MIN)).toBe(1);
  });

  it('RSVP from a member who since left (or is pending) is not notified', async () => {
    const id = await event(20 * MIN);
    db.prepare("INSERT INTO club_event_rsvps (event_id, user_id, created_at) VALUES (?, ?, ?)").run(id, U.pend, new Date(T0).toISOString());
    db.prepare("INSERT INTO club_event_rsvps (event_id, user_id, created_at) VALUES (?, ?, ?)").run(id, U.out, new Date(T0).toISOString());
    expect(ClubService.remindDueEvents(T0)).toBe(0);
  });

  it('no RSVPs: the event is still claimed (one pass per event)', async () => {
    const id = await event(20 * MIN);
    ClubService.remindDueEvents(T0);
    expect(db.prepare('SELECT reminded_at FROM club_events WHERE id = ?').get(id).reminded_at).toBe(new Date(T0).toISOString());
  });

  it('defaults: cmdCalendar and remindEvents on', () => {
    expect(chat.CHAT_DEFAULTS).toMatchObject({ cmdCalendar: true, remindEvents: true });
    expect(chat.readSettings(null)).toMatchObject({ cmdCalendar: true, remindEvents: true });
  });
});
