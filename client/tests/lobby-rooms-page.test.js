/**
 * @jest-environment jsdom
 */
/*
 * #382: with more rooms than one page the server mirrors only that page in the lobby and sends the
 * counts over all rooms as `stats`. lobby.js must show those counts (not counts of the cards it
 * holds) and offer "show more", which fetches the next page with `lobby:rooms_query`.
 * lobby.js opens a socket on import, so the block is cut from source and run against stubs
 * (same technique as lobby-moves-delta.test.js).
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/lobby.js'), 'utf8');
const slice = (from, to) => SRC.slice(SRC.indexOf(from), SRC.indexOf(to));
const BLOCK = slice('// #382: with more rooms than one page', '// Hero line');
const PATCH = slice('function applyLobbyPatch(', '// The meta line under the players');

const room = (roomId, o = {}) => ({ roomId, state: 'idle', playerCount: 1, userCount: 1, ...o });
const live = (roomId, watchers = 0) => room(roomId, { state: 'playing', playerCount: 2, userCount: 2 + watchers });
const page = (n) => Array.from({ length: n }, (_, i) => live('L' + i, 1));

beforeEach(() => {
  document.body.innerHTML = '<span id="rh-n-open"></span><span id="rh-n-live"></span><span id="rh-n-watch"></span><span id="room-n-playing"></span>'
    + '<div id="wrap"><div id="room-list"></div></div>';
  window.eval(`
    var handlers = {}; var acks = [];
    var client = {
      on: (e, f) => { (handlers[e] = handlers[e] || []).push(f); },
      emit: () => {},
      emitAck: (event, data, ms, cb) => acks.push({ event, data, cb }),
    };
    var fire = (e, d) => { for (const f of handlers[e] || []) f(d); };
    var t = (k, v) => k + (v ? ':' + v.n : '');
    var roomListEl = document.getElementById('room-list');
    var roomMap = new Map(); var currentRooms = [];
    var watchersOf = (room) => Math.max(0, (room.userCount || 0) - (room.playerCount || 0));
    var setNum = (id, n) => { document.getElementById(id).textContent = String(n); };
    var renderHero = () => renderRoomStats();
    var renderRoomList = (rooms) => { roomListEl.innerHTML = rooms.map((r) => '<div class="room-row" data-room-id="' + r.roomId + '"></div>').join(''); };
    var updateRoomRowNode = () => {};
    var buildRoomRowHtml = (r) => '<div class="room-row" data-room-id="' + r.roomId + '"></div>';
    var requestLobbySnapshot = () => {};
    ${BLOCK}
    ${PATCH}
    // the list handlers of lobby.js, registered after the #382 ones as in the source
    client.on('lobby:update', (data) => { roomMap = new Map((data.rooms || []).map((r) => [r.roomId, r])); currentRooms = Array.from(roomMap.values()); renderRoomList(currentRooms); renderHero(); });
    client.on('lobby:patch', (data) => applyLobbyPatch(data));
  `);
});

const fire = (event, data) => window.eval(`fire(${JSON.stringify(event)}, ${JSON.stringify(data)})`);
const num = (id) => document.getElementById(id).textContent;
const more = () => document.getElementById('rooms-more');
const cards = () => [...document.querySelectorAll('#room-list .room-row')].map((n) => n.dataset.roomId);
const acks = () => window.eval('acks');

describe('whole list held (no stats): as before', () => {
  it('counts come from the cards; no "show more"', () => {
    fire('lobby:update', { rooms: [room('A'), live('B', 3), live('C', 1)] });
    expect([num('rh-n-open'), num('rh-n-live'), num('rh-n-watch'), num('room-n-playing')]).toEqual(['1', '2', '4', '2']);
    expect(more()).toBeNull();
  });
});

describe('one page of many (stats present)', () => {
  const stats = { rooms: 5000, open: 40, live: 4900, watch: 12345 };

  it('counts are the server totals, not the 30 cards', () => {
    fire('lobby:update', { rooms: page(30), stats });
    expect([num('rh-n-open'), num('rh-n-live'), num('rh-n-watch'), num('room-n-playing')]).toEqual(['40', '4900', '12345', '4900']);
  });

  it('"show more" sits right after the grid and says how many are left', () => {
    fire('lobby:update', { rooms: page(30), stats });
    expect(more().hidden).toBe(false);
    expect(more().textContent).toBe('lobby.rooms_more:4970');
    expect(document.getElementById('room-list').nextElementSibling).toBe(more());
    expect(more().type).toBe('button');
  });

  it('a patch updates the counts; a patch without stats means the list is whole again', () => {
    fire('lobby:update', { rooms: page(30), stats });
    fire('lobby:patch', { upserts: [], removed: [], stats: { ...stats, rooms: 5001, open: 41 } });
    expect(num('rh-n-open')).toBe('41');
    expect(more().textContent).toBe('lobby.rooms_more:4971');
    fire('lobby:patch', { upserts: [], removed: ['L0'] });
    expect(more().hidden).toBe(true);
    expect(num('rh-n-live')).toBe('29'); // from the cards again
  });

  it('click: asks for the page after the ones held, appends only rooms not on screen', () => {
    fire('lobby:update', { rooms: page(30), stats });
    more().click();
    expect(acks()).toHaveLength(1);
    expect(acks()[0]).toMatchObject({ event: 'lobby:rooms_query', data: { offset: 30 } });
    expect(more().disabled).toBe(true);
    more().click();
    expect(acks()).toHaveLength(1); // one request at a time
    acks()[0].cb(null, { rooms: [live('L3', 9), live('X1'), live('X2')], stats });
    expect(cards()).toHaveLength(32);
    expect(cards().slice(-2)).toEqual(['X1', 'X2']);
    expect(more().disabled).toBe(false);
    expect(more().textContent).toBe('lobby.rooms_more:4968');
    more().click();
    expect(acks()[1].data).toEqual({ offset: 33 }); // the server's ranking position, not the card count
  });

  it.each([[new Error('timeout'), undefined], [null, { error: 'RATE_LIMITED' }], [null, null]])(
    'a failed request (%p, %p) leaves the list alone and the button usable', (err, res) => {
      fire('lobby:update', { rooms: page(30), stats });
      more().click();
      acks()[0].cb(err, res);
      expect(cards()).toHaveLength(30);
      expect(more().disabled).toBe(false);
      more().click();
      expect(acks()[1].data).toEqual({ offset: 30 });
    });

  it('everything loaded → the button goes away; a new snapshot starts over', () => {
    fire('lobby:update', { rooms: page(30), stats: { rooms: 32, open: 0, live: 32, watch: 0 } });
    more().click();
    acks()[0].cb(null, { rooms: [live('X1'), live('X2')], stats: { rooms: 32, open: 0, live: 32, watch: 0 } });
    expect(more().hidden).toBe(true);
    fire('lobby:update', { rooms: page(30), stats });
    expect(cards()).toHaveLength(30);
    more().click();
    expect(acks()[1].data).toEqual({ offset: 30 });
  });
});
