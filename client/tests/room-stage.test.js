/**
 * #368 — phone "live stage" under the board (room-stage.js): player chat → speech bubble on the seat card,
 * spectator chat → pill in the stage, audience avatar stack + popover, 👏 reactions, tabs in a bottom sheet.
 * Replaces the #217 minimize/expand suite (that mode is gone); its #218 keyboard tests are kept below.
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'room-arena.css'), 'utf8');
const evalJs = (f) => window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));

const ME = { userId: 'u-me', displayName: 'Minh', isGuest: false };
const OPP = { userId: 'u-opp', displayName: 'Hoàng Long', slot: 2, avatarUrl: null };
const guest = (i, extra = {}) => ({ userId: 'g' + i, displayName: 'Khách ' + i, slot: null, avatarUrl: null, ...extra });

function load({ phone = true, users } = {}) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  document.body.className = 'arena-room';
  for (const k of ['roomPanelToggleBound', 'roomTabsBound', 'roomStageBound', 'roomKeyboardBound', 'roomRailDockBound']) delete document.body.dataset[k];
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ME) };
  window.t = jest.fn((k, v) => (v && v.n != null ? `${k}:${v.n}` : k));
  window.requestAnimationFrame = jest.fn((cb) => cb());
  window.SocketClient = class { emit() {} on() {} bindStatusBanner() {} };
  window.matchMedia = jest.fn(() => ({ matches: phone, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  window.EscapeUtils = { decodeChatText: (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>') };
  delete window.RoomStage;
  delete window.RoomUI;
  require('../js/room.js'); // publishes RoomState/RoomClient/RoomTabs — the stubs below replace the first two
  Object.assign(window.RoomState, { myRole: 'host', mySlot: 1, roomData: { state: 'waiting', users: users || [{ ...ME, slot: 1 }, OPP] } });
  window.RoomClient = { emit: jest.fn() };
  evalJs('chat-ui.js');
  evalJs('room-stage.js');
  // Seat cards as room-ui renders them: opponent on top (slot 2), me at the bottom (slot 1).
  document.getElementById('seatcard-top').dataset.slot = '2';
  document.getElementById('seatcard-bottom').dataset.slot = '1';
  Object.defineProperty(document.getElementById('stage'), 'clientHeight', { configurable: true, value: 160 });
}
const $ = (id) => document.getElementById(id);
const chat = (from, text, fromId) => window.ChatUI.appendChatMessage({ from, fromId, text, timestamp: 1 });

beforeEach(() => localStorage.clear());
afterEach(() => jest.useRealTimers());

describe('layout wiring', () => {
  test('phone: the chat input moves into the dock, before 👏 and the sheet button', () => {
    load();
    const wrap = $('chat-input-wrapper');
    expect(wrap.parentElement.id).toBe('rdock');
    expect(wrap.nextElementSibling.id).toBe('btn-react');
    expect($('btn-sheet').getAttribute('aria-expanded')).toBe('false');
    expect($('rsheet').hasAttribute('inert')).toBe(true);
  });
  test('desktop: nothing moves, chat stays in the Chat tab, the stage ignores messages', () => {
    load({ phone: false });
    expect($('chat-input-wrapper').closest('#tab-chat')).not.toBeNull();
    expect($('rsheet').hasAttribute('inert')).toBe(false);
    chat('Hoàng Long', 'hi', 'u-opp');
    expect($('speech-layer').children).toHaveLength(0);
    expect($('float-messages').children).toHaveLength(1); // the old toast, unchanged
  });
  test('the #217 toggle is gone from the page', () => {
    load();
    expect($('rpanel-toggle')).toBeNull();
    expect(document.querySelector('.rsheet .sidebar-tabs')).not.toBeNull();
  });
});

describe('chat routing', () => {
  test('a seated player → speech bubble at their card (top card = opponent), no float toast; full log still gets it', () => {
    load();
    chat('Hoàng Long', 'Ván này căng đấy', 'u-opp');
    const b = $('speech-layer').querySelector('.speech');
    expect(b.textContent).toBe('Ván này căng đấy');
    expect(b.dataset.slot).toBe('2');
    expect(b.classList.contains('speech--top')).toBe(true);
    expect($('float-messages').children).toHaveLength(0);
    expect($('chat-messages').textContent).toContain('Ván này căng đấy');
  });
  test('my own message → bubble on the bottom card; a newer line from the same player replaces the old bubble', () => {
    load();
    chat('Minh', 'một', 'u-me');
    chat('Minh', 'hai', 'u-me');
    const bubbles = $('speech-layer').querySelectorAll('.speech');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].textContent).toBe('hai');
    expect(bubbles[0].classList.contains('speech--bottom')).toBe(true);
  });
  test('bubbles fade after 4 s and leave the DOM', () => {
    jest.useFakeTimers();
    load();
    chat('Hoàng Long', 'x', 'u-opp');
    jest.advanceTimersByTime(4000);
    expect($('speech-layer').querySelector('.speech--out')).not.toBeNull();
    jest.advanceTimersByTime(400);
    expect($('speech-layer').children).toHaveLength(0);
  });
  test('a spectator → pill in the stage, at most 3, text never parsed as markup', () => {
    load({ users: [{ ...ME, slot: 1 }, OPP, guest(1), guest(2)] });
    chat('Khách 1', '&lt;img src=x onerror=alert(1)&gt;', 'g1');
    for (let i = 0; i < 4; i++) chat('Khách 2', 'n' + i, 'g2');
    const pills = $('stage-fly').querySelectorAll('.fly');
    expect(pills).toHaveLength(3);
    expect(pills[2].querySelector('.fly__text').textContent).toBe('Khách 2 n3');
    expect($('stage-fly').querySelector('img')).toBeNull();
    expect($('float-messages').children).toHaveLength(0);
  });
  test('an unknown sender (already left) counts as audience', () => {
    load();
    chat('Ai đó', 'chào', 'gone');
    expect($('stage-fly').textContent).toContain('chào');
  });
  test('stage squeezed (short phone) → only the newest pill shows, never the old dark toast', () => {
    load({ users: [{ ...ME, slot: 1 }, OPP, guest(1)] });
    Object.defineProperty($('stage'), 'clientHeight', { configurable: true, value: 18 });
    chat('Khách 1', 'một', 'g1');
    chat('Khách 1', 'hai', 'g1');
    expect($('stage-fly').children).toHaveLength(1);
    expect($('stage-fly').textContent).toContain('hai');
    expect($('float-messages').children).toHaveLength(0);
  });
  test('CSS: open sheet hides bubbles/pills; tab icons out-specify .tab-btn > .icon; fades are not overridden by a held keyframe', () => {
    expect(CSS).toMatch(/body\.arena-room\.stage-sheet-open \.speech-layer, body\.arena-room\.stage-sheet-open \.stage__fly \{ display: none; \}/);
    expect(CSS).toMatch(/body\.arena-room \.tab-btn > \.tab-btn__icon--phone \{ display: none; \}/);
    expect(CSS).toMatch(/body\.arena-room \.tab-btn > \.tab-btn__icon--desk/);
    expect(CSS).not.toMatch(/stage-rise .32s var\(--ease-out\) both|stage-pop .3s var\(--ease-out\) both/);
  });
  test('system lines stay in the log only', () => {
    load();
    window.ChatUI.appendChatMessage({ isSystem: true, text: 'Ván mới', timestamp: 1 });
    expect($('speech-layer').children).toHaveLength(0);
    expect($('stage-fly').children).toHaveLength(0);
    expect($('sheet-badge').hidden).toBe(true);
  });
});

describe('sheet + unread badge', () => {
  test('messages while the sheet is closed count up; opening jumps to Chat and clears', () => {
    load();
    window.RoomTabs.activate('tab-moves');
    chat('Hoàng Long', 'a', 'u-opp');
    chat('Hoàng Long', 'b', 'u-opp');
    expect($('sheet-badge').hidden).toBe(false);
    expect($('sheet-badge').textContent).toBe('2');
    $('btn-sheet').click();
    expect(document.body.classList.contains('stage-sheet-open')).toBe(true);
    expect($('btn-sheet').getAttribute('aria-expanded')).toBe('true');
    expect($('rsheet').hasAttribute('inert')).toBe(false);
    expect($('tab-chat').classList.contains('tab-content--active')).toBe(true);
    expect($('sheet-badge').hidden).toBe(true);
  });
  test('reading Chat in the open sheet does not count; another tab does', () => {
    load();
    $('btn-sheet').click();
    chat('Hoàng Long', 'a', 'u-opp');
    expect($('sheet-badge').hidden).toBe(true);
    document.querySelector('.tab-btn[data-tab="tab-users"]').click();
    chat('Hoàng Long', 'b', 'u-opp');
    expect($('sheet-badge').textContent).toBe('1');
    document.querySelector('.tab-btn[data-tab="tab-chat"]').click();
    expect($('sheet-badge').hidden).toBe(true);
  });
  test('scrim, grab, sheet button and Escape close it', () => {
    load();
    for (const close of [() => $('rsheet-scrim').click(), () => $('rsheet-grab').click(), () => $('btn-sheet').click(),
      () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))]) {
      $('btn-sheet').click();
      expect(document.body.classList.contains('stage-sheet-open')).toBe(true);
      close();
      expect(document.body.classList.contains('stage-sheet-open')).toBe(false);
      expect($('rsheet').hasAttribute('inert')).toBe(true);
      expect($('rsheet-scrim').hidden).toBe(true);
    }
  });
  test('9+ cap on the badge', () => {
    load();
    window.RoomStage._setUnread(12);
    expect($('sheet-badge').textContent).toBe('9+');
  });
});

describe('reactions', () => {
  test('👏 plays a local burst (mockup C: 👏🔥❤️👏😮, staggered) and emits room:react once per 250 ms', () => {
    jest.useFakeTimers();
    load();
    $('btn-react').click();
    $('btn-react').click();
    expect(window.RoomClient.emit).toHaveBeenCalledTimes(1);
    expect(window.RoomClient.emit).toHaveBeenCalledWith('room:react', { kind: 'clap' });
    expect($('stage-reacts').textContent).toBe('👏🔥❤️👏😮');
    expect([...$('stage-reacts').children].map((e) => e.style.animationDelay)).toEqual(['0ms', '150ms', '300ms', '500ms', '700ms']);
    jest.advanceTimersByTime(300);
    $('btn-react').click();
    expect(window.RoomClient.emit).toHaveBeenCalledTimes(2);
  });
  test('incoming: a known kind leads its burst, unknown ones are ignored; capped at 25 on screen', () => {
    load();
    window.RoomStage.onReact({ kind: 'heart', fromId: 'g1' });
    window.RoomStage.onReact({ kind: '<script>', fromId: 'g1' });
    window.RoomStage.onReact(null);
    expect($('stage-reacts').children).toHaveLength(5);
    expect($('stage-reacts').firstElementChild.textContent).toBe('❤️');
    for (let i = 0; i < 30; i++) window.RoomStage.onReact({ kind: 'fire' });
    expect($('stage-reacts').children).toHaveLength(25);
  });
  test('desktop ignores incoming reactions', () => {
    load({ phone: false });
    window.RoomStage.onReact({ kind: 'clap' });
    expect($('stage-reacts').children).toHaveLength(0);
  });
});

describe('audience stack', () => {
  test('hidden with no spectators', () => {
    load();
    window.RoomStage.renderAudience([]);
    expect($('aud-stack').hidden).toBe(true);
  });
  test('3 faces + "+N", count in the label; tap opens the names; Escape / outside tap closes', () => {
    load();
    const list = [1, 2, 3, 4, 5].map((i) => guest(i));
    window.RoomStage.renderAudience(list);
    const btn = $('aud-stack');
    expect(btn.hidden).toBe(false);
    expect(btn.querySelectorAll('.aud__av')).toHaveLength(3);
    expect(btn.querySelector('.aud__more').textContent).toBe('+2');
    expect(btn.getAttribute('aria-label')).toBe('room.audience_count:5');
    btn.click();
    expect($('aud-pop').hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect($('aud-pop').querySelectorAll('li')).toHaveLength(5);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect($('aud-pop').hidden).toBe(true);
    btn.click();
    document.getElementById('board-area-shell').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect($('aud-pop').hidden).toBe(true);
  });
  test('host can still remove a spectator from the popover (not during a game, never themself)', () => {
    load();
    window.RoomStage.renderAudience([guest(1), guest(2)]);
    expect($('aud-pop').querySelectorAll('[data-action="kickUser"]')).toHaveLength(2);
    window.RoomState.roomData.state = 'playing';
    window.RoomStage.renderAudience([guest(1)]);
    expect($('aud-pop').querySelectorAll('[data-action="kickUser"]')).toHaveLength(0);
    window.RoomState.roomData.state = 'waiting';
    window.RoomState.myRole = 'guest';
    window.RoomStage.renderAudience([guest(1)]);
    expect($('aud-pop').querySelectorAll('[data-action="kickUser"]')).toHaveLength(0);
  });
  test('faces come from RoomUI.avatarInner (same as the seat cards); names are escaped', () => {
    load();
    window.RoomUI = { avatarInner: jest.fn((u) => (u.avatarUrl ? `<img class="seatcard__img" src="${u.avatarUrl}" data-ini="K">` : 'K')) };
    window.RoomStage.renderAudience([guest(1, { avatarUrl: '/api/profile/avatar/g1.webp?v=3', displayName: '<b>x</b>' })]);
    expect(window.RoomUI.avatarInner).toHaveBeenCalled();
    expect($('aud-stack').querySelector('img').getAttribute('src')).toBe('/api/profile/avatar/g1.webp?v=3');
    expect($('aud-pop').querySelector('b')).toBeNull();
    expect($('aud-pop').textContent).toContain('<b>x</b>');
  });
});

describe('#218 keyboard: keep the chat field in view when the viewport shrinks', () => {
  function loadWithViewport() {
    const vv = new EventTarget();
    window.visualViewport = vv;
    load();
    const bar = $('chat-input-wrapper');
    bar.scrollIntoView = jest.fn();
    return { vv, bar };
  }
  afterEach(() => { delete window.visualViewport; });
  test('resize while the chat field is focused scrolls the input bar into view (bottom edge)', () => {
    const { vv, bar } = loadWithViewport();
    $('chat-input').focus();
    vv.dispatchEvent(new Event('resize'));
    expect(bar.scrollIntoView).toHaveBeenCalledWith({ block: 'end', inline: 'nearest' });
  });
  test('resize without focus (rotation, toolbar) does nothing', () => {
    const { vv, bar } = loadWithViewport();
    vv.dispatchEvent(new Event('resize'));
    expect(bar.scrollIntoView).not.toHaveBeenCalled();
  });
});

test('#327 CSS: phone touch targets stay 44px (leave, input, send, dock buttons, audience)', () => {
  expect(CSS).toMatch(/#btn-leave \{ min-width: 44px; min-height: 44px; \}/);
  expect(CSS).toMatch(/\.chat-input input, body\.arena-room \.chat-input button \{ min-height: 44px; \}/);
  expect(CSS).toMatch(/\.rdock__btn \{[^}]*width: 44px; height: 44px;/);
  expect(CSS).toMatch(/body\.arena-room \.aud \{[^}]*min-height: 44px;/);
});

test('reduced motion: no floating/rising, the sheet just appears', () => {
  const rm = CSS.slice(CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  expect(rm).toMatch(/\.fly, body\.arena-room \.speech, body\.arena-room \.aud-pop, body\.arena-room \.rsheet-scrim \{ animation: none; \}/);
  expect(rm).toMatch(/\.rsheet, body\.arena-room\.stage-sheet-open \.rsheet \{ transition: none; \}/);
});

describe('mockup C details', () => {
  test('dock placeholder is "Bình luận…" on phones, back to the chat one on desktop', () => {
    load();
    expect($('chat-input').placeholder).toBe('room.ph_comment');
    expect($('chat-input').getAttribute('data-i18n-placeholder')).toBe('room.ph_comment'); // survives applyTranslations()
    load({ phone: false });
    expect($('chat-input').placeholder).toBe('Nhập tin nhắn...');
  });
  test('CSS: send button only while typing; sheet tabs are text pills; the stage handle exists', () => {
    expect(CSS).toMatch(/\.rdock \.chat-input:has\(#chat-input:placeholder-shown\) #btn-send \{ display: none; \}/);
    expect(CSS).toMatch(/\.rsheet \.tab-btn > \.icon \{ display: none; \}/);
    expect(CSS).toMatch(/\.rsheet \.tab-btn--active \{ background: var\(--c-brand\)/);
    expect($('stage-handle') || (load(), $('stage-handle'))).not.toBeNull();
  });
  test('handle tap and a swipe up on the stage open the sheet; a short drag does not', () => {
    load();
    $('stage-handle').click();
    expect(document.body.classList.contains('stage-sheet-open')).toBe(true);
    window.RoomStage.setSheetOpen(false);
    const ev = (type, y) => { const e = new Event(type, { bubbles: true }); e.clientY = y; return e; };
    $('stage').dispatchEvent(ev('pointerdown', 300)); $('stage').dispatchEvent(ev('pointerup', 290));
    expect(document.body.classList.contains('stage-sheet-open')).toBe(false);
    $('stage').dispatchEvent(ev('pointerdown', 300)); $('stage').dispatchEvent(ev('pointerup', 250));
    expect(document.body.classList.contains('stage-sheet-open')).toBe(true);
  });
  test('chat lines carry a face and "· người chơi" for seated players (shown only in the phone sheet)', () => {
    load({ users: [{ ...ME, slot: 1 }, OPP, guest(1)] });
    window.RoomUI = { avatarInner: (u) => 'AV:' + u.displayName };
    chat('Hoàng Long', 'a', 'u-opp');
    chat('Khách 1', 'b', 'g1');
    chat('Minh', 'c', 'u-me');
    const [opp, g, me] = [...$('chat-messages').querySelectorAll('.chat-msg')];
    expect(opp.classList.contains('chat-msg--player')).toBe(true);
    expect(opp.querySelector('.chat-msg__av').textContent).toBe('AV:Hoàng Long');
    expect(opp.querySelector('.chat-msg__tag').textContent).toBe(' · room.player_tag');
    expect(g.querySelector('.chat-msg__tag')).toBeNull();
    expect(me.querySelector('.chat-msg__av')).toBeNull(); // mine: green bubble on the right, no face
    expect(CSS).toMatch(/body\.arena-room \.chat-msg__av, body\.arena-room \.chat-msg__tag \{ display: none; \}/);
  });
});

describe('Tỉ số tab (score hero)', () => {
  const g = (n, winnerId, moves = 41, durationMs = 492000) => ({ n, winnerId, reason: 'win', moves, durationMs,
    players: [{ userId: 'u-me', name: 'Minh', color: 'BLACK' }, { userId: 'u-opp', name: 'Hoàng Long', color: 'WHITE' }] });
  test('empty without games → the empty line shows (hero empty)', () => {
    load();
    window.RoomStage.renderScores();
    expect($('score-hero').innerHTML).toBe('');
  });
  test('opponent left, me right; wins from scoreTable; dots from the log (green = right won); one row per game + the live one', () => {
    load();
    Object.assign(window.RoomState.roomData, {
      scoreTable: { 'u-me': { win: 2 }, 'u-opp': { win: 1 } },
      gameLog: [g(1, 'u-me'), g(2, 'u-opp', 27, 340000), g(3, 'draw', 55, 663000)],
    });
    window.RoomState.gameState = { status: 'ongoing', moveHistory: [1, 2, 3, 4] };
    window.RoomStage.renderScores();
    const box = $('score-hero');
    expect([...box.querySelectorAll('.score-hero__name')].map((e) => e.textContent)).toEqual(['Hoàng Long', 'Minh']);
    expect(box.querySelector('.score-hero__num').textContent).toBe('1–2');
    expect([...box.querySelectorAll('.score-dot')].map((d) => d.className.replace('score-dot ', ''))).toEqual(['score-dot--r', 'score-dot--l', 'score-dot--d']);
    const rows = [...box.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(rows[0]).toEqual(['room.game_n:1', 'room.game_won', 'room.game_moves:41', '8:12']);
    expect(rows[1][3]).toBe('5:40');
    expect(rows[2][1]).toBe('room.game_draw');
    expect(rows[3][1]).toBe('room.game_playing');
    expect(rows).toHaveLength(4);
  });
  test('quick-match session: empty dots for the games still to play', () => {
    load();
    Object.assign(window.RoomState.roomData, { matchMax: 3, gameLog: [g(1, 'u-opp')] });
    window.RoomStage.renderScores();
    expect($('score-hero').querySelectorAll('.score-dot')).toHaveLength(3);
    expect($('score-hero').querySelectorAll('.score-dot--l')).toHaveLength(1);
  });
  test('names are escaped', () => {
    load({ users: [{ ...ME, slot: 1 }, { ...OPP, displayName: '<img src=x>' }] });
    window.RoomState.roomData.gameLog = [g(1, 'u-me')];
    window.RoomStage.renderScores();
    expect($('score-hero').querySelector('img')).toBeNull();
  });
  test('missing duration shows a dash', () => {
    load();
    window.RoomState.roomData.gameLog = [g(1, 'u-me', 9, null)];
    window.RoomStage.renderScores();
    expect($('score-hero').querySelector('td:last-child').textContent).toBe('—');
  });
});
