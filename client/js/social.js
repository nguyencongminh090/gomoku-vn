/**
 * social.js — Bạn bè page, S3 "Trò chuyện" (#370; was the 6-box page of #198).
 *
 * Left: search/add (GET /api/friends/search?q=, debounced ≥ 2 chars; accepts name#1234), friends "story"
 * strip with presence (GET /api/friends: online + activity playing/watching/free), then the conversation
 * list with what needs me pinned on top: pending challenges (GET /api/challenges) and friend requests.
 * Centre: the thread (/api/dm/:username, polled 5 s, append-only so focus + scroll survive), with
 * finished games between us as result cards (GET /api/friends/:username/summary, fetched on open) and
 * pending challenges between us as cards above the composer (accept → room.html?id=…, decline/cancel).
 * Right (≥ 1100px): profile pane from the same summary — rating, head-to-head, last 5, Hồ sơ, Huỷ kết bạn.
 * Phone (≤ 860px): list first; a thread covers the page above the tab bar; Back returns to the list.
 * Deep links: #dm=<username> opens that thread, #challenge opens the ChallengeModal picker (#222),
 * #notifs opens the notifications view (bell "Xem tất cả"). Desktop with no link opens the newest chat.
 * Polls: DM list + open thread 5 s; challenges 10 s; friends (presence) 30 s, silent on failure. All user text via textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const PS = () => window.PlatformShell;
  const enc = encodeURIComponent;
  const isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 860px)').matches);
  const isWide = () => !window.matchMedia || window.matchMedia('(min-width: 861px)').matches;
  const decode = (txt) => (window.EscapeUtils ? window.EscapeUtils.decodeChatText(txt) : txt);
  const get = (path) => fetch(path, { credentials: 'same-origin' });

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function icon(name) { return PS().icon(name); }
  /** One-line name: ellipsis by CSS, full text in title (DESIGN.md name rule). */
  function nm(tag, text, cls) {
    const n = el(tag, text, 'sc-nm' + (cls ? ' ' + cls : ''));
    n.title = text || '';
    return n;
  }
  function iconBtn(iconName, label, cls) {
    const b = el('button', undefined, 'sc-ibtn sc-ibtn--sm' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.appendChild(icon(iconName));
    return b;
  }
  /** Avatar (shared PlatformShell renderer) + presence dot: st = 'playing' | 'watching' | 'free' | null (offline). */
  function av(p, size, st) {
    const w = el('span', undefined, 'sc-av');
    if (size) w.style.setProperty('--s', size + 'px');
    if (st) w.dataset.st = st;
    w.appendChild(PS().avatar(p.avatarUrl, p.displayName));
    return w;
  }

  const state = { friends: new Map(), convs: [], challenges: { incoming: [], outgoing: [] }, incoming: [], outgoing: [], code: '', notifs: [] };
  const dm = { with: null, lastId: 0, person: null, summary: null, seq: 0 };

  const presenceOf = (username) => {
    const f = state.friends.get(username);
    return f && f.online ? (f.activity || 'free') : null;
  };
  function mmss(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
    return (h ? h + ':' : '') + mm + ':' + String(s % 60).padStart(2, '0');
  }
  function statusText(username) {
    const f = state.friends.get(username);
    if (!f) return '';
    if (!f.online) return t('social.st_offline');
    if (f.activity === 'playing') return t('social.st_playing') + (f.startedAt ? ' · ' + mmss(Date.now() - f.startedAt) : '');
    if (f.activity === 'watching') return t('social.st_watching');
    return t('social.st_online');
  }
  function ago(iso) {
    const at = Date.parse(iso);
    if (!at) return '';
    const s = (Date.now() - at) / 1000;
    if (s < 60) return t('social.ago_now');
    if (s < 3600) return t('social.ago_min', { n: Math.floor(s / 60) });
    const d = new Date(at);
    if (sameDay(d, new Date())) return t('social.ago_hour', { n: Math.floor(s / 3600) });
    if (sameDay(d, new Date(Date.now() - 86400000))) return t('social.day_yesterday');
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  function dayLabel(at) {
    const d = new Date(at);
    if (sameDay(d, new Date())) return t('social.day_today');
    if (sameDay(d, new Date(Date.now() - 86400000))) return t('social.day_yesterday');
    return d.toLocaleDateString();
  }

  function setStatus(key) { $('sc-status').textContent = key ? t(key) : ''; }

  // ── friend actions (accept / decline / cancel / unfriend / add) ──
  async function friendAct(method, path, btn, after) {
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(path, { method, credentials: 'same-origin' });
      if (!res.ok) {
        let code = '';
        try { code = (await res.json()).code || ''; } catch (_) { /* no body */ }
        const key = 'social.add_err_' + code;
        setStatus(code && t(key) !== key ? key : 'friends.error');
        if (btn) btn.disabled = false;
        return false;
      }
      setStatus('');
      await Promise.all([loadFriends(), after ? after() : null]);
      return true;
    } catch (_) {
      if (btn) btn.disabled = false;
      setStatus('friends.error');
      return false;
    }
  }

  // ── Add friend by username / display name / code ──
  const SEARCH_MIN = 2;
  let searchTimer = null;
  let searchSeq = 0;

  function personRow(p, sub) {
    const r = el('div', undefined, 'sc-ci');
    const body = el('div', undefined, 'sc-nmbox');
    const a = nm('a', p.displayName, 'sc-ci__t');
    a.href = '/u/' + enc(p.username);
    body.append(a);
    if (sub) body.append(nm('span', sub, 'sc-ci__m'));
    r.append(av(p, 44, presenceOf(p.username)), body);
    return r;
  }

  function searchRow(p) {
    const r = personRow(p, '@' + p.username);
    const side = el('div', undefined, 'sc-ci__side');
    const path = '/api/friends/' + enc(p.username);
    if (p.status === 'friends') side.textContent = t('social.add_friends');
    else if (p.status === 'outgoing') side.textContent = t('social.add_sent');
    else if (p.status === 'incoming') {
      const b = iconBtn('ph-regular-check', t('friends.accept'), 'sc-ibtn--pri');
      b.addEventListener('click', () => friendAct('POST', path + '/accept', b, runSearch));
      side.appendChild(b);
    } else if (!p.canRequest) side.textContent = t('social.add_closed');
    else {
      const b = iconBtn('ph-regular-user-plus', t('social.add_btn'), 'sc-ibtn--pri');
      b.addEventListener('click', () => friendAct('POST', path, b, runSearch));
      side.appendChild(b);
    }
    r.appendChild(side);
    return r;
  }

  async function runSearch() {
    const box = $('sc-add-results');
    const q = $('sc-add-q').value.trim();
    const seq = ++searchSeq;
    if (q.length < SEARCH_MIN) { box.replaceChildren(); return; }
    try {
      const res = await get('/api/friends/search?q=' + enc(q));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (seq !== searchSeq) return; // a newer query is already in flight
      box.replaceChildren(...(d.results.length ? d.results.map(searchRow) : [el('p', t('social.add_none'), 'sc-status')]));
    } catch (_) {
      if (seq === searchSeq) box.replaceChildren(el('p', t('social.error'), 'sc-status'));
    }
  }

  async function loadCode() {
    try {
      const res = await get('/api/friends/code');
      if (!res.ok) return;
      state.code = (await res.json()).code;
      $('sc-code').textContent = state.code;
      $('sc-code2').textContent = state.code;
    } catch (_) { /* leave the placeholder */ }
  }

  // ── Friends: story strip + requests ──
  const RANK = { playing: 0, free: 1, watching: 2 };
  function renderStory() {
    const box = $('sc-story');
    const add = el('button', undefined, 'sc-story__i sc-story__add');
    add.type = 'button';
    const addAv = el('span', undefined, 'sc-av');
    addAv.style.setProperty('--s', '48px');
    const plus = el('span', '+', 'pav');
    plus.setAttribute('aria-hidden', 'true');
    addAv.appendChild(plus);
    add.append(addAv, el('span', t('social.story_add'), 'sc-nm'));
    add.addEventListener('click', () => $('sc-add-q').focus());
    const friends = [...state.friends.values()].sort((a, b) =>
      (a.online === b.online ? 0 : a.online ? -1 : 1) || ((RANK[a.activity] ?? 3) - (RANK[b.activity] ?? 3)));
    box.replaceChildren(add, ...friends.map((f) => {
      const b = el('button', undefined, 'sc-story__i' + (f.online ? '' : ' is-off'));
      b.type = 'button';
      b.dataset.user = f.username;
      b.title = f.displayName + ' — ' + statusText(f.username);
      b.append(av(f, 48, presenceOf(f.username)), nm('span', f.displayName));
      b.addEventListener('click', () => go(f.username));
      return b;
    }));
  }

  function renderRequests() {
    $('sc-incoming').replaceChildren(...state.incoming.map((p) => {
      const r = personRow(p, t('social.req_friend'));
      r.classList.add('sc-ci--req');
      const acts = el('div', undefined, 'sc-ci__acts');
      const path = '/api/friends/' + enc(p.username);
      const ok = iconBtn('ph-regular-check', t('friends.accept'), 'sc-ibtn--pri');
      ok.addEventListener('click', () => friendAct('POST', path + '/accept', ok));
      const no = iconBtn('ph-regular-x', t('friends.decline'));
      no.addEventListener('click', () => friendAct('DELETE', path, no));
      acts.append(ok, no);
      r.appendChild(acts);
      return r;
    }));
    $('sc-outgoing').replaceChildren(...state.outgoing.map((p) => {
      const r = personRow(p, t('social.req_sent'));
      const no = iconBtn('ph-regular-x', t('friends.cancel'));
      no.addEventListener('click', () => friendAct('DELETE', '/api/friends/' + enc(p.username), no));
      r.appendChild(no);
      return r;
    }));
    $('sc-out-box').hidden = !state.outgoing.length;
  }

  async function loadFriends({ quiet = false } = {}) {
    try {
      const res = await get('/api/friends');
      if (res.status === 401 || res.status === 403) { if (!quiet) setStatus('social.guest'); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if ($('sc-status').textContent === t('social.error')) setStatus('');
      state.friends = new Map(d.friends.map((f) => [f.username, f]));
      state.incoming = d.incoming;
      state.outgoing = d.outgoing;
      renderStory();
      renderRequests();
      renderConvs();
      renderHead();
      renderSuggest();
    } catch (_) {
      if (!quiet) setStatus('social.error'); // a failed presence poll stays silent: the next one fixes it
    }
  }

  // ── Challenges: pinned rows (all) + cards in the open thread (with that person) ──
  const descParts = (c) => window.ChallengeModal.util.describeParts(c); // #222: full settings + series + stake

  async function challengeAct(method, c, suffix, btn) {
    btn.disabled = true;
    const path = '/api/challenges/' + enc(c.id) + suffix;
    try {
      const res = await fetch(path, { method, credentials: 'same-origin' });
      if (res.ok && suffix === '/accept') { location.href = 'room.html?id=' + enc((await res.json()).roomId); return; }
      if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
      await loadChallenges(); // 404: it expired meanwhile — refresh shows that
    } catch (_) {
      btn.disabled = false;
      setStatus('friends.error');
    }
  }

  function challengeButtons(c, incoming, asIcons) {
    const out = [];
    const mk = (key, iconName, pri, method, suffix) => {
      let b;
      if (asIcons) b = iconBtn(iconName, t(key), pri ? 'sc-ibtn--pri' : '');
      else { b = el('button', t(key), 'pbtn pbtn--sm ' + (pri ? 'pbtn--primary' : 'pbtn--ghost')); b.type = 'button'; }
      b.dataset.act = key;
      b.addEventListener('click', (e) => { e.stopPropagation(); challengeAct(method, c, suffix, b); });
      out.push(b);
    };
    if (incoming) {
      mk(asIcons ? 'challenge.accept' : 'social.ch_play', 'ph-regular-check', true, 'POST', '/accept');
      mk('friends.decline', 'ph-regular-x', false, 'DELETE', '');
    } else mk('friends.cancel', 'ph-regular-x', false, 'DELETE', '');
    return out;
  }

  function challengeRow(c, incoming) {
    const who = incoming ? c.from : c.to;
    const r = el('div', undefined, 'sc-ci sc-ci--req' + (c.stake === 'swap' ? ' sc-ci--stake' : ''));
    r.dataset.challenge = c.id;
    const open = el('button', undefined, 'sc-nmbox sc-ci__open');
    open.type = 'button';
    open.append(nm('span', who.displayName, 'sc-ci__t'));
    const meta = PS().meta(descParts(c));
    meta.classList.add('sc-ci__m');
    meta.prepend(el('span', t(incoming ? 'social.ch_in' : 'social.ch_out')));
    open.append(meta);
    open.addEventListener('click', () => go(who.username));
    const acts = el('div', undefined, 'sc-ci__acts');
    acts.append(...challengeButtons(c, incoming, true));
    r.append(av(who, 44, presenceOf(who.username)), open, acts);
    return r;
  }

  function miniBoard() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 15 15');
    svg.setAttribute('class', 'sc-mb');
    svg.setAttribute('aria-hidden', 'true');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('width', '15'); rect.setAttribute('height', '15'); rect.setAttribute('rx', '.4');
    const path = document.createElementNS(NS, 'path');
    let d = '';
    for (const v of [0.5, 3.5, 7.5, 11.5, 14.5]) d += 'M.5 ' + v + 'H14.5M' + v + ' .5V14.5';
    path.setAttribute('d', d);
    const stone = document.createElementNS(NS, 'circle');
    stone.setAttribute('cx', '7.5'); stone.setAttribute('cy', '7.5'); stone.setAttribute('r', '.9');
    svg.append(rect, path, stone);
    return svg;
  }

  function challengeCard(c, incoming) {
    const who = incoming ? c.from : c.to;
    const card = el('div', undefined, 'sc-gcard' + (c.stake === 'swap' ? ' sc-gcard--stake' : ''));
    card.dataset.challenge = c.id;
    const body = el('div', undefined, 'sc-nmbox');
    body.append(nm('div', t(incoming ? 'social.ch_card_in' : 'social.ch_card_out', { name: who.displayName }), 'sc-gcard__t'));
    body.append(PS().meta(descParts(c)));
    const acts = el('div', undefined, 'sc-gcard__acts');
    acts.append(...challengeButtons(c, incoming, false));
    body.append(acts);
    card.append(miniBoard(), body);
    return card;
  }

  function renderChallenges() {
    const { incoming, outgoing } = state.challenges;
    $('sc-challenges').replaceChildren(...incoming.map((c) => challengeRow(c, true)), ...outgoing.map((c) => challengeRow(c, false)));
    const mine = [...incoming.filter((c) => c.from.username === dm.with).map((c) => challengeCard(c, true)),
      ...outgoing.filter((c) => c.to.username === dm.with).map((c) => challengeCard(c, false))];
    $('dm-pending').replaceChildren(...(dm.with ? mine : []));
  }

  async function loadChallenges() {
    try {
      const res = await get('/api/challenges');
      if (!res.ok) return;
      state.challenges = await res.json();
      renderChallenges();
    } catch (_) { /* next poll */ }
  }

  function openChallenge(to) {
    window.ChallengeModal.open(to ? { to, onSent: loadChallenges } : { onSent: loadChallenges });
  }

  // ── Conversations ──
  function renderConvs() {
    $('dm-list').replaceChildren(...state.convs.map((c) => {
      const r = el('button', undefined, 'sc-ci sc-conv' + (c.unread ? ' sc-ci--u' : '') + (c.with.username === dm.with ? ' is-on' : ''));
      r.type = 'button';
      r.dataset.user = c.with.username;
      const body = el('div', undefined, 'sc-nmbox');
      body.append(nm('span', c.with.displayName, 'sc-ci__t'), nm('span', (c.last.mine ? t('social.you') + ' ' : '') + decode(c.last.text), 'sc-ci__m'));
      const side = el('div', undefined, 'sc-ci__side');
      side.append(el('span', ago(c.last.at)));
      if (c.unread) side.append(el('span', String(c.unread), 'sc-badge'));
      r.append(av(c.with, 44, presenceOf(c.with.username)), body, side);
      r.addEventListener('click', () => go(c.with.username));
      return r;
    }));
    renderEmpty();
  }

  async function loadConvs() {
    try {
      const res = await get('/api/dm');
      if (!res.ok) return;
      state.convs = (await res.json()).conversations;
      state.convsLoaded = true;
      renderConvs();
      const shell = PS();
      if (shell && shell.setDmUnread) shell.setDmUnread(state.convs.reduce((n, c) => n + (c.unread || 0), 0));
    } catch (_) { /* next poll */ }
  }

  // ── Empty state + "online now" suggestions ──
  let suggest = null;
  function renderEmpty() {
    const empty = !dm.with && $('sc-notifs-view').hidden;
    $('dm-empty').hidden = !empty;
    if (state.convsLoaded && !state.convs.length && !suggest) loadSuggest();
  }
  async function loadSuggest() {
    suggest = [];
    try {
      const res = await get('/api/challenges/online');
      if (res.ok) suggest = (await res.json()).players || [];
    } catch (_) { /* no suggestions */ }
    renderSuggest();
  }
  function renderSuggest() {
    const box = $('sc-suggest');
    const people = (suggest || []).filter((p) => !state.friends.has(p.username) && !state.outgoing.some((o) => o.username === p.username)).slice(0, 6);
    box.hidden = !!state.convs.length || !people.length;
    if (box.hidden) { box.replaceChildren(); return; }
    box.replaceChildren(el('p', t('social.online_suggest'), 'sc-h3'), ...people.map((p) => {
      const r = personRow(p, '@' + p.username);
      const b = iconBtn('ph-regular-user-plus', t('social.add_btn'), 'sc-ibtn--pri');
      b.addEventListener('click', () => friendAct('POST', '/api/friends/' + enc(p.username), b));
      r.appendChild(b);
      return r;
    }));
  }

  // ── Thread ──
  function placeByTime(node, at) {
    const log = $('dm-log');
    node.dataset.at = String(at);
    const after = [...log.querySelectorAll('[data-at]')].find((n) => Number(n.dataset.at) > at);
    if (after) log.insertBefore(node, after); else log.appendChild(node);
  }
  /** Day chips before the first item of each day. Rebuilt after each insert batch; only chips move, not messages. */
  function relabelDays() {
    const log = $('dm-log');
    log.querySelectorAll('.sc-day').forEach((n) => n.remove());
    let prev = '';
    for (const n of [...log.querySelectorAll('[data-at]')]) {
      const d = new Date(Number(n.dataset.at));
      const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (key !== prev) { log.insertBefore(el('span', dayLabel(Number(n.dataset.at)), 'sc-day'), n); prev = key; }
    }
  }

  function addMessages(msgs) {
    for (const m of msgs) {
      if (m.id <= dm.lastId && $('dm-log').querySelector('[data-id="' + m.id + '"]')) continue;
      const b = el('div', decode(m.text), 'sc-msg' + (m.mine ? ' sc-msg--me' : ''));
      b.dataset.id = String(m.id);
      const at = Date.parse(m.at) || Date.now();
      b.title = new Date(at).toLocaleString();
      placeByTime(b, at);
      dm.lastId = Math.max(dm.lastId, m.id);
    }
    relabelDays();
  }

  function resultCard(g) {
    const card = el('div', undefined, 'sc-res sc-res--' + g.result);
    card.dataset.game = g.id;
    card.append(icon(g.result === 'W' ? 'ph-regular-trophy' : 'ph-regular-sword'));
    card.append(el('b', t(g.result === 'W' ? 'social.res_win' : g.result === 'L' ? 'social.res_loss' : 'social.res_draw')));
    const meta = [dm.person ? t('social.res_vs', { name: dm.person.displayName }) : ''];
    if (g.moves) meta.push(t('social.res_moves', { n: g.moves }));
    if (g.boardSize) meta.push(g.boardSize + '×' + g.boardSize);
    card.append(el('span', meta.filter(Boolean).join(' · ')));
    const a = el('a', t('social.replay'));
    a.href = '/replay/' + enc(g.id);
    card.append(a);
    return card;
  }

  function renderStatusLine(st) {
    const line = $('dm-st');
    const txt = statusText(dm.with);
    line.replaceChildren();
    if (!txt) return;
    const dot = el('span', undefined, 'sc-dot');
    dot.dataset.st = st || 'off';
    line.append(dot, nm('span', txt));
  }

  function renderHead() {
    if (!dm.with) return;
    const p = dm.person || { username: dm.with, displayName: dm.with, avatarUrl: null };
    const st = presenceOf(dm.with);
    $('dm-av').replaceWith(Object.assign(av(p, 44, st), { id: 'dm-av' }));
    const link = $('dm-with');
    link.textContent = p.displayName;
    link.title = p.displayName;
    link.href = '/u/' + enc(p.username);
    renderStatusLine(st);
    const f = state.friends.get(dm.with);
    const watch = $('dm-watch');
    const room = f && f.online && f.roomId && (f.activity === 'playing' || f.activity === 'watching') ? f.roomId : null;
    watch.hidden = !room;
    if (room) watch.href = '/room.html?id=' + enc(room);
    $('dm-input').placeholder = t('social.dm_ph', { name: p.displayName });
  }

  function renderWho() {
    const box = $('sc-who');
    const s = dm.summary;
    const app = $('sc-app');
    if (!dm.with || !s) { box.hidden = true; app.classList.remove('has-who'); return; }
    box.hidden = false;
    app.classList.add('has-who');
    const p = s.with;
    const name = el('h2', p.displayName, 'sc-who__n sc-nm');
    name.title = p.displayName;
    const user = nm('span', '@' + p.username, 'sc-who__u');
    const stat = el('div', undefined, 'sc-stat');
    const tile = (val, key, title) => {
      const d = el('div');
      d.append(el('b', val), el('span', t(key)));
      if (title) d.title = title;
      return d;
    };
    const r = s.rating;
    stat.append(
      tile(r ? r.rating + (r.provisional ? '?' : '') : '—', 'social.stat_elo', r ? t('rankings.cat_' + r.category) : ''),
      tile(s.h2h.wins + '–' + s.h2h.losses, 'social.stat_h2h', s.h2h.draws ? s.h2h.draws + ' ' + t('social.res_draw') : ''),
      tile(s.h2h.winPct == null ? '—' : s.h2h.winPct + '%', 'social.stat_win'),
    );
    const last = el('div', undefined, 'sc-last');
    if (s.last5.length) {
      const chips = el('span', undefined, 'sc-form5');
      const letter = { W: t('social.res_win'), L: t('social.res_loss'), D: t('social.res_draw') };
      for (const x of s.last5) {
        const i = el('i', x === 'W' ? 'T' : x === 'L' ? 'B' : 'H', 'is-' + x);
        i.title = letter[x];
        chips.append(i);
      }
      last.append(el('span', t('social.last5'), 'sc-last__h'), chips);
    } else last.append(el('span', t('social.no_games'), 'sc-last__h'));
    const acts = el('div', undefined, 'sc-who__acts');
    const prof = el('a', undefined, 'pbtn pbtn--sm pbtn--ghost');
    prof.href = '/u/' + enc(p.username);
    prof.append(icon('ph-regular-user-circle'), el('span', t('social.profile')));
    acts.append(prof);
    if (s.friendship === 'friends') {
      const un = el('button', undefined, 'pbtn pbtn--sm sc-unfriend');
      un.type = 'button';
      const label = el('span', t('social.unfriend'));
      un.append(icon('ph-regular-user-minus'), label);
      // Two taps instead of a browser confirm(): the first arms, the second removes.
      un.addEventListener('click', async () => {
        if (un.dataset.armed !== '1') { un.dataset.armed = '1'; label.textContent = t('social.unfriend_confirm'); return; }
        const ok = await friendAct('DELETE', '/api/friends/' + enc(p.username), un);
        if (ok && dm.summary) { dm.summary.friendship = 'none'; renderWho(); }
      });
      acts.append(un);
    }
    box.replaceChildren(av(p, 72, presenceOf(p.username)), name, user, stat, last, acts);
  }

  async function loadSummary(username, seq) {
    try {
      const res = await get('/api/friends/' + enc(username) + '/summary');
      if (!res.ok || seq !== dm.seq) return;
      const s = await res.json();
      if (seq !== dm.seq) return;
      dm.summary = s;
      dm.person = dm.person || s.with;
      const log = $('dm-log');
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      for (const g of s.games) if (!log.querySelector('[data-game="' + g.id + '"]')) placeByTime(resultCard(g), Date.parse(g.endedAt) || 0);
      relabelDays();
      if (atBottom) log.scrollTop = log.scrollHeight;
      renderWho();
    } catch (_) { /* pane stays hidden */ }
  }

  function showView(which) {
    $('dm-thread').hidden = which !== 'thread';
    $('sc-notifs-view').hidden = which !== 'notifs';
    document.body.classList.toggle('sc-open', which !== 'none');
    renderEmpty();
  }

  async function openThread(username) {
    const seq = ++dm.seq;
    dm.with = username;
    dm.lastId = 0;
    const conv = state.convs.find((c) => c.with.username === username);
    const f = state.friends.get(username);
    dm.person = conv ? conv.with : f ? { username: f.username, displayName: f.displayName, avatarUrl: f.avatarUrl } : null;
    dm.summary = null;
    $('dm-note').textContent = '';
    $('dm-log').replaceChildren();
    showView('thread');
    renderHead();
    renderWho();
    renderConvs();
    renderChallenges();
    loadSummary(username, seq);
    try {
      const res = await get('/api/dm/' + enc(username));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (seq !== dm.seq) return;
      dm.person = d.with;
      renderHead();
      addMessages(d.messages);
      $('dm-log').scrollTop = $('dm-log').scrollHeight;
      await markRead();
    } catch (_) {
      if (seq === dm.seq) $('dm-note').textContent = t('social.error');
    }
  }

  function closeThread() {
    dm.seq++;
    dm.with = null;
    dm.summary = null;
    showView('none');
    renderWho();
    renderConvs();
    renderChallenges();
  }

  /** The server marks the thread read AND deletes its `dm` bell row, so refresh both the conversations and the bell. */
  async function markRead() {
    const c = state.convs.find((x) => x.with.username === dm.with);
    const bellDm = state.notifs.some((n) => !n.read && n.type === 'dm' && n.payload && n.payload.from && n.payload.from.username === dm.with);
    if (c && !c.unread && !bellDm) return;
    await fetch('/api/dm/' + enc(dm.with) + '/read', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    const N = PS() && PS().notifications;
    await Promise.all([loadConvs(), N && N.refresh ? N.refresh() : null]);
  }

  /** Poll the open thread for newer messages (no socket on this page: see B198 slice 3 notes). */
  async function refreshThread() {
    if (!dm.with || document.hidden) return;
    const seq = dm.seq;
    try {
      const res = await get('/api/dm/' + enc(dm.with));
      if (!res.ok || seq !== dm.seq) return;
      const fresh = (await res.json()).messages.filter((m) => m.id > dm.lastId);
      if (fresh.length) {
        const log = $('dm-log');
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        addMessages(fresh);
        if (atBottom) log.scrollTop = log.scrollHeight;
        await markRead();
      }
    } catch (_) { /* next poll */ }
  }

  async function sendDm(ev) {
    ev.preventDefault();
    const input = $('dm-input');
    const text = input.value.trim();
    if (!text || !dm.with) return;
    input.value = '';
    try {
      const res = await fetch('/api/dm/' + enc(dm.with), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        input.value = text;
        $('dm-note').textContent = t(res.status === 429 ? 'social.dm_slow' : 'social.error');
        return;
      }
      $('dm-note').textContent = '';
      const m = await res.json();
      if (m.id > dm.lastId) { addMessages([m]); $('dm-log').scrollTop = $('dm-log').scrollHeight; }
      loadConvs();
    } catch (_) {
      input.value = text;
      $('dm-note').textContent = t('social.error');
    }
  }

  // ── Notifications view (#notifs; the bell's "Xem tất cả") ──
  function renderNotifs(items) {
    state.notifs = items;
    const box = $('sc-notifs');
    const N = PS().notifications;
    box.replaceChildren(...(items.length ? items.slice(0, 30).map((n) => {
      const a = el('a', undefined, 'prow');
      a.href = N.target(n);
      a.append(el('span', undefined, 'pdot' + (n.read ? '' : ' pdot--on')));
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', N.text(n), 'prow__t' + (n.read ? '' : ' is-unread')));
      a.append(body);
      a.addEventListener('click', () => { if (!n.read) N.markRead(n.id); });
      return a;
    }) : [el('p', t('notif.empty'), 'pnote')]));
  }

  // ── Routing: #dm=<username> · #notifs · #challenge ──
  function go(username) {
    const hash = '#dm=' + enc(username);
    if (location.hash === hash) { openThread(username); return; }
    // Phone: push so the system Back returns to the list; desktop: replace (no history spam).
    if (isPhone() && !pushed) { history.pushState(null, '', hash); pushed = true; } else history.replaceState(null, '', hash);
    route();
  }

  let pushed = false; // the open view was pushed on the phone: Back pops it like the system Back
  function back() {
    if (pushed) { pushed = false; history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    closeThread();
  }

  function route() {
    const h = location.hash;
    if (h === '#challenge') { history.replaceState(null, '', location.pathname + location.search); openChallenge(); return; }
    if (h === '#notifs') {
      dm.seq++; dm.with = null; dm.summary = null;
      showView('notifs'); renderWho(); renderConvs(); renderChallenges();
      return;
    }
    const m = /^#dm=(.+)$/.exec(h);
    if (m) {
      const u = decodeURIComponent(m[1]);
      if (u !== dm.with || $('dm-thread').hidden) openThread(u);
      return;
    }
    pushed = false;
    if (dm.with || !$('sc-notifs-view').hidden) closeThread();
  }

  /** Desktop with no deep link: open the newest conversation. Phone starts on the list. */
  function openInitial() {
    if (location.hash) { route(); return; }
    if (isWide() && state.convs.length) { history.replaceState(null, '', '#dm=' + enc(state.convs[0].with.username)); route(); return; }
    renderEmpty();
  }

  // Elapsed "Đang chơi · mm:ss" ticks once a second while a thread with a playing friend is open.
  function tickHead() {
    if (!dm.with || document.hidden) return;
    const f = state.friends.get(dm.with);
    if (f && f.online && f.activity === 'playing' && f.startedAt) renderStatusLine('playing');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('sc-challenge-new').appendChild(icon('ph-regular-sword'));
    $('dm-sword').appendChild(icon('ph-regular-sword'));
    $('dm-back').appendChild(icon('ph-regular-arrow-left'));
    $('sc-notifs-back').appendChild(icon('ph-regular-arrow-left'));
    $('dm-challenge').append(icon('ph-regular-sword'), el('span', t('social.challenge')));
    $('dm-challenge').setAttribute('aria-label', t('social.challenge'));
    $('dm-watch').append(icon('ph-regular-eye'), el('span', t('social.watch')));
    $('dm-watch').setAttribute('aria-label', t('social.watch'));
    $('dm-form').querySelector('.sc-send').prepend(icon('ph-regular-paper-plane-tilt'));
    $('dm-form').addEventListener('submit', sendDm);
    $('sc-add').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });
    $('sc-add-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 300); });
    $('sc-challenge-new').addEventListener('click', () => openChallenge());
    const challengeHim = () => { const p = dm.person; if (p) openChallenge({ username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl }); };
    $('dm-challenge').addEventListener('click', challengeHim);
    $('dm-sword').addEventListener('click', challengeHim);
    $('dm-back').addEventListener('click', back);
    $('sc-notifs-back').addEventListener('click', back);
    $('sc-code-copy').addEventListener('click', async () => {
      if (!state.code) return;
      try { await navigator.clipboard.writeText(state.code); $('sc-code-copy').textContent = t('social.copied'); } catch (_) { /* clipboard blocked: the code stays selectable */ }
    });
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    PS().build('social');
    PS().notifications.onChange(renderNotifs);
    loadFriends();
    loadCode();
    loadChallenges();
    loadConvs().then(openInitial);
    setInterval(() => { if (!document.hidden) { loadConvs(); refreshThread(); } }, 5000);
    setInterval(() => { if (!document.hidden) loadChallenges(); }, 10000);
    // Presence: 30 s keeps the friends router (300 req / 15 min / IP, shared with search + actions) far from 429.
    setInterval(() => { if (!document.hidden) loadFriends({ quiet: true }); }, 30000);
    setInterval(tickHead, 1000);
  });
})();
