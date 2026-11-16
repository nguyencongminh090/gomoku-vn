/**
 * @jest-environment jsdom
 */
/*
 * #365 — leaving a room goes back to where it was entered from: lobby.js adds ?from=rooms when the
 * room is entered from the Phòng tab; room-socket.js exitUrl() turns that into index.html#rooms.
 * A quick-match room always exits to Home. lobby.js is an ES module that opens a socket on import,
 * so roomHref is cut out of its source (same approach as lobby-room-tabs.test.js).
 */
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const LOBBY = read('js/lobby.js');
const ROOM_HREF = LOBBY.slice(LOBBY.indexOf('function roomHref('), LOBBY.indexOf('// -----', LOBBY.indexOf('function roomHref(')));
const EXIT_URL = (() => {
  const src = read('js/room-socket.js');
  const from = src.indexOf('  function exitUrl() {');
  return src.slice(from, src.indexOf('\n  }\n', from) + 4);
})();

const roomHref = (hash, roomId) => {
  window.history.replaceState({}, '', '/index.html' + hash);
  return window.eval(`(function () { ${ROOM_HREF}; return roomHref(${JSON.stringify(roomId)}); })()`);
};
const exitUrl = (search, roomData) => {
  window.history.replaceState({}, '', '/room.html' + search);
  const global = { location: window.location, RoomState: { roomData } };
  return new Function('global', `const S = () => global.RoomState; ${EXIT_URL}; return exitUrl();`)(global);
};

describe('lobby.js roomHref', () => {
  it.each([
    ['#rooms', '#A3F', 'room.html?id=%23A3F&from=rooms'],
    ['', '#A3F', 'room.html?id=%23A3F'],
    ['#tournaments', '#A3F', 'room.html?id=%23A3F'],
    ['#rooms', null, 'room.html?from=rooms'],
    ['', null, 'room.html'],
  ])('hash %j, room %j → %s', (hash, id, want) => expect(roomHref(hash, id)).toBe(want));
});

describe('room-socket.js exitUrl', () => {
  it.each([
    ['?id=%23A3F&from=rooms', { matchmade: false }, 'index.html#rooms'],
    ['?id=%23A3F', { matchmade: false }, 'index.html'],
    ['?id=%23A3F&from=evil', {}, 'index.html'],
    ['?id=%23A3F&from=rooms', { matchmade: true }, 'index.html'],
    ['?from=rooms', null, 'index.html#rooms'],
  ])('%s %j → %s', (search, roomData, want) => expect(exitUrl(search, roomData)).toBe(want));
});
