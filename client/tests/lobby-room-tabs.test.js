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
const WIRE = slice("document.querySelectorAll('#room-tabs", "client.on('lobby:online_users'");

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
