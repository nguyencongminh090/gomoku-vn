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
const RENDER = slice('function renderRoomList(', '// Update an existing row');

const room = (roomId, state, playerCount) => ({ roomId, roomName: 'R' + roomId, hostName: 'h', playerCount, state, boardSize: 15 });
const ROOMS = [room('a', 'idle', 1), room('b', 'playing', 2), room('c', 'idle', 2), room('d', 'idle', 0)];
const ids = () => [...document.querySelectorAll('.room-row')].map((n) => n.dataset.roomId);

beforeEach(() => {
  document.body.innerHTML = BODY;
  window.t = (k) => k;
  window.eval(`
    var roomListEl = document.getElementById('room-list'); var currentRooms = [];
    var buildRoomRowHtml = (r) => '<div class="room-row" data-room-id="' + r.roomId + '"></div>'; var NEW_CARD_HTML = () => '<button class="rcard-new"></button>';
    ${RENDER}
    currentRooms = ${JSON.stringify(ROOMS)}; renderRoomList(currentRooms);
  `);
});

describe('room list (no filters since 2026-11-13: one "Đang chơi · N" label)', () => {
  it('lists every room, create card first', () => {
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    expect(document.getElementById('room-list').firstElementChild.className).toBe('rcard-new');
    expect(document.querySelector('[data-room-tab]')).toBeNull();
    expect(document.getElementById('room-n-playing')).not.toBeNull();
  });

  it('no rooms: the empty sentence + create hint, and the create card', () => {
    window.eval('renderRoomList([])');
    expect(ids()).toEqual([]);
    expect(document.querySelector('.room-list__empty-text').textContent).toBe('lobby.no_rooms');
    expect(document.querySelector('.room-list__empty-sub').textContent).toBe('lobby.no_rooms_sub');
    expect(document.querySelector('.rcard-new')).not.toBeNull();
  });
});

describe('buildRoomMeta rated/friendly segment (B219)', () => {
  const meta = (r) => window.eval(`
    var escapeHtml = (s) => s; var buildRuleTags = () => ['17×17']; var isCustomRules = () => false; var buildRuleTitle = () => ''; var buildTimeSummary = () => '';
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
    const row = slice('function buildRoomRowHtml(', 'function cardKind('); // #364: the card template
    expect(row).toContain('data-action="joinRoom"');
    expect(SRC).not.toContain('room-row__action');
  });
});

describe('compact rule tags (#253)', () => {
  const run = (r) => window.eval(`
    var t = (k) => k;
    ${slice('function isCustomRules(', 'window.addEventListener(\'langchange\'')}
    JSON.stringify({ tags: buildRuleTags(${JSON.stringify(r)}), title: buildRuleTitle(${JSON.stringify(r)}) })`);
  it('standard room: one plain tag + size, nothing custom', () => {
    expect(JSON.parse(run({ boardSize: 15, winningRule: 'freestyle' })).tags).toEqual(['lobby.rules_standard', '15×15']);
  });
  it('custom room: "custom" tag, full breakdown in the title', () => {
    const r = JSON.parse(run({ boardSize: 19, winningRule: 'caro', ruleWall: true, ruleSwap2: true }));
    expect(r.tags).toEqual(['lobby.rules_custom', '19×19']);
    expect(r.title).toBe('modal.rule_wall · Swap2 · rule.caro');
  });
});

describe('#364 table cards', () => {
  const load = () => window.eval(`
    var escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    var escapeAttr = escapeHtml; var buildRuleTags = () => ['15×15']; var isCustomRules = () => false; var buildRuleTitle = () => ''; var buildTimeSummary = () => '';
    window.PlatformShell = { avatar: (u, n) => { const e = document.createElement('span'); e.className = 'pav'; e.textContent = n[0]; return e; }, icon: (n) => { window.__icons = (window.__icons || []).concat(n); return document.createElement('svg'); } };
    var roomListEl = document.getElementById('room-list'); var openModal = () => { window.__created = (window.__created || 0) + 1; };
    var canWatch = (r) => r.state === 'playing' || r.playerCount >= 2; var rowActionLabel = (r) => 'x';
    var watchersOf = (room) => Math.max(0, (room.userCount || 0) - (room.playerCount || 0)); var serverClockOffset = 0;
    ${slice('function buildRoomRowHtml(', '// Full rebuild')}
    ${slice('function buildRoomPlayers(', '// Apply a `lobby:patch`')}
    ${slice('function buildRoomMeta(', '// A seat to sit in')}
    ({ buildRoomRowHtml, miniBoardSvg, formatElapsed, cardKind, NEW_CARD_HTML })`);
  const div = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
  const base = { roomId: '#A3F', roomName: 'R', boardSize: 15, ranked: true };

  it('card kind: playing → live, two seated → ready, otherwise open', () => {
    const { cardKind } = load();
    expect(cardKind({ state: 'playing', playerCount: 2 })).toBe('live');
    expect(cardKind({ state: 'idle', playerCount: 2 })).toBe('ready');
    expect(cardKind({ state: 'idle', playerCount: 1 })).toBe('open');
    expect(cardKind({ state: 'idle', playerCount: 0 })).toBe('open');
  });

  it('mini board draws one stone per move pair, black first, ring on the last; drops out-of-board moves', () => {
    const { miniBoardSvg } = load();
    const svg = div(miniBoardSvg(15, [7, 7, 8, 8, 6, 6, 99, 1]));
    expect(svg.querySelectorAll('.mb__b')).toHaveLength(2);
    expect(svg.querySelectorAll('.mb__w')).toHaveLength(1);
    const last = svg.querySelector('.mb__last');
    expect([last.getAttribute('cx'), last.getAttribute('cy')]).toEqual(['6.5', '6.5']);
    expect(svg.getAttribute('viewBox')).toBe('0 0 15 15');
    expect(div(miniBoardSvg(19, null)).querySelectorAll('circle')).toHaveLength(0);
  });

  it('a live card shows the position, elapsed time, watchers and both ratings', () => {
    const { buildRoomRowHtml } = load();
    const card = div(buildRoomRowHtml({ ...base, state: 'playing', playerCount: 2, userCount: 9, startedAt: Date.now() - 125000, moves: [7, 7, 8, 8],
      players: [{ displayName: 'An', rating: 1684 }, { displayName: 'Bình', rating: null }] }));
    const prov = div(buildRoomRowHtml({ ...base, state: 'idle', playerCount: 1, userCount: 1, players: [{ displayName: 'C', rating: 1500, provisional: true }, null] }));
    expect(prov.querySelector('.rplayer__rating').textContent).toBe('1500?'); // same '?' as profile / user card
    expect(card.className).toContain('rcard--live');
    expect(card.dataset.action).toBe('joinRoom');
    expect(card.querySelectorAll('.mb__b, .mb__w')).toHaveLength(2);
    expect(card.querySelector('.rcard__el').textContent).toBe(' · 02:05');
    expect(card.querySelector('.rcard__eye').textContent).toBe('7');
    expect([...card.querySelectorAll('.rplayer__rating')].map((n) => n.textContent)).toEqual(['1684']); // null rating → nothing
    expect(card.querySelector('.rcard__sit')).toBeNull();
    expect(window.__icons).toContain('ph-regular-eye'); // PlatformShell.icon wants the full sprite id
  });

  it('an open card shows an empty board, "Ngồi vào" and no watchers chip when nobody watches', () => {
    const { buildRoomRowHtml } = load();
    const card = div(buildRoomRowHtml({ ...base, state: 'idle', playerCount: 1, userCount: 1, moves: null, players: [{ displayName: 'An' }, null] }));
    expect(card.className).toContain('rcard--open');
    expect(card.querySelectorAll('circle')).toHaveLength(0);
    expect(card.querySelector('.rcard__sit').textContent).toBe('lobby.card_sit');
    expect(card.querySelector('.rcard__eye')).toBeNull();
  });

  it('the ghost card opens the create-room modal', () => {
    const { NEW_CARD_HTML } = load();
    document.getElementById('room-list').innerHTML = NEW_CARD_HTML();
    window.__created = 0;
    document.querySelector('[data-create-room]').click();
    expect(window.__created).toBeGreaterThan(0); // each load() in this file adds one delegate; production adds one
  });

  it('formatElapsed: mm:ss under an hour, h:mm:ss after', () => {
    const { formatElapsed } = load();
    expect(formatElapsed(Date.now() - 59000)).toBe('00:59');
    expect(formatElapsed(Date.now() - 3725000)).toBe('1:02:05');
  });
});

describe('#364 patches stay incremental', () => {
  const PATCH = slice('function applyLobbyPatch(', '// The meta line under the players');
  const live = (moves) => ({ roomId: 'b', roomName: 'Rb', playerCount: 2, state: 'playing', boardSize: 15, moves });
  const boot = () => window.eval(`
    var roomMap = new Map(currentRooms.map((r) => [r.roomId, r]));
    var renderHero = () => {};
    var updateRoomRowNode = (node, r) => { node.className = 'room-row'; node.dataset.moves = String((r.moves || []).length); }; // real one resets className = cardClass(room)
    ${PATCH}
    window.__patch = applyLobbyPatch;`);

  it('a moves-only patch (every 2.5 s during play) updates the same card node, without replaying the entrance animation', () => {
    window.eval(`buildRoomRowHtml = (r, o) => '<div class="room-row' + (o && o.animate ? ' animate-fade-up' : '') + '" data-room-id="' + r.roomId + '"></div>'; renderRoomList(currentRooms);`);
    boot();
    const before = document.querySelector('[data-room-id="b"]');
    window.__patch({ upserts: [live([7, 7, 8, 8])], removed: [] });
    const after = document.querySelector('[data-room-id="b"]');
    expect(after).toBe(before);
    expect(after.dataset.moves).toBe('4');
    expect(after.classList.contains('animate-fade-up')).toBe(false);
  });

  it('a new room is appended, a removed one leaves; the create card stays first; last room gone → empty state', () => {
    boot();
    window.__patch({ upserts: [room('e', 'idle', 1)], removed: ['a'] });
    expect(ids()).toEqual(['b', 'c', 'd', 'e']);
    expect(document.getElementById('room-list').firstElementChild.className).toBe('rcard-new');
    window.__patch({ upserts: [], removed: ['b', 'c', 'd', 'e'] });
    expect(document.querySelector('.room-list__empty')).not.toBeNull();
  });
});
