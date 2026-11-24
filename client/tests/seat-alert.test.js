/**
 * @jest-environment jsdom
 */
/*
 * #438 js/seat-alert.js: registers the saved filter with the server, re-registers after a reconnect, and
 * shows a toast ("Vào" / "Tắt 10 phút") for each `lobby:seat_alert`, honouring the 10-minute mute.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/seat-alert.js'), 'utf8');
const t = (k, v) => (v ? `${k}(${Object.keys(v).sort().map((x) => `${x}=${v[x]}`).join(',')})` : k);

let client, store, clock, joined, changes;
const mem = () => ({ getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });
const onChange = () => changes.push(1);

function fakeClient(connected = true) {
  const handlers = {};
  return {
    sent: [], socket: { connected },
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, data) { this.sent.push([ev, data]); },
    fire(ev, d) { for (const fn of handlers[ev] || []) fn(d); },
  };
}

function make({ connected = true, seed } = {}) {
  document.body.innerHTML = '';
  window.eval(SRC);
  client = fakeClient(connected);
  store = new Map(seed || []);
  clock = 1_000_000;
  joined = [];
  return window.SeatAlert.create({ client, t, storage: mem(), join: (id) => joined.push(id), now: () => clock });
}
const room = (o = {}) => ({ roomId: '#AAA', hostName: 'An', winningRule: 'caro', timerMode: 'per_move', timerSeconds: 60, ...o });
const toasts = () => [...document.querySelectorAll('#toast-stack .seat-toast')];

beforeEach(() => { changes = []; window.addEventListener('seatalert:change', onChange); });
afterEach(() => { window.removeEventListener('seatalert:change', onChange); jest.useRealTimers(); });

describe('arming', () => {
  it('arm saves a normalized filter, tells the server, announces the change', () => {
    const sa = make();
    expect(sa.get()).toBeNull();
    expect(sa.arm({ rule: 'caro', near: true, time: ['mid', 'bogus', 'fast'], junk: 1 })).toBe(true);
    expect(sa.get()).toEqual({ rule: 'caro', near: true, time: ['fast', 'mid'] });
    expect(client.sent).toEqual([['lobby:alert_set', { rule: 'caro', near: true, time: ['fast', 'mid'] }]]);
    expect(changes).toHaveLength(1);
  });

  it('rejects a filter without a known rule: nothing saved, nothing sent', () => {
    const sa = make();
    for (const bad of [null, undefined, {}, { rule: 'x' }, 'caro']) expect(sa.arm(bad)).toBe(false);
    expect(sa.get()).toBeNull();
    expect(client.sent).toEqual([]);
  });

  it('disarm forgets the filter and the mute and tells the server', () => {
    const sa = make();
    sa.arm({ rule: 'caro' });
    sa.mute();
    client.sent.length = 0;
    sa.disarm();
    expect(sa.get()).toBeNull();
    expect(sa.isMuted()).toBe(false);
    expect(client.sent).toEqual([['lobby:alert_clear']]);
  });

  it('a corrupt stored value is "off", not a crash', () => {
    expect(make({ seed: [['gvn_seat_alert', '{nope']] }).get()).toBeNull();
    expect(make({ seed: [['gvn_seat_alert', '{"rule":"zzz"}']] }).get()).toBeNull();
  });
});

describe('registration with the server', () => {
  it('re-registers on every (re)connect while armed, and says nothing when off', () => {
    const sa = make();
    client.fire('connect');
    expect(client.sent).toEqual([]);
    sa.arm({ rule: 'renju' });
    client.sent.length = 0;
    client.fire('connect');
    expect(client.sent).toEqual([['lobby:alert_set', { rule: 'renju', near: false, time: [] }]]);
  });

  it('a page load with a saved alert registers at once when already connected, not before', () => {
    const seed = [['gvn_seat_alert', '{"rule":"caro","near":false,"time":["fast"]}']];
    make({ connected: true, seed });
    expect(client.sent).toEqual([['lobby:alert_set', { rule: 'caro', near: false, time: ['fast'] }]]);
    make({ connected: false, seed });
    expect(client.sent).toEqual([]); // the 'connect' event will do it
  });
});

describe('the toast', () => {
  it('a seat_alert shows who, which rule and the clock, with Vào and Tắt 10 phút', () => {
    const sa = make();
    sa.arm({ rule: 'caro' });
    client.fire('lobby:seat_alert', { room: room() });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].textContent).toContain('seatalert.toast(host=An,rule=rule.caro,time=');
    const [go, off] = toasts()[0].querySelectorAll('button');
    expect([go.textContent, off.textContent]).toEqual(['lobby.btn_join', 'seatalert.mute']);
  });

  it('Vào enters that table and closes the toast', () => {
    const sa = make();
    sa.arm({ rule: 'caro' });
    client.fire('lobby:seat_alert', { room: room({ roomId: '#Q8Z' }) });
    toasts()[0].querySelector('.seat-toast__btn--go').click();
    expect(joined).toEqual(['#Q8Z']);
    expect(toasts()).toHaveLength(0);
  });

  it('Tắt 10 phút mutes exactly 10 minutes: alerts in the window are dropped, the next one after it shows', () => {
    const sa = make();
    sa.arm({ rule: 'caro' });
    client.fire('lobby:seat_alert', { room: room() });
    toasts()[0].querySelectorAll('button')[1].click();
    expect(sa.isMuted()).toBe(true);
    expect(sa.mutedUntil()).toBe(clock + 600000);
    client.fire('lobby:seat_alert', { room: room({ roomId: '#B' }) });
    clock += 600000 - 1;
    client.fire('lobby:seat_alert', { room: room({ roomId: '#C' }) });
    expect(toasts()).toHaveLength(0);
    clock += 1; // mute over (boundary)
    expect(sa.isMuted()).toBe(false);
    client.fire('lobby:seat_alert', { room: room({ roomId: '#D' }) });
    expect(toasts()).toHaveLength(1);
  });

  it('turning the alert on again clears an old mute', () => {
    const sa = make();
    sa.arm({ rule: 'caro' });
    sa.mute();
    sa.disarm();
    sa.arm({ rule: 'caro' });
    expect(sa.isMuted()).toBe(false);
  });

  it('ignores an alert when off (another tab turned it off) and malformed messages', () => {
    const sa = make();
    client.fire('lobby:seat_alert', { room: room() });
    sa.arm({ rule: 'caro' });
    for (const bad of [undefined, null, {}, { room: {} }, { room: { hostName: 'x' } }]) client.fire('lobby:seat_alert', bad);
    expect(toasts()).toHaveLength(0);
  });

  it('removes itself after a while and keeps at most 5 on screen', () => {
    jest.useFakeTimers();
    const sa = make();
    sa.arm({ rule: 'caro' });
    for (let i = 0; i < 7; i++) client.fire('lobby:seat_alert', { room: room({ roomId: '#' + i }) });
    expect(toasts()).toHaveLength(5);
    jest.advanceTimersByTime(9001);
    expect(toasts()).toHaveLength(0);
  });

  it('host / room text goes in as text, never markup', () => {
    const sa = make();
    sa.arm({ rule: 'caro' });
    client.fire('lobby:seat_alert', { room: room({ hostName: '<img src=x onerror=alert(1)>' }) });
    expect(toasts()[0].querySelector('img')).toBeNull();
  });
});
