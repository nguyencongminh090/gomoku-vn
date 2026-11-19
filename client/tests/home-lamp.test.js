/**
 * #424 Home desktop "Một ngọn đèn": lamp maths, the wiring that moves it, and the page contract
 * (both actions on the real controls, the room-code form gone from desktop, phones untouched).
 * Layout itself is checked in the browser pass; jsdom has none.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const CSS = read('css/home-lamp.css');
const HTML = read('index.html');
const BODY = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SRC = read('js/home-lamp.js')
  .replace(/^export const (\w+)/gm, 'const $1 = window.__lamp.$1')
  .replace(/^export function (\w+)/gm, 'window.__lamp.$1 = $1;\nfunction $1')
  .replace(/^if \(typeof document[^\n]*\n/m, '');

let lamp;
beforeAll(() => {
  window.__lamp = { LAMP_MQ: '(min-width: 861px)' };
  window.eval(SRC);
  lamp = window.__lamp;
});

describe('lamp maths', () => {
  it.each([[900, 69], [680, 52], [1080, 83], [1, 1]])('cell for a %ipx table is %ipx', (h, c) => expect(lamp.lampCell(h)).toBe(c));

  it('centres the leftover pixels of the grid', () => {
    expect(lamp.lampOrigin(1440, 900, 69)).toEqual({ x: (1440 % 69) / 2, y: (900 % 69) / 2 });
  });

  it.each([[0, 324], [324, 324], [500, 500], [756, 756], [900, 756]])('keeps pointer y %i on the table band', (y, want) => {
    expect(lamp.clampLampY(y, 900)).toBeCloseTo(want);
  });

  it('places the same stones every time, one per intersection, inside the table, colours alternating', () => {
    const a = lamp.lampStones(1440, 900, 69);
    expect(a).toEqual(lamp.lampStones(1440, 900, 69));
    expect(a.length).toBeGreaterThan(20);
    expect(new Set(a.map((s) => s.col + ',' + s.row)).size).toBe(a.length);
    a.forEach((s, i) => { expect(s.black).toBe(i % 2 === 0); expect(s.row * 69).toBeLessThan(900); expect(s.col * 69).toBeLessThan(1440); });
  });

  it('survives a table narrower than the grid margin', () => {
    expect(() => lamp.lampStones(100, 900, 69)).not.toThrow();
  });

  it('keeps the board still: the inner layer cancels the window, on whole pixels', () => {
    const t = lamp.lampTransforms(100.4, 200.6, 300);
    expect(t.window).toBe('translate3d(100px, 201px, 0)');
    expect(t.under).toBe('translate3d(-100px, -201px, 0)');
  });

  it.each([[1.5, 100.4, 100.6666], [1.25, 100.4, 100.8], [2, 100.3, 100.5]])('snaps to whole device pixels at %f× scale', (dpr, v, want) => {
    expect(lamp.snapToDevice(v, dpr)).toBeCloseTo(want, 3);
    expect(Number.isInteger(Math.round(lamp.snapToDevice(v, dpr) * dpr * 1e6) / 1e6)).toBe(true);
  });

  it('butts the four dark plates against the lamp square', () => {
    const t = lamp.lampTransforms(500, 400, 300);
    expect(t.top).toBe('translate3d(0px, 100px, 0)');
    expect(t.bottom).toBe('translate3d(0px, 700px, 0)');
    expect(t.left).toBe('translate3d(200px, 100px, 0)');
    expect(t.right).toBe('translate3d(800px, 100px, 0)');
  });
});

describe('mountLamp', () => {
  let frames;
  const DEFAULT_MQ = { '(min-width: 861px)': true, '(hover: hover) and (pointer: fine)': true, '(prefers-reduced-motion: reduce)': false };
  const media = (q) => ({ matches: { ...DEFAULT_MQ, ...window.__mq }[q], addEventListener() {} });
  const box = (el, r) => { el.getBoundingClientRect = () => ({ left: r[0], top: r[1], width: r[2], height: r[3] }); };
  const flush = (n = 400) => { for (let i = 0; i < n && frames.length; i++) frames.shift()(); };

  function boot(mq = {}) {
    document.body.innerHTML = BODY;
    window.__mq = mq;
    window.matchMedia = media;
    frames = [];
    window.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
    const home = document.getElementById('screen-home');
    Object.defineProperty(home, 'clientWidth', { value: 1440, configurable: true });
    Object.defineProperty(home, 'clientHeight', { value: 900, configurable: true });
    box(home, [0, 0, 1440, 900]);
    box(document.getElementById('qm-play'), [100, 480, 400, 120]);
    box(document.getElementById('hub-rooms'), [1100, 490, 240, 100]);
    Object.defineProperty(document.querySelector('.hl-win'), 'offsetWidth', { value: 950, configurable: true });
    lamp.mountLamp(document, window);
    return home;
  }
  const win = () => document.querySelector('.hl-win').style.transform;

  it('rests on Chơi ngay and lights the table', () => {
    boot();
    expect(win()).toBe('translate3d(300px, 540px, 0)');
    expect(document.getElementById('home-lamp').classList.contains('is-lit')).toBe(true);
    expect(document.querySelectorAll('.hl-stones i').length).toBeGreaterThan(20);
  });

  it('glides to Phòng chơi on hover and to Chơi ngay on focus', () => {
    boot();
    const rooms = document.getElementById('hub-rooms');
    rooms.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 1200, clientY: 500 }));
    expect(win()).toBe('translate3d(300px, 540px, 0)');
    flush();
    expect(win()).toBe('translate3d(1220px, 540px, 0)');
    document.getElementById('qm-play').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    flush();
    expect(win()).toBe('translate3d(300px, 540px, 0)');
  });

  it('follows the pointer on the table, kept on the band, and returns when it leaves', () => {
    const home = boot();
    home.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 800, clientY: 10 }));
    flush();
    expect(win()).toBe('translate3d(800px, 324px, 0)');
    home.dispatchEvent(new MouseEvent('pointerleave'));
    flush();
    expect(win()).toBe('translate3d(300px, 540px, 0)');
  });

  it('stops requesting frames once the lamp arrives', () => {
    boot();
    document.getElementById('hub-rooms').dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    flush();
    expect(frames).toHaveLength(0);
  });

  it('reduced motion: no pointer following, controls move the light at once with no frames', () => {
    const home = boot({ '(prefers-reduced-motion: reduce)': true });
    home.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 800, clientY: 500 }));
    expect(win()).toBe('translate3d(300px, 540px, 0)');
    document.getElementById('hub-rooms').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(win()).toBe('translate3d(1220px, 540px, 0)');
    expect(frames).toHaveLength(0);
  });

  it('phones: builds nothing and ignores the pointer', () => {
    const home = boot({ '(min-width: 861px)': false });
    home.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(document.querySelectorAll('.hl-stones i')).toHaveLength(0);
    expect(document.getElementById('home-lamp').classList.contains('is-lit')).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('lights up with a real radius when Home first appears after opening on another tab', () => {
    document.body.innerHTML = BODY;
    window.__mq = {};
    window.matchMedia = media;
    frames = [];
    const home = document.getElementById('screen-home');
    const scene = document.getElementById('home-lamp');
    let shown = false;
    Object.defineProperty(home, 'clientWidth', { get: () => (shown ? 1440 : 0), configurable: true });
    Object.defineProperty(home, 'clientHeight', { get: () => (shown ? 900 : 0), configurable: true });
    box(home, [0, 0, 1440, 900]);
    box(document.getElementById('qm-play'), [100, 480, 400, 120]);
    Object.defineProperty(document.querySelector('.hl-win'), 'offsetWidth', { get: () => (scene.classList.contains('is-lit') ? 950 : 0), configurable: true }); // display:none until lit
    const api = lamp.mountLamp(document, window);
    shown = true;
    api.layout();
    expect(scene.style.getPropertyValue('--hl-lamp')).toBe('475px');
    expect(document.querySelector('.hl-d--r').style.transform).toBe('translate3d(775px, 65px, 0)');
  });

  it('waits while Home is hidden behind another tab', () => {
    document.body.innerHTML = BODY;
    window.__mq = {};
    window.matchMedia = media;
    lamp.mountLamp(document, window); // jsdom: clientWidth 0, like display:none
    expect(document.getElementById('home-lamp').classList.contains('is-lit')).toBe(false);
  });
});

describe('opening the lobby on another screen (no dark table flash)', () => {
  const preload = read('js/skin-preload.js');
  const start = (url) => {
    document.documentElement.removeAttribute('data-lobby-start');
    window.history.replaceState(null, '', url);
    window.eval(preload);
    return document.documentElement.getAttribute('data-lobby-start');
  };
  it.each(['/#rooms', '/index.html#tournaments', '/?tab=tournaments'])('%s starts with Home off', (url) => expect(start(url)).toBe('other'));
  it.each(['/', '/index.html', '/#other', '/room.html#rooms', '/?tab=tournamentsX'])('%s does not', (url) => expect(start(url)).toBeNull());
  it('lobby-home.js clears the flag whenever it shows a screen', () => {
    expect(read('js/lobby-home.js')).toMatch(/function showScreen[\s\S]{0,160}removeAttribute\('data-lobby-start'\)/);
  });
});

describe('page contract', () => {
  it('both actions are the real controls, with the desktop labels', () => {
    expect(HTML).toMatch(/id="qm-play"[\s\S]*?data-i18n="home\.play_now">Chơi ngay</);
    expect(HTML).toMatch(/id="hub-rooms" href="#rooms"[\s\S]*?data-i18n="home\.rooms_title">Phòng chơi</);
    expect(HTML).toMatch(/id="home-lamp-live">–</);
  });

  it('every new label exists in both languages', () => {
    const i18n = read('js/i18n.js');
    for (const k of ['home.lamp_a', 'home.lamp_b', 'home.play_now', 'home.rooms_title']) expect(i18n.split(`'${k}':`).length - 1).toBe(2);
  });

  const desktop = CSS.slice(CSS.indexOf('@media (min-width: 861px)'));
  const beforeDesktop = CSS.slice(0, CSS.indexOf('@media (min-width: 861px)'));

  it('phones get only the rule that hides the desktop parts: no font or photo download', () => {
    expect(beforeDesktop.replace(/\/\*[\s\S]*?\*\//g, '').trim()).toBe('.hl-scene, .hl-title, .hl-play, .hl-rooms { display: none; }');
    expect(desktop).toMatch(/@font-face/);
    expect(desktop).toMatch(/home-lamp-oak-1600\.webp/);
  });

  it('desktop hides the room-code entry and keeps the forum link', () => {
    expect(desktop).toMatch(/:is\(\.hq-q, \.hq-or, \.hq-code__hash, \.hq-code__box, \.hq-enter, \.hq-code__err/);
    expect(desktop).toMatch(/\.hq-chip\[href="\/forum"\] \{ display: inline-flex/);
  });

  it('the shell only changes while Home is on screen', () => {
    for (const line of desktop.split('\n').filter((l) => /\.pnav|#pl-shell/.test(l))) expect(line).toContain('body.zen-lobby:has(#screen-home:not([hidden]))');
  });

  it('never animates the stones or the grid', () => {
    expect(desktop).not.toMatch(/\.hl-(stones|grid)[^{]*\{[^}]*(transition|animation)/);
    expect(desktop).not.toMatch(/@keyframes/);
  });
});
