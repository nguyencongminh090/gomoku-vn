/**
 * B480 — sự-kiện calendar: month grid (Monday first, APG keys), agenda, RSVP, staff delete and the "Tạo sự kiện" sheet.
 * Runs in America/New_York so a value read in the viewer's zone (the old `new Date(<datetime-local>)` bug) fails here.
 * "Now" = Thu 26/11/2026 09:00 in Vietnam, which is still Wed 25/11 21:00 in New York.
 *
 * @jest-environment ./client/tests/env/jsdom-new-york.js
 * @jest-environment-options {"url": "http://localhost/c/caro#ch=events"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
const T0 = Date.parse('2026-11-26T02:00:00.000Z');

const body = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
const fail = (status, b) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(b) });
const $ = (id) => document.getElementById(id);

const LB = [
  { rank: 1, username: 'own', displayName: 'Own', role: 'owner', rating: 1600, games: 30 },
  { rank: 2, username: 'mem', displayName: 'Mem', role: 'member', rating: null, games: 0 },
];
const club = (role, events = []) => ({
  slug: 'caro', name: 'Caro', description: '', joinPolicy: 'open', members: 2, avgRating: null, rank: null, myRole: role,
  category: 'freestyle', events, tournaments: [], lastMessageId: 0,
  chat: { cmdPoll: true, cmdCalendar: true, cmdChallenge: true, cmdPin: true },
  leaderboard: LB.map((x) => ({ ...x, mine: role && x.username === (role === 'member' ? 'mem' : 'own') })),
});

// VN times: 28/11 14:00 + 20:00 (New York: 02:00 and 08:00 on the 28th), 21/11 20:00 (past),
// 30/11 01:00 (New York: still Sunday 29/11 13:00), 5/12 19:30.
const NOV = [
  { id: 'past', title: 'Giao hữu cuối tuần', startsAt: '2026-11-21T13:00:00.000Z', kind: 'event', going: 9, mine: false },
  { id: 'a', title: 'Chữa ván cùng Đức Anh', startsAt: '2026-11-28T07:00:00.000Z', kind: 'event', going: 3, mine: false },
  { id: 'b', title: '<b>Giao hữu nội bộ</b>', startsAt: '2026-11-28T13:00:00.000Z', kind: 'event', going: 12, mine: true },
  { id: 'late', title: 'Cờ khuya', startsAt: '2026-11-29T18:00:00.000Z', kind: 'event', going: 0, mine: false },
];
const DEC = [{ id: 'd', title: 'Giải tháng 12', startsAt: '2026-12-05T12:30:00.000Z', kind: 'event', going: 16, mine: false }];
const MONTHS = { '2026-11': NOV, '2026-12': DEC };

let months;
let api; // (url, opts) → response override, or undefined for the default router
function router(c) {
  return jest.fn((url, opts = {}) => {
    const u = String(url);
    const hit = api && api(u, opts);
    if (hit) return hit;
    const m = /\/events\?month=(\d{4}-\d{2})$/.exec(u);
    if (m) return ok({ month: m[1], events: months[m[1]] || [] });
    if (opts.method) return ok({});
    return ok(c);
  });
}

const bound = [];
for (const target of [document, window]) {
  const add = target.addEventListener.bind(target);
  target.addEventListener = (type, fn, opts) => { bound.push([target, type, fn]); return add(type, fn, opts); };
}

async function boot(role, { upcoming = [], hook = null } = {}) {
  for (const [target, type, fn] of bound.splice(0)) target.removeEventListener(type, fn);
  jest.resetModules();
  jest.setSystemTime(T0);
  months = JSON.parse(JSON.stringify(MONTHS));
  api = hook;
  location.hash = '#ch=events';
  document.body.innerHTML = body('club.html');
  const dlg = $('cb-event-editor');
  dlg.showModal = jest.fn(() => dlg.setAttribute('open', ''));
  dlg.close = jest.fn(() => dlg.removeAttribute('open'));
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.confirm = jest.fn(() => true);
  global.fetch = router(club(role, upcoming));
  window.EscapeUtils = require('../js/escape-utils.js');
  require('../js/platform-shell.js');
  require('../js/club-policy.js'); require('../js/club-kit.js');
  require('../js/club.js');
  const setI = window.setInterval;
  window.setInterval = () => 0; // no chat polling in these tests
  try { document.dispatchEvent(new Event('DOMContentLoaded')); } finally { window.setInterval = setI; }
  await settle();
}

const cell = (date) => document.querySelector(`#cb-cal-days td[data-date="${date}"]`);
const selected = () => [...document.querySelectorAll('#cb-cal-days td[aria-selected="true"]')].map((td) => td.dataset.date);
const tabStops = () => [...document.querySelectorAll('#cb-cal-days td[tabindex="0"]')].map((td) => td.dataset.date);
const rows = () => [...document.querySelectorAll('#cb-events .cb-ev')].map((r) => [r.dataset.event, r.querySelector('.cb-ev__time').textContent]);
const press = (key, extra = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
const monthCalls = () => global.fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/events?month='));

it('runs in New York, where local wall time is not Vietnam time', () => {
  expect(new Date(2026, 10, 28, 20).toISOString()).toBe('2026-11-29T01:00:00.000Z'); // guards the whole file
});

describe('month grid', () => {
  it('Monday first, whole weeks, today = the Vietnam day (26/11, while New York is still on the 25th)', async () => {
    await boot('member');
    expect($('cb-panel-events').hidden).toBe(false);
    expect($('cb-cal-title').textContent).toMatch(/^clubs\.cal_month\{"m":11,"y":2026,/);
    const dates = [...document.querySelectorAll('#cb-cal-days td')].map((td) => td.dataset.date);
    expect(dates).toHaveLength(42); // 1/11/2026 is a Sunday → 6 leading days, 6 weeks
    expect([dates[0], dates[6], dates[41]]).toEqual(['2026-10-26', '2026-11-01', '2026-12-06']);
    expect(cell('2026-11-26').getAttribute('aria-current')).toBe('date');
    expect(document.querySelectorAll('#cb-cal-days [aria-current]')).toHaveLength(1);
    expect(selected()).toEqual(['2026-11-26']);
    expect(tabStops()).toEqual(['2026-11-26']);
    expect(cell('2026-10-26').classList.contains('is-out')).toBe(true);
    expect(cell('2026-11-25').classList.contains('is-past')).toBe(true);
    expect(cell('2026-11-26').classList.contains('is-past')).toBe(false);
    expect(document.querySelectorAll('#cb-cal-wd th')).toHaveLength(1); // t() stub: one label; the real string has 7
  });

  it('asks for the shown month, then dots mark the Vietnam day of each event', async () => {
    await boot('member');
    expect(monthCalls()).toEqual(['/api/clubs/caro/events?month=2026-11']);
    const dots = (d) => cell(d).querySelectorAll('.cb-day__dots i').length;
    expect([dots('2026-11-21'), dots('2026-11-28'), dots('2026-11-29'), dots('2026-11-30')]).toEqual([1, 2, 0, 1]);
    expect(cell('2026-11-28').getAttribute('aria-label')).toContain('clubs.cal_n_events{"n":2}');
  });

  it('before the month arrives the upcoming list fills in; a failed month says so', async () => {
    await boot('member', { upcoming: [NOV[1]], hook: (u) => (u.includes('?month=') ? new Promise(() => {}) : undefined) });
    expect(cell('2026-11-28').querySelectorAll('.cb-day__dots i')).toHaveLength(1);
    expect(document.querySelector('#cb-events .cb-empty').textContent).toBe('clubs.cal_loading');
    cell('2026-11-28').click();
    expect(rows()).toEqual([['a', '14:00GMT+7']]);
    await boot('member');
    api = (u) => (u.includes('?month=2026-12') ? fail(500, {}) : undefined);
    $('cb-cal-next').click();
    await settle();
    expect(document.querySelector('#cb-events .cb-empty').textContent).toBe('clubs.error');
  });

  it('‹ › change month (today in its own month, else the 1st); Hôm nay comes back', async () => {
    await boot('member');
    $('cb-cal-next').click();
    await settle();
    expect($('cb-cal-title').textContent).toMatch(/"m":12,"y":2026/);
    expect(selected()).toEqual(['2026-12-01']);
    expect(monthCalls()).toEqual(['/api/clubs/caro/events?month=2026-11', '/api/clubs/caro/events?month=2026-12']);
    $('cb-cal-prev').click(); $('cb-cal-prev').click();
    expect($('cb-cal-title').textContent).toMatch(/"m":10,"y":2026/);
    $('cb-cal-today').click();
    expect(selected()).toEqual(['2026-11-26']);
  });
});

describe('APG grid keys (one tab stop that follows the selection)', () => {
  it('arrows, Home/End, PageUp/PageDown (Shift = a year) move across months', async () => {
    await boot('member');
    cell('2026-11-26').focus();
    const step = (key, extra) => { press(key, extra); return [document.activeElement.dataset.date, selected()[0], tabStops().length]; };
    const title = $('cb-cal-title').firstChild; // aria-live: a move inside the month must not re-announce it
    press('ArrowRight'); press('ArrowLeft');
    expect($('cb-cal-title').firstChild).toBe(title);
    expect(step('ArrowRight')).toEqual(['2026-11-27', '2026-11-27', 1]);
    expect(step('ArrowLeft')).toEqual(['2026-11-26', '2026-11-26', 1]);
    expect(step('ArrowUp')).toEqual(['2026-11-19', '2026-11-19', 1]);
    expect(step('ArrowDown')).toEqual(['2026-11-26', '2026-11-26', 1]);
    expect(step('Home')).toEqual(['2026-11-23', '2026-11-23', 1]); // Monday
    expect(step('End')).toEqual(['2026-11-29', '2026-11-29', 1]);  // Sunday
    expect(step('ArrowDown')).toEqual(['2026-12-06', '2026-12-06', 1]); // into December
    expect($('cb-cal-title').textContent).toMatch(/"m":12/);
    expect($('cb-cal-title').firstChild).not.toBe(title);
    expect(step('PageUp')).toEqual(['2026-11-06', '2026-11-06', 1]);
    expect(step('PageDown', { shiftKey: true })).toEqual(['2027-11-06', '2027-11-06', 1]);
    expect(step('PageUp')).toEqual(['2027-10-06', '2027-10-06', 1]);
    const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('31/1 PageDown lands on the last day of February', async () => {
    jest.setSystemTime(T0);
    await boot('member');
    cell('2026-11-26').focus();
    press('PageDown', { shiftKey: true }); // 26/11/2027
    for (let i = 0; i < 2; i++) press('PageDown'); // 26/1/2028
    for (let i = 0; i < 5; i++) press('ArrowRight'); // 31/1/2028
    press('PageDown');
    expect(selected()).toEqual(['2028-02-29']);
  });

  it('a month answer arriving while a cell has focus keeps focus on the selected cell', async () => {
    let answer;
    await boot('member');
    api = (u) => (u.includes('2026-12') ? new Promise((r) => { answer = r; }) : undefined);
    cell('2026-11-26').focus();
    press('PageDown');
    answer({ ok: true, status: 200, json: () => Promise.resolve({ events: DEC }) });
    await settle();
    expect(cell('2026-12-05').querySelectorAll('.cb-day__dots i')).toHaveLength(1);
    expect(document.activeElement).toBe(cell('2026-12-26'));
  });
});

describe('agenda', () => {
  it('lists the selected day in Vietnam time with GMT+7, titles as text, RSVP state', async () => {
    await boot('member');
    cell('2026-11-28').click();
    expect(document.activeElement).toBe(cell('2026-11-28'));
    expect(rows()).toEqual([['a', '14:00GMT+7'], ['b', '20:00GMT+7']]);
    const b = document.querySelector('[data-event="b"]');
    expect(b.querySelector('.cb-ev__t').textContent).toBe('<b>Giao hữu nội bộ</b>');
    expect(b.querySelector('.cb-ev__t b')).toBeNull();
    expect(b.querySelector('.cb-ev__m').textContent).toBe('clubs.event_going_n{"n":12}');
    expect(b.querySelector('button').getAttribute('aria-pressed')).toBe('true');
    expect(b.querySelector('button').textContent).toBe('clubs.event_going');
    expect(document.querySelectorAll('#cb-events [aria-label="clubs.delete_event"]')).toHaveLength(0); // members: no delete
    cell('2026-11-30').click();
    expect(rows()).toEqual([['late', '01:00GMT+7']]);
    expect(document.querySelector('[data-event="late"] .cb-ev__m').textContent).toBe('clubs.event_going_none');
    cell('2026-11-29').click();
    expect(document.querySelector('#cb-events .cb-empty').textContent).toBe('clubs.cal_empty_day');
  });

  it('a past event says Đã diễn ra and offers no RSVP', async () => {
    await boot('member');
    cell('2026-11-21').click();
    const row = document.querySelector('[data-event="past"]');
    expect(row.classList.contains('is-past')).toBe(true);
    expect(row.querySelector('.cl-count').textContent).toBe('clubs.event_past');
    expect(row.querySelector('button')).toBeNull();
  });

  it('visitors see events without RSVP or Tạo sự kiện', async () => {
    await boot(null);
    cell('2026-11-28').click();
    expect(rows()).toHaveLength(2);
    expect(document.querySelectorAll('#cb-events button')).toHaveLength(0);
    expect($('cb-event-new').hidden).toBe(true);
  });

  it('Tham gia posts the RSVP and re-renders the row from the reply; again takes it back', async () => {
    await boot('member');
    cell('2026-11-28').click();
    api = (u, o) => (o.method ? ok({ id: 'a', going: 4, mine: true }) : undefined);
    document.querySelector('[data-event="a"] button').click();
    await settle();
    const call = global.fetch.mock.calls.find(([, o]) => o && o.method);
    expect([call[0], call[1].method]).toEqual(['/api/clubs/caro/events/a/rsvp', 'POST']);
    const btn = document.querySelector('[data-event="a"] button');
    expect([btn.textContent, btn.getAttribute('aria-pressed'), document.activeElement === btn]).toEqual(['clubs.event_going', 'true', true]);
    expect(document.querySelector('[data-event="a"] .cb-ev__m').textContent).toBe('clubs.event_going_n{"n":4}');
    cell('2026-11-27').click(); cell('2026-11-28').click(); // the month cache kept the reply
    expect(document.querySelector('[data-event="a"] button').getAttribute('aria-pressed')).toBe('true');
    global.fetch.mockClear();
    api = (u, o) => (o.method ? ok({ id: 'a', going: 3, mine: false }) : undefined);
    document.querySelector('[data-event="a"] button').click();
    await settle();
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(document.querySelector('[data-event="a"] button').textContent).toBe('clubs.event_join');
  });

  it('a refused RSVP keeps the row and re-enables the button', async () => {
    await boot('member');
    cell('2026-11-28').click();
    api = (u, o) => (o.method ? fail(404, { error: 'Không tìm thấy sự kiện.' }) : undefined);
    const btn = document.querySelector('[data-event="a"] button');
    btn.click();
    await settle();
    expect(document.querySelector('[data-event="a"] button')).toBe(btn);
    expect(btn.disabled).toBe(false);
    expect($('cb-msg').textContent).not.toBe('');
  });

  it('staff delete sends DELETE /events/:id after confirm, then reloads and refetches the month', async () => {
    await boot('officer');
    cell('2026-11-28').click();
    global.fetch.mockClear();
    document.querySelector('[data-event="a"] [aria-label="clubs.delete_event"]').click();
    await settle();
    const [url, opts] = global.fetch.mock.calls[0];
    expect([url, opts.method]).toEqual(['/api/clubs/caro/events/a', 'DELETE']);
    expect(window.confirm).toHaveBeenCalledWith('clubs.confirm_delete_event');
    expect(monthCalls()).toEqual(['/api/clubs/caro/events?month=2026-11']);
    expect(selected()).toEqual(['2026-11-28']); // the reload keeps the day
  });
});

describe('Tạo sự kiện sheet', () => {
  const open = async (role = 'owner') => { await boot(role); $('cb-event-new').click(); };
  const chips = (id) => [...$(id).children].map((b) => [b.textContent, b.dataset.date || b.dataset.time, b.getAttribute('aria-pressed')]);
  const submit = async () => { $('cb-event-form').onsubmit(new Event('submit', { cancelable: true })); await settle(); };
  const posts = () => global.fetch.mock.calls.filter(([, o]) => o && o.method === 'POST');

  it('staff only; opens on the selected day at 20:00 with Vietnam-day chips', async () => {
    await open();
    expect($('cb-event-new').hidden).toBe(false);
    expect($('cb-event-editor').showModal).toHaveBeenCalled();
    expect(document.activeElement).toBe($('cb-event-title'));
    expect(chips('cb-event-days')).toEqual([
      ['clubs.event_chip_today', '2026-11-26', 'true'], ['clubs.event_chip_sat', '2026-11-28', 'false'], ['clubs.event_chip_sun', '2026-11-29', 'false'],
    ]);
    expect(chips('cb-event-times').map((c) => c[1])).toEqual(['19:00', '19:30', '20:00', '21:00']);
    expect(chips('cb-event-times')[2][2]).toBe('true');
    expect([$('cb-event-date').value, $('cb-event-date').min, $('cb-event-time').value]).toEqual(['2026-11-26', '2026-11-26', '20:00']);
    await boot('member');
    expect($('cb-event-new').hidden).toBe(true);
  });

  it('the selected future day prefills the date; a past one falls back to today', async () => {
    await boot('owner');
    cell('2026-12-01').click();
    $('cb-event-new').click();
    expect($('cb-event-date').value).toBe('2026-12-01');
    expect($('cb-cal-title').textContent).toMatch(/"m":12/); // an out-of-month cell opens its month
    $('cb-cal-prev').click();
    cell('2026-11-21').click();
    $('cb-event-new').click();
    expect($('cb-event-date').value).toBe('2026-11-26');
  });

  it('on a Saturday the chips are Hôm nay and Chủ nhật này (no repeat)', async () => {
    await boot('owner');
    jest.setSystemTime(Date.parse('2026-11-28T03:00:00.000Z')); // Sat 10:00 VN (Fri 22:00 in New York)
    $('cb-event-new').click();
    expect(chips('cb-event-days').map((c) => c.slice(0, 2))).toEqual([['clubs.event_chip_today', '2026-11-28'], ['clubs.event_chip_sun', '2026-11-29']]);
  });

  it('28/11 20:00 picked with chips is sent as 2026-11-28T13:00:00.000Z, then the calendar shows that day', async () => {
    await open();
    $('cb-event-title').value = '  Giao hữu nội bộ ';
    $('cb-event-form').dispatchEvent(new Event('input'));
    expect($('cb-event-title-n').textContent).toBe('18/60');
    document.querySelector('#cb-event-days [data-date="2026-11-28"]').click();
    document.querySelector('#cb-event-times [data-time="20:00"]').click();
    expect(chips('cb-event-days')[1][2]).toBe('true');
    const prev = $('cb-event-preview');
    expect(prev.querySelector('.cb-agenda__h').textContent).toBe(new Date(Date.UTC(2026, 10, 28)).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric' }));
    expect(prev.querySelector('.cb-ev__time').textContent).toBe('20:00GMT+7');
    expect(prev.querySelector('.cb-ev__t').textContent).toBe('Giao hữu nội bộ');
    expect(prev.querySelector('button').disabled).toBe(true);
    expect(prev.querySelector('[data-event]')).toBeNull();
    global.fetch.mockClear();
    await submit();
    expect(posts()).toHaveLength(1);
    const [url, opts] = posts()[0];
    expect(url).toBe('/api/clubs/caro/events');
    expect(JSON.parse(opts.body)).toEqual({ title: 'Giao hữu nội bộ', startsAt: '2026-11-28T13:00:00.000Z' });
    expect($('cb-event-editor').close).toHaveBeenCalled();
    expect(selected()).toEqual(['2026-11-28']);
    expect(monthCalls()).toEqual(['/api/clubs/caro/events?month=2026-11']); // reloaded after the create
  });

  it('typed date and time (no zone) are Vietnam wall time too', async () => {
    await open();
    $('cb-event-title').value = 'Khuya';
    $('cb-event-date').value = '2026-12-31';
    $('cb-event-time').value = '23:45';
    $('cb-event-form').dispatchEvent(new Event('input'));
    expect(chips('cb-event-times').every((c) => c[2] === 'false')).toBe(true);
    global.fetch.mockClear();
    await submit();
    expect(JSON.parse(posts()[0][1].body).startsAt).toBe('2026-12-31T16:45:00.000Z');
  });

  it.each([
    ['', '2026-11-28', '20:00', 'clubs.event_err_title', 'cb-event-title'],
    ['A', '', '20:00', 'clubs.event_err_day', 'cb-event-date'],
    ['A', '2026-11-28', '', 'clubs.event_err_time', 'cb-event-time'],
    ['A', '2026-11-26', '08:45', 'clubs.event_err_past', 'cb-event-time'], // VN now is 09:00
    ['A', '2026-11-26', '09:00', 'clubs.event_err_past', 'cb-event-time'],
  ])('title %j date %j time %j → %s, nothing sent', async (title, date, time, err, field) => {
    await open();
    Object.assign($('cb-event-title'), { value: title });
    $('cb-event-date').value = date;
    $('cb-event-time').value = time;
    global.fetch.mockClear();
    await submit();
    expect(posts()).toHaveLength(0);
    expect([$('cb-event-err').hidden, $('cb-event-err').textContent]).toEqual([false, err]);
    expect($(field).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($(field));
  });

  it('after a failed submit the error follows edits and clears when fixed; 09:15 today is fine', async () => {
    await open();
    $('cb-event-time').value = '09:15';
    await submit();
    expect($('cb-event-err').textContent).toBe('clubs.event_err_title');
    $('cb-event-title').value = 'A';
    $('cb-event-form').dispatchEvent(new Event('input'));
    expect($('cb-event-err').hidden).toBe(true);
    expect($('cb-event-title').hasAttribute('aria-invalid')).toBe(false);
  });

  it('a server refusal stays in the sheet', async () => {
    await open();
    $('cb-event-title').value = 'A';
    api = (u, o) => (o.method === 'POST' ? fail(409, { code: 'CLUB_EVENT_LIMIT', error: 'Tối đa 20 sự kiện sắp tới.' }) : undefined);
    await submit();
    expect($('cb-event-err').hidden).toBe(false);
    expect($('cb-event-err').textContent).toBe('Tối đa 20 sự kiện sắp tới.');
    expect($('cb-event-editor').close).not.toHaveBeenCalled();
  });

  it('× and Hủy close it', async () => {
    await open();
    $('cb-event-x').click();
    $('cb-event-cancel').click();
    expect($('cb-event-editor').close).toHaveBeenCalledTimes(2);
  });

  it('/lich 30/11 01:00 prefills the Vietnam day and time, not New York\'s', async () => {
    await boot('owner');
    $('cb-chat-input').value = '/lich 30/11 01:00 Cờ khuya';
    $('cb-chat-form').onsubmit(new Event('submit'));
    await settle();
    expect([$('cb-event-title').value, $('cb-event-date').value, $('cb-event-time').value]).toEqual(['Cờ khuya', '2026-11-30', '01:00']);
  });
});
