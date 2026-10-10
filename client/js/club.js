/**
 * club.js — /c/<slug> club page (#178): info, join/leave, member leaderboard,
 * staff management. Permissions are enforced server-side; the UI just hides
 * what the caller can't do. User-supplied text only via textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const slug = decodeURIComponent(location.pathname.replace(/^\/c\//, '').replace(/\/$/, ''));
  const CATEGORIES = ['freestyle', 'standard', 'caro'];
  const state = { category: CATEGORIES[0], club: null, chat: { loaded: false, firstId: 0, lastId: 0, busy: false } };
  const CHAT_POLL_MS = 8000;
  const CHAT_PAGE = 50;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function errMsg(body) {
    const k = 'clubs.err_' + (body && body.code);
    const v = t(k);
    return v && v !== k ? v : (body && body.error) || t('clubs.error');
  }

  const base = () => '/api/clubs/' + encodeURIComponent(slug);

  async function act(method, path, body, confirmKey) {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    const res = await fetch(base() + path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { location.href = '/login.html'; return; }
    const data = await res.json().catch(() => null);
    $('cb-msg').textContent = res.ok ? '' : errMsg(data);
    return res.ok ? (data || {}) : null;
  }

  function mini(label, fn) {
    const b = el('button', label, 'pbtn pbtn--sm');
    b.type = 'button';
    b.onclick = async () => { if (await fn()) load(); };
    return b;
  }

  function userRow(username, displayName, avatarUrl, meta) {
    const a = el('a', undefined, 'prow');
    a.href = '/u/' + encodeURIComponent(username);
    const body = el('div', undefined, 'prow__body');
    body.append(el('div', displayName, 'prow__t'));
    if (meta) body.append(el('div', meta, 'prow__m'));
    a.append(window.PlatformShell.avatar(avatarUrl, displayName, 'pav--sm'), body);
    return a;
  }

  const TABS = ['overview', 'members', 'board', 'chat'];
  const visibleTabs = () => TABS.filter((tab) => !$('cb-tab-' + tab).hidden);
  /** Active tab from `#tab=<name>`; unknown/missing/hidden (chat for non-members) → overview. */
  function currentTab() {
    const m = /(?:^|[#&])tab=([a-z]+)/.exec(location.hash);
    return m && visibleTabs().includes(m[1]) ? m[1] : TABS[0];
  }

  function showTab(name, { updateHash = false } = {}) {
    for (const tab of TABS) {
      const on = tab === name;
      $('cb-panel-' + tab).hidden = !on;
      const btn = $('cb-tab-' + tab);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    }
    if (updateHash && currentTab() !== name) history.replaceState(null, '', '#tab=' + name);
    if (name === 'chat') openChat();
  }

  // --- club chat: REST polling only (a socket here would evict the lobby socket) ---
  const isMember = () => !!state.club && ['owner', 'officer', 'member'].includes(state.club.myRole);
  const isStaff = () => !!state.club && ['owner', 'officer'].includes(state.club.myRole);
  const decode = (txt) => (window.EscapeUtils ? window.EscapeUtils.decodeChatText(txt) : txt);

  function fmtWhen(iso) {
    const d = new Date(iso);
    const lang = document.documentElement.lang || undefined;
    return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit' });
  }

  function chatRow(m) {
    const row = el('div', undefined, 'cb-chat__msg');
    row.dataset.id = String(m.id);
    const body = el('div', undefined, 'cb-chat__body');
    body.append(
      el('div', m.displayName + ' · ' + fmtWhen(m.createdAt), 'cb-chat__who'),
      el('div', decode(m.text), 'cb-chat__text'));
    row.append(window.PlatformShell.avatar(m.avatarUrl, m.displayName, 'pav--sm'), body);
    if (isStaff()) {
      row.append(mini(t('clubs.delete_message'), async () => {
        const ok = await act('DELETE', '/messages/' + m.id, null, 'clubs.confirm_delete_message');
        if (ok) { resetChat(); openChat(); }
        return false;
      }));
    }
    return row;
  }

  function resetChat() {
    state.chat = { loaded: false, firstId: 0, lastId: 0, busy: false };
    $('cb-chat-log').replaceChildren();
  }

  function syncChatChrome(pageFull) {
    const n = $('cb-chat-log').children.length;
    $('cb-chat-empty').hidden = n > 0;
    if (pageFull !== undefined) $('cb-chat-older').hidden = !pageFull;
  }

  /** @param {'newest'|'older'|'newer'} mode */
  async function fetchChat(mode) {
    const c = state.chat;
    if (c.busy || !isMember()) return;
    c.busy = true;
    try {
      const q = mode === 'older' ? '?before=' + c.firstId : mode === 'newer' ? '?after=' + c.lastId : '';
      const res = await fetch(base() + '/messages' + q, { credentials: 'same-origin' });
      if (!res.ok) return;
      const { messages } = await res.json();
      const log = $('cb-chat-log');
      const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      if (messages.length) {
        const rows = messages.map(chatRow);
        if (mode === 'older') log.prepend(...rows); else log.append(...rows);
        if (mode !== 'newer' || !c.firstId) c.firstId = messages[0].id;
        if (mode !== 'older') c.lastId = messages[messages.length - 1].id;
      }
      if (mode === 'newest') { c.loaded = true; log.scrollTop = log.scrollHeight; } else if (mode === 'newer' && stick) log.scrollTop = log.scrollHeight;
      syncChatChrome(mode === 'newer' ? undefined : messages.length >= CHAT_PAGE);
    } catch (_) { /* next poll retries */ } finally { c.busy = false; }
  }

  function openChat() {
    if (isMember() && !state.chat.loaded) fetchChat('newest');
  }


  function render(c) {
    state.club = c;
    document.title = 'Play3CR — ' + c.name;
    $('cb-avatar').replaceWith(Object.assign(window.PlatformShell.avatar(null, c.name, 'pav--xl pav--sq'), { id: 'cb-avatar' }));
    $('cb-name').textContent = c.name;
    $('cb-policy-badge').textContent = t(c.joinPolicy === 'open' ? 'clubs.policy_open_short' : 'clubs.policy_invite_short');
    $('cb-desc').textContent = c.description;

    const stats = $('cb-stats');
    stats.replaceChildren();
    for (const [label, v] of [['clubs.members_stat', String(c.members)], ['clubs.avg_stat', c.avgRating ? String(c.avgRating) : '—'], ['clubs.rank_stat', c.rank ? '#' + c.rank : '—']]) {
      const d = document.createElement('div');
      d.append(el('dt', t(label)), el('dd', v));
      stats.appendChild(d);
    }

    const role = c.myRole;
    const staff = role === 'owner' || role === 'officer';
    $('cb-join').hidden = !!role;
    $('cb-join').textContent = t(c.joinPolicy === 'open' ? 'clubs.join' : 'clubs.request');
    $('cb-leave').hidden = !role || role === 'owner';
    $('cb-leave').textContent = role === 'pending' ? t('clubs.cancel_request') : t('clubs.leave');
    $('cb-delete').hidden = role !== 'owner';

    $('cb-staff').replaceChildren(...c.leaderboard.filter((m) => m.role !== 'member')
      .map((m) => userRow(m.username, m.displayName, m.avatarUrl, t('clubs.role_' + m.role))));

    $('cb-events').replaceChildren(...(c.events.length ? c.events.map((e) => {
      const row = el('div', undefined, 'prow');
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', e.title, 'prow__t'),
        el('div', new Date(e.startsAt).toLocaleString(document.documentElement.lang || undefined, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 'prow__m'));
      row.append(body);
      if (staff) row.append(mini(t('clubs.delete_event'), () => act('DELETE', '/events/' + encodeURIComponent(e.id), null, 'clubs.confirm_delete_event')));
      return row;
    }) : [el('p', t('clubs.no_events'), 'pnote')]));

    $('cb-manage').hidden = !staff;
    if (staff) {
      $('cb-desc-input').value = c.description;
      $('cb-policy').value = c.joinPolicy;
      $('cb-policy').hidden = $('cb-policy-label').hidden = role !== 'owner';
      const pending = c.pending || [];
      $('cb-pending').replaceChildren(...(pending.length ? pending.map((p) => {
        const row = userRow(p.username, p.displayName, null);
        row.append(
          mini(t('clubs.approve'), () => act('POST', '/members/' + encodeURIComponent(p.username) + '/approve')),
          mini(t('clubs.reject'), () => act('DELETE', '/members/' + encodeURIComponent(p.username))));
        return row;
      }) : [el('p', t('clubs.no_pending'), 'pnote')]));
    }

    $('cb-actions-th').hidden = !staff;
    $('cb-members-body').replaceChildren(...c.leaderboard.map((m) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const link = el('a', m.displayName);
      link.href = '/u/' + encodeURIComponent(m.username);
      name.append(window.PlatformShell.avatar(m.avatarUrl, m.displayName, 'pav--sm'), link);
      tr.append(name, el('td', t('clubs.role_' + m.role)));
      if (staff) {
        const td = document.createElement('td');
        td.className = 'num';
        const enc = encodeURIComponent(m.username);
        const canKick = m.role !== 'owner' && (role === 'owner' || m.role === 'member');
        if (canKick) td.append(mini(t('clubs.kick'), () => act('DELETE', '/members/' + enc, null, 'clubs.confirm_kick')));
        if (role === 'owner' && m.role !== 'owner') {
          td.append(' ', mini(t(m.role === 'officer' ? 'clubs.demote' : 'clubs.promote'),
            () => act('PUT', '/members/' + enc + '/role', { role: m.role === 'officer' ? 'member' : 'officer' })));
          td.append(' ', mini(t('clubs.transfer'), () => act('PUT', '/members/' + enc + '/role', { role: 'owner' }, 'clubs.confirm_transfer')));
        }
        tr.append(td);
      }
      return tr;
    }));
    $('cb-body').replaceChildren(...c.leaderboard.map((m) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const link = el('a', m.displayName);
      link.href = '/u/' + encodeURIComponent(m.username);
      name.append(window.PlatformShell.avatar(m.avatarUrl, m.displayName, 'pav--sm'), link);
      tr.append(el('td', String(m.rank)), name, el('td', m.rating == null ? '—' : String(m.rating), 'num'));
      return tr;
    }));

    $('cb-tabs').replaceChildren(...CATEGORIES.map((cat) => {
      const b = el('button', t('rankings.cat_' + cat), 'pchip');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(cat === state.category));
      b.onclick = () => { state.category = cat; load(); };
      return b;
    }));
    $('cb-tab-chat').hidden = !isMember();
    if (!isMember() && state.chat.loaded) resetChat();
    $('cb-content').hidden = false;
    showTab(currentTab());
  }

  async function load() {
    try {
      const res = await fetch(base() + '?category=' + state.category, { credentials: 'same-origin' });
      if (res.status === 404) { $('cb-status').textContent = t('clubs.not_found'); $('cb-content').hidden = true; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      $('cb-status').textContent = '';
      render(await res.json());
    } catch (_) {
      $('cb-status').textContent = t('clubs.error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.PlatformShell.build('clubs');
    $('cb-join').onclick = async () => { if (await act('POST', '/join')) load(); };
    $('cb-leave').onclick = async () => { if (await act('POST', '/leave', null, 'clubs.confirm_leave')) load(); };
    $('cb-delete').onclick = async () => { if (await act('DELETE', '', null, 'clubs.confirm_delete')) location.href = '/clubs.html'; };
    $('cb-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const body = { description: $('cb-desc-input').value };
      if (state.club.myRole === 'owner') body.joinPolicy = $('cb-policy').value;
      if (await act('PUT', '', body)) load();
    };
    $('cb-event-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const when = new Date($('cb-event-when').value); // datetime-local = viewer's local time
      if (Number.isNaN(when.getTime())) return;
      if (await act('POST', '/events', { title: $('cb-event-title').value, startsAt: when.toISOString() })) {
        $('cb-event-form').reset();
        load();
      }
    };
    for (const tab of TABS) {
      $('cb-tab-' + tab).addEventListener('click', () => showTab(tab, { updateHash: true }));
    }
    // Arrow keys move between tabs (WAI-ARIA tabs pattern).
    $('cb-tablist').addEventListener('keydown', (ev) => {
      const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const tabs = visibleTabs();
      const next = tabs[(tabs.indexOf(currentTab()) + d + tabs.length) % tabs.length];
      showTab(next, { updateHash: true });
      $('cb-tab-' + next).focus();
      ev.preventDefault();
    });
    $('cb-chat-older').onclick = () => fetchChat('older');
    $('cb-chat-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const text = $('cb-chat-input').value.trim();
      if (!text) return;
      if (await act('POST', '/messages', { text })) {
        $('cb-chat-input').value = '';
        await fetchChat('newer');
        const log = $('cb-chat-log');
        log.scrollTop = log.scrollHeight;
      }
    };
    setInterval(() => {
      if (!document.hidden && currentTab() === 'chat' && state.chat.loaded) fetchChat('newer');
    }, CHAT_POLL_MS);
    window.addEventListener('hashchange', () => showTab(currentTab()));
    load();
  });
})();
