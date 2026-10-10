/**
 * social.js — Bạn bè & tin nhắn page (#198): challenges, friend requests, sent requests, friend list.
 * GET /api/challenges (polled 10 s) → accept goes straight to room.html?id=<roomId>.
 * Messages: /api/dm (conversation list + open thread polled every 5 s; #dm=<username> deep link).
 * GET /api/friends → {friends, incoming, outgoing}; actions POST/DELETE /api/friends/:username.
 * All user text through textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  async function act(method, path, btn) {
    btn.disabled = true;
    try {
      const res = await fetch(path, { method, credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await load();
    } catch (_) {
      btn.disabled = false;
      $('sc-status').textContent = t('friends.error');
    }
  }

  function row(p, buttons) {
    const r = el('div', undefined, 'prow');
    const a = el('a', p.displayName, 'prow__t');
    a.href = '/u/' + encodeURIComponent(p.username);
    const body = el('div', undefined, 'prow__body');
    body.appendChild(a);
    r.append(window.PlatformShell.avatar(p.avatarUrl, p.displayName, 'pav--sm'), body);
    const base = '/api/friends/' + encodeURIComponent(p.username);
    for (const [key, method, suffix, cls] of buttons) {
      const b = el('button', t(key), 'pbtn pbtn--sm' + (cls ? ' ' + cls : ''));
      b.type = 'button';
      b.addEventListener('click', () => act(method, base + suffix, b));
      r.appendChild(b);
    }
    return r;
  }

  function fill(id, people, buttons, emptyKey) {
    const box = $(id);
    box.replaceChildren(...people.map((p) => row(p, buttons)));
    if (!people.length && emptyKey) box.appendChild(el('p', t(emptyKey), 'pnote'));
  }

  const desc = (c) => t('rankings.cat_' + c.rule) + ' · ' + c.time + (c.rated ? ' · ' + t('challenge.rated') : '');

  async function challengeAct(method, path, btn) {
    btn.disabled = true;
    try {
      const res = await fetch(path, { method, credentials: 'same-origin' });
      if (res.ok && path.endsWith('/accept')) { location.href = 'room.html?id=' + encodeURIComponent((await res.json()).roomId); return; }
      if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
      await loadChallenges(); // 404: it expired meanwhile — refresh shows that
    } catch (_) {
      btn.disabled = false;
      $('sc-status').textContent = t('friends.error');
    }
  }

  function challengeRow(c, who, buttons) {
    const r = row(who, []);
    r.querySelector('.prow__body').appendChild(el('div', desc(c), 'prow__m'));
    for (const [key, method, suffix, cls] of buttons) {
      const b = el('button', t(key), 'pbtn pbtn--sm' + (cls ? ' ' + cls : ''));
      b.type = 'button';
      b.addEventListener('click', () => challengeAct(method, '/api/challenges/' + encodeURIComponent(c.id) + suffix, b));
      r.appendChild(b);
    }
    return r;
  }

  /** Thông báo (mockup): the bell's list, rendered as rows. Read state comes from the shell, so both stay in sync. */
  function renderNotifs(items) {
    const box = $('sc-notifs');
    const N = window.PlatformShell.notifications;
    box.replaceChildren(...(items.length ? items.slice(0, 20).map((n) => {
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

  async function loadChallenges() {
    try {
      const res = await fetch('/api/challenges', { credentials: 'same-origin' });
      if (!res.ok) return;
      const d = await res.json();
      const box = $('sc-challenges');
      box.replaceChildren(
        ...d.incoming.map((c) => challengeRow(c, c.from, [['challenge.accept', 'POST', '/accept', 'pbtn--primary'], ['friends.decline', 'DELETE', '', 'pbtn--ghost']])),
        ...d.outgoing.map((c) => challengeRow(c, c.to, [['friends.cancel', 'DELETE', '', 'pbtn--ghost']]))
      );
      if (!d.incoming.length && !d.outgoing.length) box.appendChild(el('p', t('social.none_challenges'), 'pnote'));
    } catch (_) { /* next poll */ }
  }

  async function load() {
    const status = $('sc-status');
    try {
      const res = await fetch('/api/friends', { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) { status.textContent = t('social.guest'); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      status.textContent = '';
      fill('sc-incoming', d.incoming, [['friends.accept', 'POST', '/accept', 'pbtn--primary'], ['friends.decline', 'DELETE', '', 'pbtn--ghost']], 'social.none_incoming');
      fill('sc-friends', d.friends, [['friends.remove', 'DELETE', '', 'pbtn--ghost']], 'social.none_friends');
      fill('sc-outgoing', d.outgoing, [['friends.cancel', 'DELETE', '', 'pbtn--ghost']], null);
      await loadChallenges();
    } catch (_) {
      status.textContent = t('social.error');
    }
  }

  // ── Direct messages (REST; persisted server-side) ──
  const dm = { with: null, lastId: 0, convs: [] };
  const decode = (txt) => (window.EscapeUtils ? window.EscapeUtils.decodeChatText(txt) : txt);

  function renderConvs() {
    const box = $('dm-list');
    box.replaceChildren(...dm.convs.map((c) => {
      const r = el('button', undefined, 'prow pdm__conv' + (c.with.username === dm.with ? ' is-active' : ''));
      r.type = 'button';
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', c.with.displayName, 'prow__t'), el('div', (c.last.mine ? t('social.you') + ' ' : '') + decode(c.last.text), 'prow__m'));
      r.append(window.PlatformShell.avatar(c.with.avatarUrl, c.with.displayName, 'pav--sm'), body);
      if (c.unread) r.appendChild(el('span', String(c.unread), 'pdm__unread'));
      r.addEventListener('click', () => openThread(c.with.username));
      return r;
    }));
  }

  async function loadConvs() {
    try {
      const res = await fetch('/api/dm', { credentials: 'same-origin' });
      if (!res.ok) return;
      dm.convs = (await res.json()).conversations;
      renderConvs();
    } catch (_) { /* next poll */ }
  }

  function addMessages(msgs, { prepend = false } = {}) {
    const log = $('dm-log');
    const nodes = msgs.map((m) => {
      const b = el('div', decode(m.text), 'pdm__msg' + (m.mine ? ' pdm__msg--mine' : ''));
      b.dataset.id = String(m.id);
      b.title = new Date(m.at).toLocaleString();
      return b;
    });
    if (prepend) log.prepend(...nodes); else log.append(...nodes);
    for (const m of msgs) dm.lastId = Math.max(dm.lastId, m.id);
  }

  async function openThread(username) {
    dm.with = username;
    dm.lastId = 0;
    $('dm-empty').hidden = true;
    $('dm-thread').hidden = false;
    $('dm-note').textContent = '';
    renderConvs();
    try {
      const res = await fetch('/api/dm/' + encodeURIComponent(username), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      const link = $('dm-with');
      link.textContent = d.with.displayName;
      link.href = '/u/' + encodeURIComponent(d.with.username);
      $('dm-log').replaceChildren();
      addMessages(d.messages);
      $('dm-log').scrollTop = $('dm-log').scrollHeight;
      if (location.hash !== '#dm=' + username) history.replaceState(null, '', '#dm=' + encodeURIComponent(username));
      await markRead();
    } catch (_) {
      $('dm-note').textContent = t('social.error');
    }
  }

  async function markRead() {
    const c = dm.convs.find((x) => x.with.username === dm.with);
    if (c && !c.unread) return;
    await fetch('/api/dm/' + encodeURIComponent(dm.with) + '/read', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    await loadConvs();
  }

  /** Poll the open thread for newer messages (no socket on this page: see B198 slice 3 notes). */
  async function refreshThread() {
    if (!dm.with || document.hidden) return;
    try {
      const res = await fetch('/api/dm/' + encodeURIComponent(dm.with), { credentials: 'same-origin' });
      if (!res.ok) return;
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
      const res = await fetch('/api/dm/' + encodeURIComponent(dm.with), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const code = res.status === 429 ? 'social.dm_slow' : 'social.error';
        input.value = text;
        $('dm-note').textContent = t(code);
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

  function openFromHash() {
    const m = /^#dm=(.+)$/.exec(location.hash);
    if (!m) return;
    openThread(decodeURIComponent(m[1]));
    const box = $('sc-dm');
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('dm-form').addEventListener('submit', sendDm);
    window.addEventListener('hashchange', openFromHash);
    loadConvs().then(openFromHash);
    setInterval(() => { if (!document.hidden) { loadConvs(); refreshThread(); } }, 5000);
    window.PlatformShell.build('social');
    window.PlatformShell.notifications.onChange(renderNotifs);
    load();
    setInterval(() => { if (!document.hidden) loadChallenges(); }, 10000);
  });
})();
