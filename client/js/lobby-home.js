/**
 * lobby-home.js — the lobby's three screens and the "Chơi" dashboard (B195, R2).
 *
 * Screens follow the hash the shared Arena nav links to:
 *   ''            → home   (#screen-home: my games, today, live boards)
 *   '#rooms'      → rooms  (#panel-tables: the room list lobby.js renders)
 *   '#tournaments'→ tournaments (#panel-tournaments: tournaments.js)
 * Legacy `?tab=tournaments` (tournament.html's back link) still lands on tournaments.
 *
 * Dashboard data: GET /api/home (server/routes/home.js), polled while the
 * home screen is visible. All text goes in via textContent.
 */

import { setHeroTab } from './lobby.js?v=191';

const t = (k, v) => window.t(k, v);
const SCREENS = { home: 'screen-home', rooms: 'panel-tables', tournaments: 'panel-tournaments' };
const HASH = { home: '', rooms: '#rooms', tournaments: '#tournaments' };
const NAV = { home: 'lobby', rooms: 'rooms', tournaments: 'tournaments' };
const ACTION = { rooms: 'btn-create', tournaments: 'btn-create-tournament' };
const POLL_MS = 20000;

let current = null;
let pollTimer = null;
let lastData = null;

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function screenFromLocation() {
  if (new URLSearchParams(location.search).get('tab') === 'tournaments') return 'tournaments';
  if (location.hash === '#tournaments') return 'tournaments';
  if (location.hash === '#rooms') return 'rooms';
  return 'home';
}

export function showScreen(name) {
  if (!SCREENS[name]) name = 'home';
  current = name;
  for (const [key, id] of Object.entries(SCREENS)) {
    const node = document.getElementById(id);
    if (!node) continue;
    const on = key === name;
    node.classList.toggle('is-active', on);
    if (key === 'home') node.hidden = !on;
  }
  for (const [key, id] of Object.entries(ACTION)) {
    const btn = document.getElementById(id);
    if (btn) btn.hidden = key !== name;
  }
  const bar = document.getElementById('lobby-bar');
  if (bar) bar.hidden = name === 'home';
  setHeroTab(name === 'rooms' ? 'tables' : name);
  if (window.PlatformShell) window.PlatformShell.setActive(NAV[name]);
  const want = location.pathname + HASH[name];
  if (location.search || location.hash !== HASH[name]) history.replaceState(null, '', want);
  if (name === 'home') startPolling(); else stopPolling();
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** "Caro VN · 5+3" from a room's rule/timer fields; parts that are unknown are dropped. */
export function ruleLine(r) {
  const parts = [];
  if (r.winningRule) parts.push(t('rankings.cat_' + r.winningRule));
  if (r.timerMode === 'per_game' && r.timerSeconds) parts.push(Math.round(r.timerSeconds / 60) + '+' + (r.timerIncrementSeconds || 0));
  else if (r.timerMode === 'per_move' && r.timerSeconds) parts.push(t('home.per_move', { s: r.timerSeconds }));
  return parts.join(' · ');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** Small read-only board: grid + stones, last move marked. Not board.js (board/stones lock). */
export function miniBoard(size, stones, px = 96) {
  const n = Math.max(5, Math.min(30, size || 15));
  const c = px / (n + 1);
  const root = svg('svg', { viewBox: `0 0 ${px} ${px}`, class: 'hmini', role: 'img', 'aria-label': t('home.board_aria') });
  for (let i = 1; i <= n; i++) {
    root.appendChild(svg('line', { x1: c, y1: i * c, x2: n * c, y2: i * c }));
    root.appendChild(svg('line', { x1: i * c, y1: c, x2: i * c, y2: n * c }));
  }
  for (const [x, y, col] of stones || []) {
    if (x < 0 || y < 0 || x >= n || y >= n) continue;
    root.appendChild(svg('circle', { cx: (x + 1) * c, cy: (y + 1) * c, r: c * 0.43, class: col === 2 ? 'sw' : 'sb' }));
  }
  const last = stones && stones[stones.length - 1];
  if (last) root.appendChild(svg('circle', { cx: (last[0] + 1) * c, cy: (last[1] + 1) * c, r: c * 0.14, class: 'last' }));
  return root;
}

function row(title, meta, action, onClick, bullet) {
  const r = el(onClick ? 'button' : 'div', undefined, 'prow hrow');
  if (onClick) { r.type = 'button'; r.addEventListener('click', onClick); }
  if (bullet !== undefined) r.appendChild(el('span', undefined, 'hbullet' + (bullet ? ' on' : '')));
  const body = el('div', undefined, 'prow__body');
  body.append(el('div', title, 'prow__t'), el('div', meta, 'prow__m'));
  r.appendChild(body);
  if (action) r.appendChild(el('span', action, 'prow__act'));
  return r;
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderMine(data) {
  const box = document.getElementById('home-mine');
  if (!box) return;
  box.replaceChildren();
  const g = data.myGame;
  if (g) {
    const title = g.opponent ? t('home.vs', { name: g.opponent }) + (ruleLine(g) ? ' · ' + ruleLine(g) : '') : (g.roomName || '');
    const meta = g.state === 'playing' ? t(g.myTurn ? 'home.your_turn' : 'home.opp_turn') : t('home.waiting');
    box.appendChild(row(title, meta, t('home.go_game'), () => window.joinRoom(g.roomId), true));
  }
  for (const m of data.myMatches || []) {
    const title = m.tournamentName + (m.roundIndex !== null && m.roundIndex !== undefined ? ' · ' + t('home.round', { n: m.roundIndex + 1 }) : '');
    const meta = t('home.vs', { name: m.opponent }) + ' · ' + t('home.match_' + m.state);
    box.appendChild(row(title, meta, t('home.details'), () => {
      location.href = 'tournament.html?id=' + encodeURIComponent(m.tournamentId);
    }, m.state === 'Ready'));
  }
  if (!box.children.length) {
    const empty = el('div', undefined, 'hempty');
    const go = el('button', t('home.find_room'), 'link-action link-action--primary');
    go.type = 'button';
    go.addEventListener('click', () => showScreen('rooms'));
    empty.append(el('p', t('home.no_games'), 'muted small'), go);
    box.appendChild(empty);
  }
}

function renderToday(data) {
  const box = document.getElementById('home-today');
  if (!box) return;
  box.replaceChildren();
  for (const tr of data.tournaments || []) {
    const meta = [t('home.status_' + tr.status), t('home.players', { n: tr.playerCount }), t('tournaments.format_' + tr.format)].join(' · ');
    const act = tr.registered ? t('home.registered') : t(tr.status === 'draft' ? 'home.register' : 'home.view');
    box.appendChild(row(tr.name, meta, act, () => {
      location.href = 'tournament.html?id=' + encodeURIComponent(tr.tournamentId);
    }));
  }
  if (!box.children.length) box.appendChild(el('p', t('home.no_today'), 'muted small hempty'));
}

function renderLive(data) {
  const box = document.getElementById('home-live');
  if (!box) return;
  box.replaceChildren();
  for (const g of data.live || []) {
    const card = el('button', undefined, 'hlive');
    card.type = 'button';
    card.addEventListener('click', () => window.joinRoom(g.roomId));
    const text = el('span', undefined, 'hlive__t');
    text.append(el('span', t('home.live_vs', { a: g.black || '?', b: g.white || '?' })),
      el('span', [ruleLine(g), g.viewers > 0 ? t('home.viewers', { n: g.viewers }) : ''].filter(Boolean).join(' · '), 'muted small'));
    card.append(miniBoard(g.boardSize, g.stones), text);
    box.appendChild(card);
  }
  if (!box.children.length) box.appendChild(el('p', t('home.no_live'), 'muted small hempty'));
}

export function renderHome(data) {
  lastData = data;
  renderMine(data);
  renderToday(data);
  renderLive(data);
}

export async function loadHome() {
  try {
    const res = await fetch('/api/home', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    renderHome(await res.json());
  } catch {
    if (!lastData) renderHome({ myGame: null, myMatches: [], tournaments: [], live: [] });
  }
}

function startPolling() {
  stopPolling();
  loadHome();
  pollTimer = setInterval(() => { if (!document.hidden) loadHome(); }, POLL_MS);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ── Wiring ──────────────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => showScreen(screenFromLocation()));
// Shell "Chơi" link while already on the lobby: switch, don't reload.
document.querySelectorAll('#pl-shell a[data-tab="lobby"]').forEach((a) => a.addEventListener('click', (e) => {
  if (location.pathname.endsWith('/index.html') || location.pathname === '/') { e.preventDefault(); showScreen('home'); }
}));
window.addEventListener('langchange', () => { if (lastData) renderHome(lastData); });

showScreen(screenFromLocation());
