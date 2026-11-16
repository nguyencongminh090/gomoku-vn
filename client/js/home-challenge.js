/**
 * home-challenge.js — Home "Thách đấu" (#361, T2): opponent picker under the button (bottom sheet ≤860px).
 *
 * HomeChallenge.open({ anchor, pick, ruleParts, onSent })
 *   anchor     the Thách đấu button (focus returns here; desktop popover sits under it)
 *   pick       the sentence's choice {rule, time, rated, wall, portal} — sent as a single game with the same
 *              settings a quick match with that pick would play (util.settings)
 *   ruleParts  label segments of the sentence, shown as "Cùng luật: …"
 *   onSent     (player) => void after POST /api/challenges succeeded
 * Opponents = friends (GET /api/friends, online flag) + visibly-online members I may challenge
 * (GET /api/challenges/online — one-shot, Home stays out of the `lobby` socket room, B229), merged by username.
 * "Tuỳ chọn khác" hands over to the full #222 ChallengeModal (series, board, stake…).
 * Members only (the caller hides the button for guests). DOM built with textContent only.
 */
(function (root) {
  'use strict';

  const t = (key, vars) => (typeof root.t === 'function' ? root.t(key, vars) : key);
  const SHEET_MQ = '(max-width: 860px)';
  const POPOVER_MIN_H = 460; // px under the button for the desktop popover; less → bottom sheet

  /** Quick-match time keys → clock (server MatchQueue.PRESETS; 'auto' plays its default m60, AUTO_DEFAULT). */
  const PRESETS = {
    '1+0': ['blitz', 60, 0], '1+1': ['blitz', 60, 1], '3+2': ['blitz', 180, 2], '5+3': ['blitz', 300, 3],
    '7+3': ['blitz', 420, 3], '10+0': ['blitz', 600, 0],
    m60: ['per_move', 60, 0], m45: ['per_move', 45, 0], m30: ['per_move', 30, 0], m5: ['per_move', 5, 0],
  };
  const AUTO_DEFAULT = 'm60';
  const BOARD = 17; // quick-match rooms use the server default board (RoomManager._validateSettings)

  const util = {
    /** The full #222 settings object for the sentence's pick: same game a quick match would seat. */
    settings(pick) {
      const [timerMode, timerSeconds, timerIncrementSeconds] = PRESETS[pick.time] || PRESETS[AUTO_DEFAULT];
      return {
        boardSize: BOARD, winningRule: pick.rule, ranked: pick.rated === true,
        ruleSwap2: false, ruleWall: pick.wall === true, rulePortal: pick.portal === true,
        timerMode, timerSeconds, timerIncrementSeconds,
      };
    },
    /** Friends first (online before offline), then online non-friends; one row per username; `q` on name/username. */
    merge(friends, online) {
      const byName = new Map();
      for (const f of friends) byName.set(f.username, { ...f, friend: true, online: f.online === true });
      for (const o of online) {
        const had = byName.get(o.username);
        if (had) had.online = true; else byName.set(o.username, { ...o, friend: false, online: true });
      }
      return [...byName.values()].sort((a, b) => (b.friend - a.friend) || (b.online - a.online) || a.displayName.localeCompare(b.displayName));
    },
    filter(people, tab, q) {
      const needle = String(q || '').trim().toLowerCase();
      return people.filter((p) => (tab === 'friends' ? p.friend : tab === 'online' ? p.online : true)
        && (!needle || p.displayName.toLowerCase().includes(needle) || p.username.toLowerCase().includes(needle)));
    },
  };

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  const avatar = (p) => (root.PlatformShell && root.PlatformShell.avatar
    ? root.PlatformShell.avatar(p.avatarUrl, p.displayName, 'pav--sm') : el('span', null, 'pav pav--sm'));

  async function getJson(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 401) { location.href = '/login.html'; throw new Error('401'); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  let active = null; // the one open picker

  function close(focusAnchor) {
    if (!active) return;
    const { panel, anchor, cleanup } = active;
    active = null;
    cleanup();
    panel.remove();
    anchor.setAttribute('aria-expanded', 'false');
    if (focusAnchor && anchor.isConnected) anchor.focus();
  }

  function open(opts) {
    const { anchor, pick, ruleParts = [], onSent } = opts;
    if (active) { const same = active.anchor === anchor; close(false); if (same) return null; }

    const panel = el('div', null, 'hch');
    panel.id = 'home-ch';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'home-ch-title');
    const head = el('div', null, 'hch__head');
    const title = el('h2', t('home.ch_title'), 'hch__title');
    title.id = 'home-ch-title';
    const x = el('button', '✕', 'hch__x');
    x.type = 'button';
    x.setAttribute('aria-label', t('modal.close'));
    x.addEventListener('click', () => close(true));
    head.append(title, x);

    const search = el('input', null, 'hch__search');
    search.type = 'search';
    search.placeholder = t('home.ch_search');
    search.setAttribute('aria-label', t('home.ch_search'));

    let tab = 'all';
    const tabs = el('div', null, 'hch__tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', t('home.ch_filter_aria'));
    const tabBtns = [['all', 'home.ch_all'], ['friends', 'home.ch_friends'], ['online', 'home.ch_online']].map(([k, key]) => {
      const b = el('button', t(key), 'hch__tab');
      b.type = 'button';
      b.dataset.tab = k;
      b.setAttribute('aria-pressed', String(k === tab));
      b.addEventListener('click', () => { tab = k; tabBtns.forEach((o) => o.setAttribute('aria-pressed', String(o === b))); render(); });
      tabs.appendChild(b);
      return b;
    });

    const note = el('p', t('challenge.loading'), 'hch__note');
    const list = el('ul', null, 'hch__list');
    list.setAttribute('aria-label', t('home.ch_list_aria'));
    const rules = el('p', null, 'hch__rules');
    rules.append(el('span', t('home.ch_with'), 'hch__rules-l'), ...ruleParts.map((p) => el('span', p, 'rtag')));
    const status = el('p', '', 'hch__status');
    status.setAttribute('role', 'status');
    const send = el('button', t('home.ch_pick'), 'hch__send');
    send.type = 'button';
    send.disabled = true;
    const more = el('button', t('home.ch_more'), 'link-action hch__more');
    more.type = 'button';
    const foot = el('div', null, 'hch__foot');
    foot.append(more, el('span', t('home.ch_ttl'), 'hch__ttl'));

    panel.append(head, search, tabs, note, list, rules, status, send, foot);

    let people = [];
    let chosen = null;
    const setChosen = (p) => {
      chosen = p;
      send.disabled = !p;
      send.textContent = p ? t('home.ch_send', { name: p.displayName }) : t('home.ch_pick');
      list.querySelectorAll('.hch__row').forEach((r) => r.setAttribute('aria-pressed', String(!!p && r.dataset.u === p.username)));
    };
    function render() {
      const shown = util.filter(people, tab, search.value);
      if (chosen && !shown.includes(chosen)) setChosen(null);
      note.textContent = shown.length ? '' : search.value.trim() ? t('challenge.no_match')
        : tab === 'friends' ? t('social.none_friends') : tab === 'online' ? t('home.ch_empty_online') : t('home.ch_empty');
      note.hidden = !note.textContent;
      list.replaceChildren(...shown.map((p) => {
        const li = el('li');
        const b = el('button', null, 'hch__row');
        b.type = 'button';
        b.dataset.u = p.username;
        b.setAttribute('aria-pressed', String(p === chosen));
        const av = el('span', null, 'hch__av' + (p.online ? ' is-on' : ''));
        av.appendChild(avatar(p));
        const name = el('span', null, 'hch__name');
        name.append(el('span', p.displayName, 'hch__dn'), el('span', p.online ? t('challenge.online') : t('challenge.offline'), 'hch__st'));
        b.append(av, name);
        if (p.friend) b.appendChild(el('span', t('home.ch_friend_tag'), 'hch__tag'));
        b.addEventListener('click', () => { setChosen(p); status.textContent = ''; });
        li.appendChild(b);
        return li;
      }));
    }
    search.addEventListener('input', render);

    async function doSend() {
      if (!chosen || send.disabled) return;
      const who = chosen;
      send.disabled = true;
      status.textContent = '';
      try {
        const res = await fetch('/api/challenges', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: who.username, settings: util.settings(pick), games: 1, stake: 'none' }),
        });
        if (res.status === 401) { location.href = '/login.html'; return; }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { status.textContent = res.status === 403 && !body.error ? t('challenge.members_only') : (body.error || t('friends.error')); return; }
        close(true);
        if (onSent) onSent(who, body);
      } catch (_) {
        status.textContent = t('friends.error');
      } finally {
        if (panel.isConnected) send.disabled = !chosen;
      }
    }
    send.addEventListener('click', doSend);
    more.addEventListener('click', () => {
      const to = chosen ? { username: chosen.username, displayName: chosen.displayName, avatarUrl: chosen.avatarUrl } : undefined;
      close(true); // focus back on Thách đấu first: the modal returns focus to whatever was focused when it opened
      const done = (c) => { if (onSent) onSent(to || null, c); }; // the POST reply (ChallengeService.view) carries no `to`
      if (root.ChallengeModal) root.ChallengeModal.open(to ? { to, onSent: done } : { onSent: done });
    });

    // Desktop: popover in .hq-go under the button; phone: fixed bottom sheet (CSS). Escape / outside click close.
    const host = anchor.parentElement;
    host.appendChild(panel);
    // The home screen doesn't scroll past the fold: a popover needs room under the button for search + a few rows + send,
    // otherwise (phones, short laptop windows) it becomes a bottom sheet.
    const below = root.innerHeight - anchor.getBoundingClientRect().bottom - 24;
    const sheet = !!(root.matchMedia && root.matchMedia(SHEET_MQ).matches) || below < POPOVER_MIN_H;
    panel.classList.toggle('hch--sheet', sheet);
    if (!sheet) {
      panel.style.setProperty('--ch-x', Math.max(0, anchor.offsetLeft) + 'px');
      panel.style.setProperty('--ch-max', below + 'px');
    }
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', panel.id);
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } };
    const onDown = (e) => {
      if (panel.contains(e.target) || anchor.contains(e.target)) return;
      // Sheet: the tap lands on the scrim — it only closes, never also activates what's under it.
      if (sheet) document.addEventListener('click', (c) => { c.preventDefault(); c.stopPropagation(); }, { capture: true, once: true });
      close(false);
    };
    panel.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    active = { panel, anchor, cleanup: () => document.removeEventListener('pointerdown', onDown, true) };
    search.focus();

    Promise.allSettled([getJson('/api/friends'), getJson('/api/challenges/online')]).then(([f, o]) => {
      if (!panel.isConnected) return;
      if (f.status === 'rejected' && o.status === 'rejected') { note.textContent = t('friends.error'); note.hidden = false; return; }
      people = util.merge(f.status === 'fulfilled' ? f.value.friends || [] : [], o.status === 'fulfilled' ? o.value.players || [] : []);
      render();
    });
    return panel;
  }

  root.HomeChallenge = { open, close: () => close(false), isOpen: () => !!active, util };
})(typeof window !== 'undefined' ? window : globalThis);
