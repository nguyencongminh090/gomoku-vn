'use strict';

/**
 * presence-view.test.js — #488: the one client renderer (client/js/presence-view.js, UMD, DOM-free).
 * One row per line of the tone table (features/presence-status planning §2d), plus every i18n key it
 * names exists in both languages.
 */

const PV = require('../../client/js/presence-view');
const fs = require('fs');
const path = require('path');

describe('describe(st) — outside the room', () => {
  test.each([
    // [case, st, state, key, tone, glyph]
    ['playing', { c: 'on', k: 'play', r: 'R' }, 'play', 'presence.playing', 'ok', 'core'],
    ['in a tournament', { c: 'on', k: 'tour' }, 'tour', 'presence.tournament', 'ok', 'core'],
    ['online, idle', { c: 'on', k: 'idle' }, 'online', 'presence.online', 'ok', 'fill'],
    ['public projection (no kind)', { c: 'on' }, 'online', 'presence.online', 'ok', 'fill'],
    ['watching', { c: 'on', k: 'watch', r: 'R' }, 'watch', 'presence.watching', 'ok', 'ring'],
    ['searching', { c: 'on', k: 'search' }, 'search', 'presence.searching', 'ok', 'dotted'],
    ['away', { c: 'on', a: 1, k: 'idle' }, 'away', 'presence.away', 'warn', 'half'],
    ['away while watching', { c: 'on', a: 1, k: 'watch' }, 'away', 'presence.away', 'warn', 'half'],
    ['away while playing keeps the game wording (Q4 A)', { c: 'on', a: 1, k: 'play' }, 'away', 'presence.playing_away', 'warn', 'half'],
    ['reconnecting', { c: 're', k: 'play' }, 'reconnecting', 'presence.reconnecting', 'bad', 'gap'],
    ['offline', { c: 'off' }, 'offline', 'presence.offline', 'off', 'hollow'],
    ['missing / junk → offline', null, 'offline', 'presence.offline', 'off', 'hollow'],
    ['unknown kind → online', { c: 'on', k: 'weird' }, 'online', 'presence.online', 'ok', 'fill'],
  ])('%s', (_c, st, state, key, tone, glyph) => {
    expect(PV.describe(st)).toEqual({ state, key, tone, glyph });
  });
});

describe('describe(member, {inRoom}) — the room keeps its own words (#113/#114)', () => {
  test.each([
    [{ presence: 'disconnected', graceUntil: 5 }, 'playing', 'room.status_disconnected', 'bad', 'gap'],
    [{ presence: 'away' }, 'playing', 'room.status_away', 'warn', 'half'],
    [{ presence: 'active' }, 'playing', 'room.status_active', 'ok', 'fill'],
    [{ presence: 'active' }, 'idle', 'room.status_waiting', 'idle', 'fill'],
    [{ presence: 'active' }, 'interrupted', 'room.status_waiting', 'idle', 'fill'],
  ])('%j in a %s room', (m, roomState, key, tone, glyph) => {
    expect(PV.describe(m, { inRoom: true, roomState })).toMatchObject({ key, tone, glyph });
  });
});

test('outside the room each state has its own (tone, glyph) pair — colour is never the only cue', () => {
  const seen = new Map();
  const all = [
    PV.describe({ c: 'on', k: 'idle' }), PV.describe({ c: 'on', k: 'play' }), PV.describe({ c: 'on', k: 'watch' }), PV.describe({ c: 'on', k: 'search' }),
    PV.describe({ c: 'on', a: 1 }), PV.describe({ c: 're' }), PV.describe({ c: 'off' }),
  ];
  for (const d of all) {
    const sig = `${d.tone}/${d.glyph}`;
    expect(seen.has(sig)).toBe(false);
    seen.set(sig, d.state);
  }
});

test('secondsLeft counts down a grace deadline and never goes negative', () => {
  expect(PV.secondsLeft(10_500, 1_000)).toBe(10);
  expect(PV.secondsLeft(500, 1_000)).toBe(0);
  expect(PV.secondsLeft(undefined, 1_000)).toBeNull();
});

test('dotHtml escapes the label and carries role/aria-label/title', () => {
  const html = PV.dotHtml(PV.describe({ c: 'on' }), 'a"<b>');
  expect(html).toBe('<span class="pres-dot pres-dot--ok pres-dot--fill" role="img" aria-label="a&quot;&lt;b&gt;" title="a&quot;&lt;b&gt;"></span>');
});

test('every key presence-view can return exists in vi and en', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../client/js/i18n.js'), 'utf8');
  const keys = ['presence.online', 'presence.away', 'presence.playing_away', 'presence.reconnecting', 'presence.offline',
    'presence.playing', 'presence.watching', 'presence.searching', 'presence.tournament',
    'room.status_disconnected', 'room.status_away', 'room.status_active', 'room.status_waiting'];
  for (const k of keys) expect(src.split(`'${k}':`).length - 1).toBe(2);
});

describe('#498 stOfRow / isOnline — friend rows carry only `st`', () => {
  test.each([
    ['friend online, active', { st: { c: 'on', k: 'idle' } }, true],
    ['friend playing', { st: { c: 'on', k: 'play', r: 'r1', t: 5 } }, true],
    ['friend away (tab hidden) is not "online" for lists', { st: { c: 'on', a: 1, k: 'play' } }, false],
    ['friend reconnecting', { st: { c: 're', k: 'play' } }, false],
    ['friend offline / hidden', { st: { c: 'off' } }, false],
    ['online-list row the page marked online', { online: true }, true],
    ['row with nothing', {}, false],
    ['null row', null, false],
  ])('%s', (_name, row, online) => {
    expect(PV.isOnline(row)).toBe(online);
  });

  test('legacy activity/roomId/startedAt are no longer read', () => {
    expect(PV.stOfRow({ online: true, activity: 'playing', roomId: 'r1', startedAt: 9 })).toEqual({ c: 'on', k: 'idle' });
    expect(PV.stOfRow({ st: { c: 'on', k: 'watch', r: 'r2' } })).toEqual({ c: 'on', k: 'watch', r: 'r2' });
  });
});
