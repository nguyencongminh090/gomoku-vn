/**
 * @jest-environment jsdom
 */
/*
 * #390: a full lobby snapshot (lobby:update — first paint, every re-subscribe on tab switch /
 * visible tab / reconnect, langchange) rendered every card with a staggered fadeUp (0.04·i s delay,
 * `backwards` fill = invisible until the delay ends): 30 cards took ~1.9 s to settle, and the
 * inline delay hid cards even under prefers-reduced-motion. A snapshot now paints its cards at
 * once; only a card a patch adds still gets the (undelayed) entrance.
 * lobby.js opens a socket on import, so the render functions are cut from source and run on stubs.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/lobby.js'), 'utf8');
const slice = (from, to) => SRC.slice(SRC.indexOf(from), SRC.indexOf(to));
const BUILD = slice('function buildRoomRowHtml(', "/** 'live' (game running)");
const RENDER = slice('function renderRoomList(', "// Update an existing row's content in place");

const room = (roomId) => ({ roomId, state: 'playing', playerCount: 2, userCount: 3 });

beforeEach(() => {
  document.body.innerHTML = '<div id="room-list"></div>';
  window.eval(`
    var t = (k) => k;
    var roomListEl = document.getElementById('room-list');
    var cardClass = () => 'room-row rcard';
    var escapeAttr = (s) => String(s);
    var rowActionLabel = (r) => r.roomId;
    var buildRoomCardInner = () => '';
    var NEW_CARD_HTML = () => '<button id="btn-create"></button>';
    ${BUILD}
    ${RENDER}
  `);
});

const render = (rooms) => window.eval(`renderRoomList(${JSON.stringify(rooms)})`);
const cards = () => [...document.querySelectorAll('#room-list .room-row')];
const animated = (els) => els.filter((n) => n.classList.contains('animate-fade-up') || n.style.animationDelay);

it('first snapshot paints every card at once (no entrance, no delay)', () => {
  render(Array.from({ length: 30 }, (_, i) => room('R' + i)));
  expect(cards()).toHaveLength(30);
  expect(animated(cards())).toEqual([]);
});

it('a second snapshot (re-subscribe) adds no animation-delay to cards already shown', () => {
  render([room('A'), room('B')]);
  render([room('A'), room('B'), room('C')]);
  expect(cards().map((n) => n.dataset.roomId)).toEqual(['A', 'B', 'C']);
  expect(animated(cards())).toEqual([]);
  expect(document.getElementById('room-list').innerHTML).not.toMatch(/animation-delay/);
});

it('a card added by a patch keeps its entrance, with no delay', () => {
  const html = window.eval(`buildRoomRowHtml(${JSON.stringify(room('P'))}, { animate: true })`);
  expect(html).toMatch(/animate-fade-up/);
  expect(html).not.toMatch(/animation-delay: 0\.[0-9]*[1-9]/);
});
