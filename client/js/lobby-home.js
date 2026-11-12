/**
 * lobby-home.js — the lobby's three screens and the "Chơi" dashboard (B195, R2).
 *
 * Screens follow the hash the shared Arena nav links to:
 *   ''            → home   (#screen-home, #358 M4: greeting + online, news line, resume strip, quick-match sentence + room code, count cards)
 *   '#rooms'      → rooms  (#panel-tables: the room list lobby.js renders)
 *   '#tournaments'→ tournaments (#panel-tournaments: tournaments.js)
 * Legacy `?tab=tournaments` (tournament.html's back link) still lands on tournaments.
 *
 * Dashboard data: GET /api/home (server/routes/home.js) on entering the home
 * screen, then a 60 s fallback poll. Between polls the server pushes the stats
 * strip and the live list (B225: home:subscribe → home:stats / home:live,
 * server/socket/home-feed.js) — only while the home screen is shown and the tab visible. Quick match (B197): match:* socket events
 * (server/socket/handlers/MatchHandler.js); a pair arrives as room:joined,
 * which lobby.js already follows into room.html. All text goes in via textContent.
 */

import { client, setHeroTab } from './lobby.js?v=7cb74e0c';

const t = (k, v) => window.t(k, v);
const SCREENS = { home: 'screen-home', rooms: 'panel-tables', tournaments: 'panel-tournaments' };
const HASH = { home: '', rooms: '#rooms', tournaments: '#tournaments' };
const NAV = { home: 'lobby', rooms: 'rooms', tournaments: 'tournaments' };
const ACTION = { rooms: ['btn-create', 'btn-join-code'], tournaments: ['btn-create-tournament'] };
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{3}$/; // RoomManager._generateRoomId: '#' + 3 chars, no I O 0 1
const POLL_MS = 60000; // fallback only — stats + live list arrive by push (B225)

let current = null;
let pollTimer = null;
let lastData = null;
let lastJson = '';
let subscribed = false; // in the server's `home` socket room
let lobbySubscribed = false; // in the server's `lobby` socket room (rooms screen only, B229)

/** Leading sprite icon (B212, #214); a no-op before platform-shell.js has loaded. */
function withIcon(node, name) { if (name && window.PlatformShell) node.prepend(window.PlatformShell.icon(name)); return node; }

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
  for (const [key, ids] of Object.entries(ACTION)) {
    for (const id of ids) {
      const btn = document.getElementById(id);
      if (btn) btn.hidden = key !== name;
    }
  }
  if (name !== 'rooms') closeJoinCode();
  const bar = document.getElementById('lobby-bar');
  if (bar) bar.hidden = name !== 'tournaments';
  setHeroTab(name === 'rooms' ? 'tables' : name);
  if (window.PlatformShell) window.PlatformShell.setActive(NAV[name]);
  const want = location.pathname + HASH[name];
  if (location.search || location.hash !== HASH[name]) history.replaceState(null, '', want);
  if (name === 'home') startPolling(); else stopPolling();
  setSubscribed(name === 'home' && !document.hidden);
  setLobbySubscribed(name === 'rooms' && !document.hidden);
}

// ── Vào bằng mã (Phòng screen): type the 3-char room code, go straight to the room ──

function closeJoinCode() {
  const form = document.getElementById('join-code-form');
  const btn = document.getElementById('btn-join-code');
  if (form) form.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/** "#a3f" / "a3f " / "A3F" → "#A3F"; null when it cannot be a room code. */
export function parseRoomCode(raw) {
  const code = String(raw || '').trim().replace(/^#/, '').toUpperCase();
  return ROOM_CODE.test(code) ? '#' + code : null;
}

function wireJoinCode() {
  const btn = document.getElementById('btn-join-code');
  const form = document.getElementById('join-code-form');
  const input = document.getElementById('join-code');
  const err = document.getElementById('join-code-error');
  if (!btn || !form || !input) return;
  btn.addEventListener('click', () => {
    form.hidden = !form.hidden;
    btn.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) input.focus();
  });
  input.addEventListener('input', () => { err.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = parseRoomCode(input.value);
    if (!id) { err.textContent = t('lobby.join_code_invalid'); err.hidden = false; input.focus(); return; }
    window.joinRoom(id);
  });
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** "10" for whole minutes, else "90s". */
function clockAmount(sec) {
  return sec % 60 === 0 ? String(sec / 60) : sec + 's';
}

/**
 * "Caro VN · 5+3" from a room's rule/timer fields; unknown parts are dropped.
 * Only blitz carries an increment (TimerManager.applyMove) — per_game is a bare total (B196).
 */
export function ruleLine(r) {
  return ruleParts(r).join(' · ');
}

/** Same parts as ruleLine, kept separate so a ticket can lay them out as spaced segments (no "·" strings). */
function ruleParts(r) {
  const parts = [];
  if (r.winningRule) parts.push(t('rankings.cat_' + r.winningRule));
  if (r.timerSeconds) {
    if (r.timerMode === 'blitz') parts.push(clockAmount(r.timerSeconds) + '+' + (r.timerIncrementSeconds || 0));
    else if (r.timerMode === 'per_game') {
      parts.push(r.timerSeconds % 60 === 0 ? t('home.per_game', { m: r.timerSeconds / 60 }) : t('home.per_game_s', { s: r.timerSeconds }));
    }
    else if (r.timerMode === 'per_move') parts.push(t('home.per_move', { s: r.timerSeconds }));
  }
  return parts;
}

/** meta: a string or an array of segments — segments render as separate spans, spaced by CSS gap. */
function row(title, meta, action, onClick, bullet) {
  const r = el(onClick ? 'button' : 'div', undefined, 'prow hrow');
  if (onClick) { r.type = 'button'; r.addEventListener('click', onClick); }
  if (bullet !== undefined) r.appendChild(el('span', undefined, 'hbullet' + (bullet ? ' on' : '')));
  const body = el('div', undefined, 'prow__body');
  const metaBox = el('div', undefined, 'prow__m hrow__meta');
  for (const part of [].concat(meta)) if (part) metaBox.appendChild(el('span', part));
  body.append(el('div', title, 'prow__t'), metaBox);
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
    const title = g.opponent ? t('home.vs', { name: g.opponent }) : (g.roomName || '');
    const meta = [...(g.opponent ? ruleParts(g) : []), g.state === 'playing' ? t(g.myTurn ? 'home.your_turn' : 'home.opp_turn') : t('home.waiting')];
    box.appendChild(row(title, meta, t('home.go_game'), () => window.joinRoom(g.roomId), true));
  }
  for (const m of data.myMatches || []) {
    const title = m.tournamentName;
    const meta = [m.roundIndex !== null && m.roundIndex !== undefined ? t('home.round', { n: m.roundIndex + 1 }) : '', t('home.vs', { name: m.opponent }), t('home.match_' + m.state)];
    box.appendChild(row(title, meta, t('home.details'), () => {
      location.href = 'tournament.html?id=' + encodeURIComponent(m.tournamentId);
    }, m.state === 'Ready'));
  }
  const card = document.getElementById('home-mine-card');
  if (card) card.hidden = !box.children.length; // nothing to resume → the card is gone, Home stays two buttons
}

/** Greeting row (#358): "Chào <b>name</b>" — the name is user text, so it goes in as a text node; guests get the plain greeting. */
function renderHello() {
  const box = document.getElementById('home-hello');
  if (!box) return;
  const u = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
  if (!u || u.isGuest || !u.displayName) { box.textContent = t('home.hello_anon'); return; }
  const [before, after = ''] = t('home.hello', { name: '%%name%%' }).split('%%name%%');
  box.replaceChildren(before, el('b', u.displayName), after);
}

/** Counts (B223) → the online tag in the greeting row + the two right-column cards (#358). Empty state is text, not a blank card. */
function renderStats(data) {
  const st = data.stats;
  const online = document.getElementById('home-online');
  if (online) {
    online.hidden = !st || !st.online;
    if (!online.hidden) online.replaceChildren(el('span', undefined, 'hq-online__dot'), el('span', t('home.online', { n: st.online })));
  }
  const fill = (numId, labelId, n, parts, none) => {
    const num = document.getElementById(numId);
    const label = document.getElementById(labelId);
    if (!num || !label) return;
    num.textContent = st ? String(n || 0) : '–';
    num.classList.toggle('is-zero', !n);
    label.replaceChildren(...(n ? parts : [none]).filter(Boolean).map((p) => el('span', p)));
  };
  const eta = data.queueEta ? data.queueEta[qm.rule + '|' + qm.time] || 0 : 0;
  fill('home-n-search', 'home-n-search-l', st && st.searching, [t('home.unit_people'), eta && t('home.eta_short', { s: eta })], st && t('home.none_searching'));
  fill('home-n-live', 'home-n-live-l', st && st.playing, [t('home.unit_games')], st && t('home.none_playing'));
  const one = document.getElementById('home-live-one');
  if (!one) return;
  const g = (data.live || [])[0];
  one.replaceChildren();
  if (!g || !g.black || !g.white) return;
  const b = el('button', undefined, 'hq-live');
  b.type = 'button';
  b.append(el('span', g.black + ' vs ' + g.white, 'hq-live__t'), el('span', t('home.moves', { n: g.moves || 0 }), 'hq-live__m'));
  b.addEventListener('click', () => window.joinRoom(g.roomId));
  one.appendChild(b);
}

/** Same-site path only — the server already enforces it; this guards a stale/odd payload too. */
const SAFE_LINK = /^\/(?![/\\])[^\s\\]*$/;

/** One admin news line (#224) under the stats strip; a link makes the whole line clickable. */
function renderNews(data) {
  const box = document.getElementById('home-news');
  if (!box) return;
  const n = data.news;
  box.replaceChildren();
  box.hidden = !(n && n.body);
  if (box.hidden) return;
  const line = SAFE_LINK.test(n.link || '') ? el('a', undefined, 'hnews__line') : el('p', undefined, 'hnews__line');
  if (line.tagName === 'A') line.href = n.link;
  line.append(el('span', t('home.news'), 'hnews__tag'), el('span', n.body, 'hnews__body'));
  if (line.tagName === 'A') line.appendChild(el('span', '›', 'hnews__go'));
  box.appendChild(line);
}

export function renderHome(data) {
  lastData = data;
  lastJson = JSON.stringify(data);
  renderStats(data);
  renderNews(data);
  renderMine(data);
  renderQuickMatch(); // the "N đang chờ" count comes with /api/home
}

export async function loadHome() {
  try {
    // First call takes the request api-early.js started during parsing (#263); polls fetch fresh.
    const init = { credentials: 'same-origin' };
    const res = await (window.GvnEarly ? window.GvnEarly.fetch('/api/home', init) : fetch('/api/home', init));
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (JSON.stringify(data) !== lastJson) renderHome(data); // unchanged poll → no DOM rebuild
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

// ── Live push (B225) ────────────────────────────────────────────────────────

function setSubscribed(on) {
  if (on === subscribed) return;
  subscribed = on;
  client.emit(on ? 'home:subscribe' : 'home:unsubscribe');
}

function setLobbySubscribed(on) {
  if (on === lobbySubscribed) return;
  lobbySubscribed = on;
  client.emit(on ? 'lobby:subscribe' : 'lobby:unsubscribe'); // subscribe answers with a full snapshot
}

/** Merge one pushed field into the last /api/home payload and redraw only its section. */
function applyPush(key, value, render) {
  if (current !== 'home') return;
  lastData = { ...(lastData || { myGame: null, myMatches: [], tournaments: [], live: [] }), [key]: value };
  lastJson = JSON.stringify(lastData);
  render(lastData);
}

client.on('home:stats', (st) => applyPush('stats', st, renderStats));
// A reconnect is a fresh server socket outside every room: subscribe again and resync the rest.
client.on('disconnect', () => { subscribed = false; lobbySubscribed = false; });
client.on('connect', () => {
  if (current === 'rooms' && !document.hidden) setLobbySubscribed(true);
  if (current !== 'home' || document.hidden || subscribed) return;
  setSubscribed(true);
  loadHome();
});

// ── Quick match (B197) — #358 M4: the options are the blanks of one sentence ──

const QM_RULES = ['freestyle', 'caro']; // Home menu: two rules (Standard stays reachable via rooms)
const QM_TIMES_GAME = ['1+0', '1+1', '3+2', '5+3', '7+3', '10+0']; // total + increment per move
const QM_TIMES_MOVE = ['m60', 'm45', 'm30', 'm5']; // seconds per move
const QM_AUTO = 'auto'; // no clock preference: pairs with anyone, adopts the other side's clock (default 60s/nước)
const QM_MENU_TIMES = [QM_AUTO, 'm45', 'm30', '1+1']; // Home menu: Auto + 45s / 30s per move + 1p+1s
const QM_TIMES = [QM_AUTO, ...QM_TIMES_GAME, ...QM_TIMES_MOVE]; // still accepted from a saved pick
const qmTimeLabel = (v) => (v === QM_AUTO ? t('qm.time_auto') : v[0] === 'm' ? t('home.per_move', { s: v.slice(1) }) : v);
const QM_KEY = 'gvn_quickmatch';
const qm = { rule: 'caro', time: QM_AUTO, wall: true, portal: false, rated: true, searching: false, startedAt: 0, inBucket: 0, error: '' };
let qmTimer = null;

try {
  const saved = JSON.parse(localStorage.getItem(QM_KEY) || 'null');
  if (saved && QM_RULES.includes(saved.rule)) qm.rule = saved.rule;
  if (saved && QM_TIMES.includes(saved.time)) qm.time = saved.time;
  if (saved && typeof saved.rated === 'boolean') qm.rated = saved.rated;
  qm.wall = saved && typeof saved.wall === 'boolean' ? saved.wall : true;
  qm.portal = !!saved && saved.portal === true;
} catch { /* per-viewer convenience only */ }

function saveQm() {
  try { localStorage.setItem(QM_KEY, JSON.stringify({ rule: qm.rule, time: qm.time, wall: qm.wall, portal: qm.portal, rated: qm.rated })); } catch { /* ignore */ }
}

function isMember() {
  const u = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
  return !!(u && !u.isGuest);
}

/** Per blank: the field it sets, the values offered (a saved pick outside the menu stays listed, nothing silently changes),
 *  the label inside the listbox and the (lower-case, mid-sentence) label in the blank itself. */
const BLANKS = {
  rule: { field: 'rule', aria: 'qm.pick_rule', values: () => (QM_RULES.includes(qm.rule) ? QM_RULES : [...QM_RULES, qm.rule]),
    option: (v) => t('rankings.cat_' + v), blank: (v) => t('rankings.cat_' + v) },
  time: { field: 'time', aria: 'qm.pick_time', values: () => (QM_MENU_TIMES.includes(qm.time) ? QM_MENU_TIMES : [...QM_MENU_TIMES, qm.time]),
    option: qmTimeLabel, blank: (v) => (v === QM_AUTO ? t('qm.blank_time_auto') : qmTimeLabel(v)) },
  mode: { field: 'rated', aria: 'qm.pick_mode', values: () => [true, false],
    option: (v) => t(v ? 'qm.find_rated' : 'qm.find_casual'), blank: (v) => t(v ? 'qm.blank_rated' : 'qm.blank_casual') },
};
let openBlank = null; // key of BLANKS while #qm-pick is open

/** "Tìm cho tôi một ván [rule], [time], [mode]." — the template comes from i18n, the blanks are buttons (listbox pattern).
 *  Guests can only play casual, so their mode blank is plain text, not a control. */
function renderSentence() {
  const h = document.getElementById('home-q');
  if (!h) return;
  const member = isMember();
  // The sentence is rebuilt on every render (1 s ticker, picks): keep keyboard focus on the same blank.
  const focused = h.contains(document.activeElement) ? document.activeElement.dataset.blank : null;
  const parts = t('home.q', { rule: '%%rule%%', time: '%%time%%', mode: '%%mode%%' }).split(/%%(rule|time|mode)%%/);
  h.replaceChildren(...parts.map((p, i) => {
    if (i % 2 === 0) return document.createTextNode(p);
    const spec = BLANKS[p];
    if (p === 'mode' && !member) return el('span', spec.blank(false), 'hq-blank hq-blank--fixed');
    const b = el('button', spec.blank(qm[spec.field]), 'hq-blank');
    b.type = 'button';
    b.dataset.blank = p;
    b.disabled = qm.searching;
    b.setAttribute('aria-haspopup', 'listbox');
    b.setAttribute('aria-controls', 'qm-pick');
    b.setAttribute('aria-expanded', String(openBlank === p));
    b.addEventListener('click', (e) => { e.stopPropagation(); if (openBlank === p) closePick(true); else openPick(p); });
    b.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openPick(p); } });
    return b;
  }));
  if (focused && blankBtn(focused)) blankBtn(focused).focus();
}

const blankBtn = (key) => document.querySelector('#home-q [data-blank="' + key + '"]');

/** Open the shared listbox for one blank: in flow under the sentence on desktop (pushes Chơi nhanh down, never covers it),
 *  a bottom sheet on phones (CSS). Roving tabindex: only the selected option is tabbable. */
function openPick(key) {
  const list = document.getElementById('qm-pick');
  if (!list || qm.searching) return;
  const spec = BLANKS[key];
  openBlank = key;
  list.setAttribute('aria-label', t(spec.aria));
  list.replaceChildren(...spec.values().map((v) => {
    const o = el('li', spec.option(v), 'hq-opt');
    o.setAttribute('role', 'option');
    o.setAttribute('aria-selected', String(v === qm[spec.field]));
    o.tabIndex = v === qm[spec.field] ? 0 : -1;
    o.addEventListener('click', (e) => { e.stopPropagation(); choose(key, v); });
    o.qmValue = v;
    return o;
  }));
  list.hidden = false;
  renderSentence(); // aria-expanded on the blank
  const b = blankBtn(key);
  const h = document.getElementById('home-q');
  if (b && h) {
    const x = b.getBoundingClientRect().left - h.getBoundingClientRect().left;
    list.style.setProperty('--pick-x', Math.max(0, Math.min(x, h.clientWidth - 240)) + 'px');
  }
  (list.querySelector('[aria-selected="true"]') || list.firstElementChild).focus();
}

function closePick(focusBlank) {
  const list = document.getElementById('qm-pick');
  const key = openBlank;
  if (!list || !key) return;
  openBlank = null;
  list.hidden = true;
  list.replaceChildren();
  renderSentence();
  if (focusBlank && blankBtn(key)) blankBtn(key).focus();
}

function choose(key, v) {
  qm[BLANKS[key].field] = v;
  qm.error = '';
  saveQm();
  closePick(true);
  renderQuickMatch();
}

function wirePick() {
  const list = document.getElementById('qm-pick');
  if (!list) return;
  list.addEventListener('keydown', (e) => {
    const opts = [...list.children];
    const i = opts.indexOf(document.activeElement);
    const go = (j) => { e.preventDefault(); opts.forEach((o, k) => { o.tabIndex = k === j ? 0 : -1; }); opts[j].focus(); };
    if (e.key === 'ArrowDown') go(Math.min(opts.length - 1, i + 1));
    else if (e.key === 'ArrowUp') go(Math.max(0, i - 1));
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(opts.length - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); choose(openBlank, opts[i].qmValue); }
    else if (e.key === 'Escape') { e.preventDefault(); closePick(true); }
    else if (e.key === 'Tab') closePick(false);
  });
  document.addEventListener('click', (e) => { if (openBlank && !list.contains(e.target)) closePick(false); });
}

function elapsed() {
  const s = Math.max(0, Math.floor((Date.now() - qm.startedAt) / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Idle: the sentence + Chơi nhanh; #qm-line = facts for the picked rule|time (queue, ETA, guest note, error).
 *  Searching: the button is swapped in place for the #qm-search pill (status, elapsed, queue, Huỷ tìm). */
export function renderQuickMatch() {
  renderHello();
  if (qm.searching && openBlank) closePick(false);
  renderSentence();
  const member = isMember();
  const friend = document.getElementById('qm-friend');
  if (friend) friend.hidden = !member;
  const play = document.getElementById('qm-play');
  const pill = document.getElementById('qm-search');
  if (play) { play.hidden = qm.searching; play.disabled = qm.searching; }
  if (pill) pill.hidden = !qm.searching;

  const acts = document.getElementById('qm-actions');
  const status = document.getElementById('qm-status');
  const line = document.getElementById('qm-line');
  if (!acts || !line || !status) return;
  if (qm.searching) {
    // Built once per search: the 1 s ticker re-renders, and a rebuilt button would drop keyboard focus.
    if (!acts.firstElementChild) {
      const b = el('button', t('qm.cancel'), 'link-action hq-cancel');
      b.type = 'button';
      b.addEventListener('click', cancelSearch);
      acts.appendChild(b);
    }
    setSegments(status, [t(qm.rated ? 'qm.searching_rated' : 'qm.searching_casual', { t: elapsed() }), qm.inBucket > 1 && t('qm.in_queue', { n: qm.inBucket })]);
    line.replaceChildren();
    return;
  }
  acts.replaceChildren();
  status.replaceChildren();
  // Who can pair with this pick: same clock, an auto waiter, and (for auto) everyone of the rule.
  let waiting = 0;
  for (const [k, n] of Object.entries((lastData && lastData.queue) || {})) {
    const [rule, time] = k.split('|');
    if (rule === qm.rule && (qm.time === QM_AUTO || time === QM_AUTO || time === qm.time)) waiting += n;
  }
  const eta = lastData && lastData.queueEta ? lastData.queueEta[qm.rule + '|' + qm.time] || 0 : 0;
  if (qm.error) line.textContent = qm.error;
  else setSegments(line, [waiting && t('qm.in_queue', { n: waiting }), eta && t('qm.eta', { s: eta }), !member && { node: guestNote() }], 'rtag');
  if (lastData) renderStats(lastData); // the searching card's ETA follows the picked rule|time
}

/** Status parts as separate spans spaced by CSS gap (ticket-rows.md: no "a · b · c" strings); `lead` = class of the first part, the rest are .rtag chips. */
function setSegments(line, parts, lead = 'qm-line__lead') {
  line.replaceChildren(...parts.filter(Boolean).map((p, i) => (p.node ? p.node : el('span', p, i ? 'rtag' : lead))));
}

/** Guest reason + a real link to act on it (ui-audit home F2: "đăng nhập" was plain text). */
function guestNote() {
  const note = el('span', t('qm.guest_casual_only') + ' — ', 'qm-line__note');
  const a = el('a', t('qm.guest_login_rated'), 'qm-line__login');
  a.href = '/login.html';
  note.appendChild(a);
  return note;
}

function startSearch(rated) {
  qm.error = '';
  qm.rated = rated;
  client.emit('match:join', { rule: qm.rule, time: qm.time, rated, wall: qm.wall, portal: qm.portal });
}

function cancelSearch() {
  client.emit('match:leave');
}

function setSearching(on) {
  if (on && !qm.searching) qm.startedAt = Date.now();
  const was = qm.searching;
  qm.searching = on;
  if (qmTimer) clearInterval(qmTimer);
  qmTimer = on ? setInterval(renderQuickMatch, 1000) : null;
  renderQuickMatch();
  // The control under the user's finger swapped: keep focus on the replacement (pill's Huỷ tìm ↔ Chơi nhanh).
  const target = on ? document.querySelector('#qm-actions button') : document.getElementById('qm-play');
  if (was !== on && target && document.activeElement && (document.activeElement === document.body || !document.activeElement.isConnected || document.activeElement.closest('.hq-go'))) target.focus();
}

client.on('match:status', (st) => {
  if (st && st.waiting) {
    qm.inBucket = st.inBucket || 0;
    if (typeof st.rated === 'boolean') qm.rated = st.rated;
    setSearching(true);
  } else {
    setSearching(false);
  }
});
client.on('match:error', (e) => {
  qm.error = e && e.code ? t('err.' + e.code.toLowerCase()) : (e && e.message) || '';
  setSearching(false);
});
client.on('match:found', () => {
  // room:joined follows and lobby.js navigates; stop the ticking status meanwhile.
  if (qmTimer) clearInterval(qmTimer);
  const status = document.getElementById('qm-status');
  if (status) status.textContent = t('qm.found');
});

// ── Vào phòng bằng mã on Home (#358): 3 boxes, auto-advance, paste "#a3f" fills all; same parse + join as the rooms form ──

function wireHomeCode() {
  const form = document.getElementById('home-code');
  const err = document.getElementById('home-code-error');
  if (!form || !err) return;
  const boxes = [...form.querySelectorAll('.hq-code__box')];
  const fill = (text, from) => {
    let i = from;
    for (const c of String(text).replace(/[^a-z0-9]/gi, '').toUpperCase()) {
      if (i >= boxes.length) break;
      boxes[i++].value = c;
    }
    boxes[Math.min(i, boxes.length - 1)].focus();
  };
  boxes.forEach((b, i) => {
    b.addEventListener('focus', () => b.select());
    b.addEventListener('input', () => {
      err.hidden = true;
      const v = b.value;
      if (v.length > 1) { b.value = ''; fill(v, i); return; }
      b.value = v.replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (b.value && i < boxes.length - 1) boxes[i + 1].focus();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
      else if (e.key === 'ArrowRight' && i < boxes.length - 1) { e.preventDefault(); boxes[i + 1].focus(); }
    });
    b.addEventListener('paste', (e) => {
      const text = e.clipboardData ? e.clipboardData.getData('text') : '';
      if (!text) return;
      e.preventDefault();
      err.hidden = true;
      fill(text, i);
    });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = parseRoomCode(boxes.map((b) => b.value).join(''));
    if (!id) {
      err.textContent = t('lobby.join_code_invalid');
      err.hidden = false;
      (boxes.find((b) => !b.value) || boxes[0]).focus();
      return;
    }
    window.joinRoom(id);
  });
}

function wireHub() {
  const rooms = document.getElementById('hub-rooms');
  if (rooms) rooms.addEventListener('click', (e) => { e.preventDefault(); showScreen('rooms'); });
  const play = document.getElementById('qm-play');
  if (play) play.addEventListener('click', () => startSearch(isMember() && qm.rated));
  wirePick();
  wireHomeCode();
}
wireHub();

// ── Wiring ──────────────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => showScreen(screenFromLocation()));
// Hidden tab: no pushes (the poll already skips); back to visible → resubscribe + catch up.
document.addEventListener('visibilitychange', () => {
  if (current === 'rooms') setLobbySubscribed(!document.hidden);
  if (current !== 'home') return;
  setSubscribed(!document.hidden);
  if (!document.hidden) loadHome();
});
// Shell "Chơi" link while already on the lobby: switch, don't reload.
document.querySelectorAll('#pl-shell a[data-tab="lobby"]').forEach((a) => a.addEventListener('click', (e) => {
  if (location.pathname.endsWith('/index.html') || location.pathname === '/') { e.preventDefault(); showScreen('home'); }
}));
window.addEventListener('langchange', () => { const acts = document.getElementById('qm-actions'); if (acts) acts.replaceChildren(); if (lastData) renderHome(lastData); renderQuickMatch(); }); // acts: rebuild Huỷ tìm in the new language

wireJoinCode();
renderQuickMatch();
showScreen(screenFromLocation());
