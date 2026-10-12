/**
 * @jest-environment jsdom
 */
/*
 * Phòng / Bàn / Quan sát tabs (B210c). lobby.js is an ES module that opens a socket on import, so
 * the filter slice (state + predicate + empty-text map + renderRoomList) is cut out of the source
 * and run against the real index.html markup, the way lobby-home.test.js loads its module.
 */
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const BODY = read('index.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SRC = read('js/lobby.js');
const slice = (from, to) => SRC.slice(SRC.indexOf(from), SRC.indexOf(to));
const FILTER = slice('let roomTab =', '// Full rebuild');
const RENDER = slice('function renderRoomList(', '// Update an existing row');
const WIRE = slice("document.querySelectorAll('#room-tabs", '// Apply a `lobby:online_patch`');

const room = (roomId, state, playerCount) => ({ roomId, roomName: 'R' + roomId, hostName: 'h', playerCount, state, boardSize: 15 });
const ROOMS = [room('a', 'idle', 1), room('b', 'playing', 2), room('c', 'idle', 2), room('d', 'idle', 0)];
const ids = () => [...document.querySelectorAll('.room-row')].map((n) => n.dataset.roomId);
const tab = (k) => document.querySelector(`[data-room-tab="${k}"]`);

beforeEach(() => {
  document.body.innerHTML = BODY;
  window.t = (k) => k;
  window.eval(`
    var roomListEl = document.getElementById('room-list'); var currentRooms = [];
    var buildRoomRowHtml = (r) => '<div class="room-row" data-room-id="' + r.roomId + '"></div>';
    ${FILTER}\n${RENDER}\n${WIRE}
    currentRooms = ${JSON.stringify(ROOMS)}; renderRoomList(currentRooms);
  `);
});

describe('room tabs', () => {
  it('Phòng (default) lists every room', () => {
    expect(tab('all').getAttribute('aria-selected')).toBe('true');
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('Bàn = waiting for an opponent (not playing, < 2 seated); Quan sát = playing or full (the two tabs partition the list)', () => {
    tab('open').click();
    expect(ids()).toEqual(['a', 'd']);
    expect(tab('open').getAttribute('aria-selected')).toBe('true');
    expect(tab('all').getAttribute('aria-selected')).toBe('false');
    tab('watch').click();
    expect(ids()).toEqual(['b', 'c']); // playing, and full-but-not-started
  });

  it('an empty tab shows its own sentence, without the "create a room" hint', () => {
    window.eval(`currentRooms = [${JSON.stringify(room('x', 'idle', 1))}]; document.querySelector('[data-room-tab="watch"]').click();`);
    expect(ids()).toEqual([]);
    expect(document.querySelector('.room-list__empty-text').textContent).toBe('lobby.no_watch');
    expect(document.querySelector('.room-list__empty-sub')).toBeNull();
  });
});

describe('buildRoomMeta rated/friendly segment (B219)', () => {
  const meta = (r) => window.eval(`
    var escapeHtml = (s) => s; var buildRuleTags = () => ['17×17']; var buildTimeSummary = () => '';
    ${slice('function buildRoomMeta(', '// A seat to sit in')}
    buildRoomMeta(${JSON.stringify(r)})`);
  it('shows the room name as plain text first', () => {
    expect(meta({ hostName: 'h', roomName: 'Room1', playerCount: 1, ranked: true })).toMatch(/^<span class="room-row__host">Room1<\/span>/);
  });
  it('shows Xếp hạng for a rated room and Giao hữu for a friendly one', () => {
    expect(meta({ hostName: 'h', roomName: 'h', playerCount: 1, ranked: true })).toBe('<span class="room-row__host">h</span><span class="rtag">17×17</span><span class="rtag rtag--rated">room.mode_rated</span>');
    expect(meta({ hostName: 'h', playerCount: 1, ranked: false })).toContain('rtag rtag--friendly">room.mode_friendly');
  });
});

describe('ticket players + whole-row click (B219 follow-up)', () => {
  const players = (room) => window.eval(`
    var escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    window.PlatformShell = { avatar: (u, n) => { const e = document.createElement('span'); e.className = 'pav'; e.textContent = n[0]; return e; } };
    ${slice('function buildRoomPlayers(', '// Apply a `lobby:patch`')}
    buildRoomPlayers(${JSON.stringify(room)})`);
  it('shows both seated players as "A vs B", with their avatars', () => {
    const h = players({ roomName: 'R', players: [{ displayName: 'An' }, { displayName: 'Bình' }] });
    expect(h).toContain('rplayer__name">An<');
    expect(h).toContain('rplayer__name">Bình<');
    expect(h).toContain('class="rvs"');
    expect(h.match(/class="pav"/g)).toHaveLength(2);
  });
  it('an empty seat is a placeholder; a room with nobody seated shows its own name', () => {
    expect(players({ roomName: 'R', players: [{ displayName: 'An' }, null] })).toContain('rplayer--empty">lobby.seat_empty');
    expect(players({ roomName: 'Room<1>', players: [null, null] })).toBe('Room&lt;1>');
  });
  it('escapes a hostile player name', () => {
    expect(players({ players: [{ displayName: '<img src=x>' }, null] })).not.toContain('<img');
  });
  it('the ticket itself carries the join action and no button remains', () => {
    const row = SRC.slice(SRC.indexOf('<div class="room-row'), SRC.indexOf('<div class="room-row') + 300);
    expect(row).toContain('data-action="joinRoom"');
    expect(SRC).not.toContain('room-row__action');
  });
});
