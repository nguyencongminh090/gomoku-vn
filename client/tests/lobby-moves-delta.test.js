/**
 * @jest-environment jsdom
 */
/*
 * #377: lobby:patch upserts carry `moves` as a delta ({ movesFrom, moves }). The real applyLobbyPatch +
 * snapshot-request slice of lobby.js runs against a stub socket; LobbyMoves is the real shared module.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/lobby.js'), 'utf8');
const slice = (from, to) => SRC.slice(SRC.indexOf(from), SRC.indexOf(to));
const SNAPSHOT = slice('let snapshotRequested', '// Delta — only the rooms');
const PATCH = slice('function applyLobbyPatch(', '// The meta line under the players');

beforeEach(() => {
  document.body.innerHTML = '<div id="room-list"></div>';
  window.LobbyMoves = require('../js/lobby-moves.js');
  window.eval(`
    var handlers = {}; var emitted = [];
    var client = { on: (e, f) => { handlers[e] = f; }, emit: (e) => emitted.push(e) };
    var roomListEl = document.getElementById('room-list');
    var roomMap = new Map(); var currentRooms = [];
    var noteServerTime = () => {}; var renderHero = () => {};
    var renderFromMap = () => { currentRooms = Array.from(roomMap.values()); renderRoomList(currentRooms); };
    var renderRoomList = (rooms) => { roomListEl.innerHTML = rooms.map((r) => '<div class="room-row" data-room-id="' + r.roomId + '" data-moves="' + (r.moves || []).join(',') + '"></div>').join(''); };
    var updateRoomRowNode = (node, r) => { node.dataset.moves = (r.moves || []).join(','); };
    var buildRoomRowHtml = (r) => '<div class="room-row" data-room-id="' + r.roomId + '" data-moves="' + (r.moves || []).join(',') + '"></div>';
    ${SNAPSHOT}
    ${PATCH}
  `);
  window.eval(`handlers['lobby:update']({ rooms: [{ roomId: 'A', startedAt: 100, moves: [1, 2, 3, 4] }, { roomId: 'B', startedAt: null, moves: null }] })`);
});

const held = (id) => window.eval(`roomMap.get(${JSON.stringify(id)})`);
const shown = (id) => document.querySelector(`[data-room-id="${id}"]`).dataset.moves;
const patch = (p) => window.eval(`applyLobbyPatch(${JSON.stringify({ removed: [], ...p })})`);
const emitted = () => window.eval('emitted');

test('a delta is spliced onto the held moves, map and card both', () => {
  patch({ upserts: [{ roomId: 'A', startedAt: 100, movesFrom: 4, moves: [5, 6] }] });
  expect(held('A').moves).toEqual([1, 2, 3, 4, 5, 6]);
  expect(held('A')).not.toHaveProperty('movesFrom');
  expect(shown('A')).toBe('1,2,3,4,5,6');
  expect(emitted()).toEqual([]);
});

test('a full entry (no movesFrom) still replaces as before', () => {
  patch({ upserts: [{ roomId: 'B', startedAt: 200, moves: [7, 7] }] });
  expect(held('B').moves).toEqual([7, 7]);
});

test('a delta that does not fit asks for one snapshot and leaves the entry alone', () => {
  patch({ upserts: [{ roomId: 'A', startedAt: 100, movesFrom: 8, moves: [9, 9] }] });
  patch({ upserts: [{ roomId: 'B', startedAt: 300, movesFrom: 2, moves: [9, 9] }] });
  expect(emitted()).toEqual(['lobby:subscribe']); // once, until the snapshot arrives
  expect(held('A').moves).toEqual([1, 2, 3, 4]);
  window.eval(`handlers['lobby:update']({ rooms: [{ roomId: 'A', startedAt: 100, moves: [1, 2, 3, 4, 5, 6, 7, 8, 9, 9] }] })`);
  patch({ upserts: [{ roomId: 'A', startedAt: 100, movesFrom: 20, moves: [] }] });
  expect(emitted()).toEqual(['lobby:subscribe', 'lobby:subscribe']); // the flag resets on lobby:update
});
